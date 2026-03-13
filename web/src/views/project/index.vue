<template>
  <div class="projects-page page-container">
    <div class="page-header">
      <h1 class="flex-center"><el-icon class="mr-8">
          <Film />
        </el-icon>Anime</h1>
      <div class="header-actions">
        <el-button @click="$router.push('/setting')"><el-icon class="mr-4">
            <Setting />
          </el-icon>设置</el-button>
        <el-button type="primary" @click="showCreate = true"><el-icon class="mr-4">
            <Plus />
          </el-icon>新建项目</el-button>
      </div>
    </div>
    <div class="project-grid mt-24">
      <div v-for="p in projects" :key="p.id" class="project-card" @click="enterProject(p)">
        <div class="card-header">
          <h3>{{ p.name }}</h3>
          <div @click.stop>
            <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, p)">
              <el-button text size="small">⋯</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="delete" style="color:var(--danger)">删除项目</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <p class="card-intro">{{ p.intro || '暂无简介' }}</p>
        <div class="card-tags">
          <el-tag v-if="p.type" size="small" type="info">{{ p.type }}</el-tag>
          <el-tag v-for="(style, idx) in artStyleList(p.artStyle)" :key="idx" size="small" type="warning" class="art-style-tag">{{ style }}</el-tag>
        </div>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="showCreate" :title="editingProject ? '编辑项目' : '新建项目'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="项目名称"><el-input v-model="form.name" placeholder="项目名称" /></el-form-item>
        <el-form-item label="简介"><el-input v-model="form.intro" type="textarea" :rows="3"
            placeholder="项目简介/世界观" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" placeholder="选择类型">
            <el-option v-for="t in ['仙侠', '都市', '玄幻', '科幻', '悬疑', '古风', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="美术风格">
          <el-select
            v-model="form.artStyle"
            placeholder="选择风格"
            filterable
            allow-create
            multiple
            collapse-tags
          >
            <el-option-group label="日系动漫">
              <el-option label="日系动漫" value="动漫" />
              <el-option label="暗黑哥特动漫" value="暗黑哥特动漫" />
              <el-option label="赛璐璃风格" value="赛璐璃" />
            </el-option-group>
            <el-option-group label="国风风格">
              <el-option label="国风水墨" value="国风水墨" />
              <el-option label="古风插画" value="古风插画" />
            </el-option-group>
            <el-option-group label="特色风格">
              <el-option label="赛博朋克" value="赛博朋克" />
              <el-option label="蒸汽朋克" value="蒸汽朋克" />
              <el-option label="废土风格" value="废土风格" />
              <el-option label="3D渲染" value="3D渲染" />
            </el-option-group>
            <el-option-group label="艺术风格">
              <el-option label="油画质感" value="油画" />
              <el-option label="水彩风格" value="水彩" />
              <el-option label="像素风格" value="像素" />
              <el-option label="手绘涂鸦" value="手绘涂鸦" />
            </el-option-group>
          </el-select>
          <div class="form-tip">支持选择多个风格或输入自定义风格，逗号分隔</div>
        </el-form-item>
        <el-form-item label="视觉风格">
          <el-input v-model="form.styleGuide" type="textarea" :rows="4" placeholder="详细视觉风格指引（色调、光影、镜头风格、特效标识等）" />
        </el-form-item>
        <el-form-item label="视频比例">
          <el-radio-group v-model="form.videoRatio">
            <el-radio-button value="16:9">16:9 横屏</el-radio-button>
            <el-radio-button value="9:16">9:16 竖屏</el-radio-button>
            <el-radio-button value="1:1">1:1 方形</el-radio-button>
            <el-radio-button value="4:3">4:3 经典</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="submitProject">{{ editingProject ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import api from '../../utils/axios'
import { useAppStore } from '../../stores/app'
import type { Project } from '../../types'

const router = useRouter()
const appStore = useAppStore()
const projects = ref<Project[]>([])
const showCreate = ref(false)
const editingProject = ref<Project | null>(null)
const form = ref({ name: '', intro: '', type: '', artStyle: [] as string[], styleGuide: '', videoRatio: '16:9' })

onMounted(loadProjects)

function artStyleList(artStyle: string | null) {
  if (!artStyle) return []
  // 支持逗号分隔的字符串和数组格式
  return Array.isArray(artStyle) ? artStyle : artStyle.split(',').map(s => s.trim()).filter(Boolean)
}

async function loadProjects() {
  const res: any = await api.post('/api/project/list')
  projects.value = res.data || []
}

function enterProject(p: Project) {
  appStore.setProject(p)
  router.push(`/workspace/${p.id}/novel`)
}

function handleCommand(cmd: string, p: Project) {
  if (cmd === 'edit') {
    editingProject.value = p
    form.value = { name: p.name, intro: p.intro || '', type: p.type || '', artStyle: artStyleList(p.artStyle), styleGuide: p.styleGuide || '', videoRatio: p.videoRatio || '16:9' }
    showCreate.value = true
  } else if (cmd === 'delete') {
    ElMessageBox.confirm('确定删除该项目及所有数据？', '删除确认', { type: 'warning' }).then(async () => {
      await api.post('/api/project/delete', { id: p.id })
      ElMessage.success('已删除')
      loadProjects()
    }).catch(() => { })
  }
}

async function submitProject() {
  if (!form.value.name) { ElMessage.warning('请输入项目名称'); return }
  const submitData = {
    ...form.value,
    // 将数组转为逗号分隔的字符串存储
    artStyle: Array.isArray(form.value.artStyle) ? form.value.artStyle.join(',') : form.value.artStyle
  }
  if (editingProject.value) {
    await api.post('/api/project/update', { id: editingProject.value.id, ...submitData })
    ElMessage.success('已更新')
  } else {
    await api.post('/api/project/create', submitData)
    ElMessage.success('已创建')
  }
  showCreate.value = false
  editingProject.value = null
  form.value = { name: '', intro: '', type: '', artStyle: [], styleGuide: '', videoRatio: '16:9' }
  loadProjects()
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  font-size: 24px;
  color: var(--accent);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.project-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  cursor: pointer;
  transition: all .2s;
}

.project-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, .15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  font-size: 16px;
}

.card-intro {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 10px 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.art-style-tag {
  max-width: none;
}

.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
</style>
