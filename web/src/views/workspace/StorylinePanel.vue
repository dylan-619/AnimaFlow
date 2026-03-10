<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8"><Compass /></el-icon> 故事线</h2>
      <el-button type="primary" @click="generate" :loading="generating">{{ storyline ? '重新生成' : '生成故事线' }}</el-button>
    </div>
    <TaskProgress :visible="!!currentTaskId" :taskId="currentTaskId" @close="onTaskClose" />
    <div v-if="storyline?.content" class="content-box mt-16">
      <el-input v-model="storyline.content" type="textarea" :rows="25" @blur="save" />
      <el-button class="mt-12" @click="save">保存修改</el-button>
    </div>
    <el-empty v-else-if="!generating" description="尚未生成故事线" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../../utils/axios'
import { useTaskStore } from '../../stores/task'
import TaskProgress from '../../components/TaskProgress.vue'
import type { Storyline } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const taskStore = useTaskStore()
const storyline = ref<Storyline | null>(null)
const generating = ref(false)
const currentTaskId = ref('')

onMounted(load)

async function load() {
  const res: any = await api.post('/api/storyline/get', { projectId })
  storyline.value = res.data || null
}

async function generate() {
  generating.value = true
  try {
    const taskId = await taskStore.createTask(projectId, 'storyline')
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('故事线生成完成')
    load()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { generating.value = false }
}

async function save() {
  if (!storyline.value) return
  await api.post('/api/storyline/update', { projectId, content: storyline.value.content })
  ElMessage.success('已保存')
}

function onTaskClose() { currentTaskId.value = '' }
</script>

<style scoped>
.panel-header { display: flex; justify-content: space-between; align-items: center; }
.panel-header h2 { font-size: 18px; }
.content-box :deep(.el-textarea__inner) { font-size: 14px; line-height: 1.8; }
</style>
