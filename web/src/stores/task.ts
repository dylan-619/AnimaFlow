import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../utils/axios'
import type { TaskInfo } from '../types'

export const useTaskStore = defineStore('task', () => {
    const activeTasks = ref<Map<string, TaskInfo>>(new Map())
    const pollingTimers = ref<Map<string, number>>(new Map())

    // 创建任务
    async function createTask(projectId: number, type: string, input?: any): Promise<string> {
        const res: any = await api.post('/api/task/create', { projectId, type, input })
        const taskId = res.data.taskId
        activeTasks.value.set(taskId, {
            id: taskId, type, status: 'pending', progress: 0, output: null, error: null,
        })
        startPolling(taskId)
        return taskId
    }

    // 轮询任务状态
    function startPolling(taskId: string, interval = 2000) {
        if (pollingTimers.value.has(taskId)) return

        const timer = window.setInterval(async () => {
            try {
                const res: any = await api.post('/api/task/status', { taskId })
                const task: TaskInfo = res.data
                activeTasks.value.set(taskId, task)

                if (task.status === 'completed' || task.status === 'failed') {
                    stopPolling(taskId)
                }
            } catch {
                stopPolling(taskId)
            }
        }, interval)

        pollingTimers.value.set(taskId, timer)
    }

    function stopPolling(taskId: string) {
        const timer = pollingTimers.value.get(taskId)
        if (timer) {
            clearInterval(timer)
            pollingTimers.value.delete(taskId)
        }
    }

    // 等待任务完成
    function waitForTask(taskId: string): Promise<TaskInfo> {
        return new Promise((resolve, reject) => {
            const check = () => {
                const task = activeTasks.value.get(taskId)
                if (task?.status === 'completed') {
                    resolve(task)
                } else if (task?.status === 'failed') {
                    reject(new Error(task.error || '任务失败'))
                } else {
                    setTimeout(check, 1000)
                }
            }
            check()
        })
    }

    // 轮询已存在的任务（用于批量生成的任务）
    async function pollExistingTask(taskId: string) {
        // 先添加到活跃任务中（初始状态）
        activeTasks.value.set(taskId, {
            id: taskId, type: 'video_generate', status: 'pending', progress: 0, output: null, error: null,
        })
        // 启动轮询
        startPolling(taskId, 2000)
    }

    function getTask(taskId: string): TaskInfo | undefined {
        return activeTasks.value.get(taskId)
    }

    return { activeTasks, createTask, startPolling, stopPolling, waitForTask, getTask, pollExistingTask }
})
