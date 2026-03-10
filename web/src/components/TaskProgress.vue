<template>
  <el-dialog :model-value="visible" :title="statusText" width="360px" :close-on-click-modal="false"
    @close="$emit('close')">
    <div class="task-progress-content">
      <div v-if="task?.status === 'running' || task?.status === 'pending'" class="loading-wrapper">
        <el-icon class="is-loading loading-icon">
          <Loading />
        </el-icon>
        <span class="loading-text">{{ task?.status === 'pending' ? '等待处理中...' : '正在努力生成中，请耐心等待...' }}</span>
        <span class="progress-info">{{ task?.progress ?? 0 }}%</span>
      </div>
      <div v-else-if="task?.status === 'completed'" class="status-wrapper success">
        <el-icon class="status-icon">
          <CircleCheckFilled />
        </el-icon>
        <span class="status-text">生成任务已完成</span>
      </div>
      <div v-else-if="task?.status === 'failed'" class="status-wrapper error">
        <el-icon class="status-icon">
          <CircleCloseFilled />
        </el-icon>
        <span class="status-text">生成失败</span>
      </div>

      <p v-if="task?.error" class="error-text mt-16">{{ task.error }}</p>
    </div>
    <template #footer>
      <el-button @click="$emit('close')">{{ task?.status === 'running' || task?.status === 'pending' ? '后台运行' : '关闭'
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTaskStore } from '../stores/task'
import type { TaskInfo } from '../types'
import { Loading, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'

const props = defineProps<{ visible: boolean; taskId: string }>()
defineEmits<{ close: [] }>()

const taskStore = useTaskStore()
const task = computed<TaskInfo | undefined>(() => taskStore.getTask(props.taskId))

const statusText = computed(() => {
  switch (task.value?.status) {
    case 'pending': return '等待中...'
    case 'running': return '生成中...'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '未知'
  }
})

</script>

<style scoped>
.task-progress-content {
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.loading-wrapper,
.status-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.loading-icon {
  font-size: 48px;
  color: var(--accent);
}

.loading-text {
  font-size: 14px;
  color: var(--text-primary);
  margin-top: 8px;
}

.progress-info {
  font-size: 24px;
  font-weight: 600;
  color: var(--accent);
}

.status-icon {
  font-size: 48px;
}

.status-wrapper.success .status-icon {
  color: var(--success);
}

.status-wrapper.error .status-icon {
  color: var(--danger);
}

.status-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.error-text {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
  background: rgba(245, 108, 108, 0.1);
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid rgba(245, 108, 108, 0.2);
  width: 100%;
  box-sizing: border-box;
}
</style>
