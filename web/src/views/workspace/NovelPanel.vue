<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8">
          <Notebook />
        </el-icon> 小说内容</h2>
      <div class="header-actions">
        <el-button type="primary" @click="showUpload = true">上传小说</el-button>
      </div>
    </div>

    <div v-if="chapters.length" class="chapter-list mt-16">
      <div class="chapter-stat">共 {{ chapters.length }} 章</div>
      <div v-for="ch in chapters" :key="ch.id" class="chapter-item">
        <div class="chapter-head" @click="toggleExpand(ch.id)">
          <div class="head-left">
            <span>第{{ ch.chapterIndex }}章 {{ ch.chapter || '' }}</span>
            <span class="word-count ml-8">{{ (ch.chapterData || '').length }}字</span>
          </div>
          <div class="head-actions" @click.stop>
            <el-button link type="primary" @click="editChapter(ch)">编辑</el-button>
            <el-button link type="danger" @click="deleteChapter(ch)">删除</el-button>
          </div>
        </div>
        <div v-if="expandedId === ch.id" class="chapter-body" @click.stop>
          <div class="chapter-preview">{{ ch.chapterData }}</div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂未上传小说，请点击上方按钮" />

    <!-- 上传弹窗 -->
    <el-dialog v-model="showUpload" title="上传小说" width="600px">
      <el-input v-model="rawText" type="textarea" :rows="15" placeholder="粘贴小说全文，系统将自动按章节拆分..." />
      <template #footer>
        <el-button @click="showUpload = false">取消</el-button>
        <el-button type="primary" @click="parseAndUpload" :loading="uploading">解析并上传</el-button>
      </template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showEdit" title="编辑章节" width="800px">
      <el-form label-position="top">
        <el-form-item label="章节名">
          <el-input v-model="editForm.chapter" placeholder="输入章节名" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="editForm.chapterData" type="textarea" :rows="20" placeholder="章节正文..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="savingEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../../utils/axios'
import type { Novel } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const chapters = ref<Novel[]>([])
const showUpload = ref(false)
const rawText = ref('')
const expandedId = ref<number | null>(null)
const uploading = ref(false)

const showEdit = ref(false)
const savingEdit = ref(false)
const editForm = ref({ id: -1, chapterIndex: 1, chapter: '', chapterData: '' })

onMounted(loadChapters)

async function loadChapters() {
  const res: any = await api.post('/api/novel/list', { projectId })
  chapters.value = res.data || []
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

function editChapter(ch: Novel) {
  editForm.value = {
    id: ch.id,
    chapterIndex: ch.chapterIndex,
    chapter: ch.chapter || '',
    chapterData: ch.chapterData || ''
  }
  showEdit.value = true
}

async function saveEdit() {
  if (!editForm.value.chapter) { editForm.value.chapter = `第${editForm.value.chapterIndex}章` } // Simplified fallback, doesn't have chapterIndex but good enough or we can use existing chapter index fallback logic later
  savingEdit.value = true
  try {
    await api.post('/api/novel/update', {
      id: editForm.value.id,
      chapter: editForm.value.chapter,
      chapterData: editForm.value.chapterData
    })
    ElMessage.success('保存成功')
    showEdit.value = false
    loadChapters()
  } finally {
    savingEdit.value = false
  }
}

async function deleteChapter(ch: Novel) {
  try {
    await ElMessageBox.confirm(`确定要删除“${ch.chapter || '该章节'}”吗？删除后无法恢复。`, '提示', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消'
    })
    await api.post('/api/novel/delete', { ids: [ch.id] })
    ElMessage.success('删除成功')
    if (expandedId.value === ch.id) expandedId.value = null
    loadChapters()
  } catch (err) {
    // cancelled
  }
}

async function parseAndUpload() {
  if (!rawText.value.trim()) { ElMessage.warning('请粘贴小说内容'); return }
  uploading.value = true
  try {
    // 正则拆分：由于使用了捕获组 (...)，split 返回的具体格式会是： 
    // [ "序章部分", "章节标题1", "章节1内容", "章节标题2", "章节2内容", ... ]
    const regex = /(?:^|\n)(第[一二三四五六七八九十百千\d]+[章节回][\s:：]?[^\n]*)/
    const parts = rawText.value.split(regex)

    const parsed: { chapterIndex: number; chapter: string; chapterData: string }[] = []

    // 如果存在小说头部的引言、序章内容
    if (parts[0] && parts[0].trim()) {
      parsed.push({ chapterIndex: 1, chapter: '序章', chapterData: parts[0].trim() })
    }

    // 以 2 为步长，提取从 parts[1] 开始的 标题+内容 组合
    for (let i = 1; i < parts.length; i += 2) {
      const title = parts[i] || ''
      const content = parts[i + 1] || ''
      if (title.trim() || content.trim()) {
        parsed.push({
          chapterIndex: parsed.length + 1,
          chapter: title.trim() || `第${parsed.length + 1}章`,
          chapterData: content.trim(),
        })
      }
    }

    await api.post('/api/novel/batchAdd', { projectId, chapters: parsed })
    ElMessage.success(`成功上传 ${parsed.length} 章`)
    showUpload.value = false
    rawText.value = ''
    loadChapters()
  } finally { uploading.value = false }
}
</script>

<style scoped>
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  font-size: 18px;
}

.chapter-stat {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 12px;
}

.chapter-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: all .15s;
}

.chapter-item:hover {
  border-color: var(--accent);
}

.chapter-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
}

.head-left {
  display: flex;
  align-items: center;
}

.word-count {
  color: var(--text-secondary);
  font-size: 12px;
}

.head-actions {
  display: flex;
  gap: 8px;
}

.chapter-body {
  padding: 0 16px 16px;
}

.chapter-preview {
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 14px;
  color: var(--text-primary);
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-body);
  padding: 12px;
  border-radius: 6px;
}
</style>
