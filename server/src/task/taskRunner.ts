import db from '../db/index.js';
import type { Task, TaskType, TaskHandler } from '../types/index.js';

// 任务 Handler 注册表（由各 service 文件注册）
const handlers = new Map<TaskType, TaskHandler>();

export function registerTaskHandler(type: TaskType, handler: TaskHandler) {
    handlers.set(type, handler);
}

/**
 * 串行任务队列，避免 SQLite 并发写问题。
 * 支持多个任务排队，逐个执行。
 */
class TaskRunner {
    private queue: string[] = [];
    private running = false;

    async enqueue(taskId: string) {
        this.queue.push(taskId);
        if (!this.running) this.processNext();
    }

    private async processNext() {
        if (this.queue.length === 0) {
            this.running = false;
            return;
        }
        this.running = true;
        const taskId = this.queue.shift()!;

        // 读取任务
        const task: Task | undefined = await db('t_task').where('id', taskId).first();
        if (!task || task.status !== 'pending') {
            this.processNext();
            return;
        }

        // 标记 running
        await db('t_task').where('id', taskId).update({ status: 'running', updatedAt: Date.now() });

        const handler = handlers.get(task.type);
        if (!handler) {
            await db('t_task').where('id', taskId).update({
                status: 'failed',
                error: `未知的任务类型: ${task.type}`,
                updatedAt: Date.now(),
            });
            this.processNext();
            return;
        }

        try {
            const updateProgress = async (progress: number) => {
                await db('t_task').where('id', taskId).update({ progress, updatedAt: Date.now() });
            };

            const result = await handler(task, updateProgress);

            await db('t_task').where('id', taskId).update({
                status: 'completed',
                output: JSON.stringify(result),
                progress: 100,
                updatedAt: Date.now(),
            });
        } catch (err: any) {
            await db('t_task').where('id', taskId).update({
                status: 'failed',
                error: err.message || '任务执行失败',
                updatedAt: Date.now(),
            });
        }

        this.processNext();
    }
}

export const taskRunner = new TaskRunner();
