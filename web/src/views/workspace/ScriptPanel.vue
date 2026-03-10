<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8"><EditPen /></el-icon> 剧本</h2>
      <el-button type="primary" @click="generateAll" :loading="generating">批量生成剧本</el-button>
    </div>
    <TaskProgress :visible="!!currentTaskId" :taskId="currentTaskId" @close="currentTaskId = ''" />
    <div v-if="scripts.length" class="script-list mt-16">
      <el-collapse accordion>
        <el-collapse-item v-for="s in scripts" :key="s.id" :name="s.id">
          <template #title>
            <span :class="{ 'has-content': !!s.content }">{{ s.name || `剧本 #${s.id}` }}</span>
            <el-tag v-if="!s.content" size="small" type="info" style="margin-left:8px">待生成</el-tag>
          </template>
          <div class="script-content">
            <el-button v-if="!s.content" size="small" type="primary" @click="generateOne(s)" :loading="generating">生成本集剧本</el-button>
            <el-input v-if="s.content" v-model="s.content" type="textarea" :rows="20" @blur="saveScript(s)" />
            <el-button v-if="s.content" class="mt-12" @click="saveScript(s)">保存</el-button>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
    <el-empty v-else description="请先生成大纲，大纲生成时会自动创建空剧本" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../../utils/axios'
import { useTaskStore } from '../../stores/task'
import TaskProgress from '../../components/TaskProgress.vue'
import type { Script } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const taskStore = useTaskStore()
const scripts = ref<Script[]>([])
const generating = ref(false)
const currentTaskId = ref('')

onMounted(load)

async function load() {
  const res: any = await api.post('/api/script/list', { projectId })
  scripts.value = res.data || []
}

async function generateOne(s: Script) {
  if (!s.outlineId) { ElMessage.warning('该剧本缺少关联大纲'); return }
  generating.value = true
  try {
    const taskId = await taskStore.createTask(projectId, 'script', { outlineId: s.outlineId })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('剧本生成完成')
    load()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { generating.value = false }
}

async function generateAll() {
  generating.value = true
  try {
    for (const s of scripts.value) {
      if (!s.content && s.outlineId) {
        const taskId = await taskStore.createTask(projectId, 'script', { outlineId: s.outlineId })
        currentTaskId.value = taskId
        await taskStore.waitForTask(taskId)
      }
    }
    ElMessage.success('全部剧本生成完成')
    load()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { generating.value = false }
}

async function saveScript(s: Script) {
  await api.post('/api/script/update', { id: s.id, content: s.content })
  ElMessage.success('已保存')
}
</script>

<style scoped>
.panel-header { display: flex; justify-content: space-between; align-items: center; }
.panel-header h2 { font-size: 18px; }
.has-content { font-weight: 600; }
.script-content { padding: 8px 0; }
.script-content :deep(.el-textarea__inner) { font-size: 14px; line-height: 1.8; }
</style>
