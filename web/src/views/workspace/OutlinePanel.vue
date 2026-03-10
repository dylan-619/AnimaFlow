<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8"><Tickets /></el-icon> 大纲</h2>
      <div class="header-actions">
        <el-input-number v-model="episodeCount" :min="1" :max="100" size="small" style="width:120px" />
        <span class="hint">集</span>
        <el-button type="primary" @click="generate" :loading="generating">生成大纲</el-button>
      </div>
    </div>
    <TaskProgress :visible="!!currentTaskId" :taskId="currentTaskId" @close="onTaskClose" />
    <div v-if="outlines.length" class="outline-list mt-16">
      <el-collapse accordion>
        <el-collapse-item v-for="o in outlines" :key="o.id" :name="o.id">
          <template #title>
            <div class="ep-title-row">
              <span class="ep-title">第{{ o.data.episodeIndex }}集：{{ o.data.title }}</span>
              <el-button type="danger" link size="small" @click.stop="deleteOutline(o)" class="delete-btn">
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </template>
          <div class="ep-detail">
            <div class="detail-section">
              <label>剧情主干</label>
              <el-input v-model="o.data.outline" type="textarea" :rows="4" @blur="updateOutline(o)" />
            </div>
            <div class="detail-section">
              <label>核心冲突</label>
              <el-input v-model="o.data.coreConflict" @blur="updateOutline(o)" />
            </div>
            <div class="detail-row">
              <div><label>场景</label><div class="tag-list"><el-tag v-for="s in o.data.scenes" :key="s.name" size="small">{{ s.name }}</el-tag></div></div>
              <div><label>角色</label><div class="tag-list"><el-tag v-for="c in o.data.characters" :key="c.name" size="small" type="success">{{ c.name }}</el-tag></div></div>
              <div><label>道具</label><div class="tag-list"><el-tag v-for="p in o.data.props" :key="p.name" size="small" type="warning">{{ p.name }}</el-tag></div></div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
    <el-empty v-else-if="!generating" description="尚未生成大纲" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../../utils/axios'
import { useTaskStore } from '../../stores/task'
import TaskProgress from '../../components/TaskProgress.vue'
import type { Outline } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const taskStore = useTaskStore()
const outlines = ref<Outline[]>([])
const episodeCount = ref(1)
const generating = ref(false)
const currentTaskId = ref('')

onMounted(load)

async function load() {
  const res: any = await api.post('/api/outline/list', { projectId })
  outlines.value = res.data || []
}

async function generate() {
  generating.value = true
  try {
    const taskId = await taskStore.createTask(projectId, 'outline', { episodeCount: episodeCount.value, episodeDuration: 60, overwrite: true })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('大纲生成完成')
    load()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { generating.value = false }
}

async function updateOutline(o: Outline) {
  await api.post('/api/outline/update', { id: o.id, data: o.data })
  ElMessage.success('已保存')
}

async function deleteOutline(o: Outline) {
  try {
    await ElMessageBox.confirm(
      `确定删除「第${o.data.episodeIndex}集：${o.data.title}」吗？关联的剧本和分镜也会被一并删除。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await api.post('/api/outline/delete', { ids: [o.id] })
    ElMessage.success('已删除')
    load()
  } catch { /* 用户取消 */ }
}

function onTaskClose() { currentTaskId.value = '' }
</script>

<style scoped>
.panel-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.panel-header h2 { font-size: 18px; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.hint { color: var(--text-secondary); font-size: 13px; }
.ep-title-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 8px; }
.ep-title { font-weight: 600; }
.delete-btn { opacity: 0; transition: opacity 0.2s; }
.ep-title-row:hover .delete-btn { opacity: 1; }
.ep-detail { padding: 8px 0; }
.detail-section { margin-bottom: 16px; }
.detail-section label { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; display: block; }
.detail-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.detail-row label { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; display: block; }
.tag-list { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
