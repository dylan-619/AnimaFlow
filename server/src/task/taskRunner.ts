import db from '../db/index.js';
import type { Task, TaskType, TaskHandler } from '../types/index.js';

// 任务 Handler 注册表（由各 service 文件注册）
const handlers = new Map<TaskType, TaskHandler>();

export function registerTaskHandler(type: TaskType, handler: TaskHandler) {
    handlers.set(type, handler);
}

/**
 * 任务队列管理器，支持串行和并行处理。
 * 🔴 新增：失败自动重试机制，指数退避策略。
 * 🔴 新增：并行任务处理，批量生成优化。
 */
class TaskRunner {
    private queue: number[] = [];
    private running = false;

    // 🔴 新增：并行配置
    private maxConcurrent = 3; // 最大并行任务数
    private activeTasks = new Set<number>(); // 当前活跃任务集合

    // 🔴 新增：重试配置
    private readonly MAX_RETRIES = 3; // 最大重试次数
    private readonly RETRY_DELAYS = [1000, 2000, 4000]; // 指数退避延迟（毫秒）
    private readonly RETRYABLE_ERRORS = [
        'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED',
        'fetch failed', 'network error', 'timeout',
        'rate limit', '429', '503', '502', '500'
    ]; // 可重试的错误类型

    async enqueue(taskId: number | string) {
        this.queue.push(taskId as any);
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

        // 🔴 新增：获取当前重试次数（从任务的 error 字段解析，如果没有则为 0）
        let retryCount = 0;
        if (task.error && task.error.includes('[重试')) {
            const match = task.error.match(/\[重试(\d+)\/3\]/);
            if (match) retryCount = parseInt(match[1]);
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

            // 🔴 新增：成功后清除重试计数（如果有）
            if (retryCount > 0) {
                console.log(`[任务重试] 任务 ${taskId} 在第 ${retryCount} 次重试后成功`);
            }
        } catch (err: any) {
            const errorMsg = err.message || '任务执行失败';

            // 🔴 新增：判断是否为可重试错误
            const isRetryable = this.RETRYABLE_ERRORS.some(e =>
                errorMsg.toLowerCase().includes(e.toLowerCase())
            );

            if (isRetryable && retryCount < this.MAX_RETRIES) {
                // 可重试且未达到最大重试次数
                const delay = this.RETRY_DELAYS[retryCount];
                const nextRetryCount = retryCount + 1;

                console.log(`[任务重试] 任务 ${taskId} 失败: ${errorMsg}, 将在 ${delay}ms 后重试 (${nextRetryCount}/${this.MAX_RETRIES})`);

                // 延迟后重新入队
                setTimeout(() => {
                    // 更新任务状态为 pending，并记录重试信息
                    db('t_task').where('id', taskId).update({
                        status: 'pending',
                        error: `[重试${nextRetryCount}/${this.MAX_RETRIES}] ${errorMsg}`,
                        updatedAt: Date.now(),
                    }).then(() => {
                        this.enqueue(taskId);
                    });
                }, delay);
            } else {
                // 不可重试或已达到最大重试次数
                const finalError = retryCount > 0
                    ? `[已重试${retryCount}次] ${errorMsg}`
                    : errorMsg;

                await db('t_task').where('id', taskId).update({
                    status: 'failed',
                    error: finalError,
                    updatedAt: Date.now(),
                });

                if (retryCount >= this.MAX_RETRIES) {
                    console.error(`[任务重试] 任务 ${taskId} 已达到最大重试次数 (${this.MAX_RETRIES})，标记为失败`);
                } else {
                    console.error(`[任务重试] 任务 ${taskId} 遇到不可重试错误: ${errorMsg}`);
                }
            }
        }

        this.processNext();
    }

    // ==================== 🔴 新增：批量生成优化功能 ====================

    /**
     * 批量并行处理任务（新增）
     * 根据任务类型智能分配并行度
     */
    async enqueueBatch(taskIds: (number | string)[], options?: { concurrency?: number }) {
        try {
            const { concurrency = this.maxConcurrent } = options || {};

            console.log(`[批量任务] 入队 ${taskIds.length} 个任务，并行度=${concurrency}`);
            console.log(`[批量任务] 任务ID列表: [${taskIds.join(', ')}]`);

            // 按任务类型分组
            console.log(`[批量任务] 开始按类型分组任务...`);
            const taskGroups = await this.groupTasksByType(taskIds);
            const groupKeys = Object.keys(taskGroups);
            console.log(`[批量任务] 分组结果: ${groupKeys.length} 个类型分组`);
            console.log(`[批量任务] 分组详情: ${JSON.stringify(
                Object.fromEntries(
                    groupKeys.map(key => [key, taskGroups[key].length])
                )
            )}`);

            if (groupKeys.length === 0) {
                console.error(`[批量任务] 错误: 任务分组为空，所有任务可能无效`);
                return;
            }

            // 处理每组任务
            for (const [type, ids] of Object.entries(taskGroups)) {
                const numIds = ids as number[];
                console.log(`[批量任务] 处理任务组: type=${type}, count=${numIds.length}`);

                // 图像生成和视频生成可并行
                const canParallel = ['storyboard_image', 'video_generate', 'asset_image'].includes(type);
                console.log(`[批量任务] 任务类型 ${type} 是否可并行: ${canParallel}`);

                if (canParallel) {
                    // 并行处理
                    console.log(`[批量任务] 启动并行处理，任务数=${numIds.length}, 并行度=${concurrency}`);
                    await this.processParallel(numIds, concurrency);
                    console.log(`[批量任务] 并行处理完成: type=${type}`);
                } else {
                    // 串行处理
                    console.log(`[批量任务] 启动串行处理，任务数=${numIds.length}`);
                    for (const id of numIds) {
                        await this.enqueue(id);
                        await this.waitForCompletion(id);
                    }
                    console.log(`[批量任务] 串行处理完成: type=${type}`);
                }
            }

            console.log(`[批量任务] 所有任务组处理完成`);
        } catch (err: any) {
            console.error(`[批量任务] 处理失败:`, err);
            console.error(`[批量任务] 错误堆栈:`, err.stack);
            throw err;
        }
    }

    /**
     * 并行处理任务组（新增）
     */
    private async processParallel(taskIds: number[], maxConcurrent: number) {
        console.log(`[并行处理] 开始并行处理，任务数=${taskIds.length}, 并行度=${maxConcurrent}`);

        const batches: number[][] = [];

        // 分批次
        for (let i = 0; i < taskIds.length; i += maxConcurrent) {
            batches.push(taskIds.slice(i, i + maxConcurrent));
        }

        console.log(`[并行处理] ${taskIds.length} 个任务分为 ${batches.length} 批次`);

        // 逐批并行执行
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`[并行处理] 执行第 ${i + 1}/${batches.length} 批次，${batch.length} 个任务`);
            console.log(`[并行处理] 批次任务ID: [${batch.join(', ')}]`);

            try {
                // 并行执行当前批次
                const promises = batch.map(taskId => {
                    console.log(`[并行处理] 启动任务 ${taskId}`);
                    return this.executeTask(taskId);
                });

                const results = await Promise.allSettled(promises);

                // 统计结果
                const fulfilled = results.filter(r => r.status === 'fulfilled').length;
                const rejected = results.filter(r => r.status === 'rejected').length;

                console.log(`[并行处理] 批次 ${i + 1} 完成: 成功 ${fulfilled}, 失败 ${rejected}`);

                if (rejected > 0) {
                    results.forEach((result, idx) => {
                        if (result.status === 'rejected') {
                            console.error(`[并行处理] 任务 ${batch[idx]} 失败:`, result.reason);
                        }
                    });
                }
            } catch (err: any) {
                console.error(`[并行处理] 批次 ${i + 1} 执行异常:`, err);
            }
        }

        console.log(`[并行处理] 所有批次处理完成`);
    }

    /**
     * 执行单个任务（新增，从processNext中提取）
     */
    private async executeTask(taskId: number): Promise<void> {
        // 避免重复执行
        if (this.activeTasks.has(taskId)) {
            console.log(`[任务执行] 任务 ${taskId} 已在执行中，跳过`);
            return;
        }
        
        this.activeTasks.add(taskId);

        try {
            // 读取任务
            const task: Task | undefined = await db('t_task').where('id', taskId).first();
            if (!task || task.status !== 'pending') {
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
                return;
            }

            // 获取当前重试次数
            let retryCount = 0;
            if (task.error && task.error.includes('[重试')) {
                const match = task.error.match(/\[重试(\d+)\/3\]/);
                if (match) retryCount = parseInt(match[1]);
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

                if (retryCount > 0) {
                    console.log(`[任务重试] 任务 ${taskId} 在第 ${retryCount} 次重试后成功`);
                }
            } catch (err: any) {
                const errorMsg = err.message || '任务执行失败';

                const isRetryable = this.RETRYABLE_ERRORS.some(e =>
                    errorMsg.toLowerCase().includes(e.toLowerCase())
                );

                if (isRetryable && retryCount < this.MAX_RETRIES) {
                    const delay = this.RETRY_DELAYS[retryCount];
                    const nextRetryCount = retryCount + 1;

                    console.log(`[任务重试] 任务 ${taskId} 失败: ${errorMsg}, 将在 ${delay}ms 后重试 (${nextRetryCount}/${this.MAX_RETRIES})`);

                    setTimeout(() => {
                        db('t_task').where('id', taskId).update({
                            status: 'pending',
                            error: `[重试${nextRetryCount}/${this.MAX_RETRIES}] ${errorMsg}`,
                            updatedAt: Date.now(),
                        }).then(() => {
                            this.activeTasks.delete(taskId);
                            this.enqueue(taskId);
                        });
                    }, delay);
                    return;
                } else {
                    const finalError = retryCount > 0
                        ? `[已重试${retryCount}次] ${errorMsg}`
                        : errorMsg;

                    await db('t_task').where('id', taskId).update({
                        status: 'failed',
                        error: finalError,
                        updatedAt: Date.now(),
                    });

                    if (retryCount >= this.MAX_RETRIES) {
                        console.error(`[任务重试] 任务 ${taskId} 已达到最大重试次数 (${this.MAX_RETRIES})，标记为失败`);
                    } else {
                        console.error(`[任务重试] 任务 ${taskId} 遇到不可重试错误: ${errorMsg}`);
                    }
                }
            }
        } finally {
            this.activeTasks.delete(taskId);
        }
    }

    /**
     * 按任务类型分组（新增）
     */
    private async groupTasksByType(taskIds: number[]): Promise<Record<string, number[]>> {
        console.log(`[任务分组] 开始分组，任务ID数量=${taskIds.length}`);
        console.log(`[任务分组] 查询数据库获取任务详情...`);

        // 等待一小段时间确保数据库事务提交（增加到 300ms）
        await new Promise(resolve => setTimeout(resolve, 300));

        const tasks = await db('t_task').whereIn('id', taskIds).orderBy('priority', 'desc');
        console.log(`[任务分组] 查询到 ${tasks.length} 个任务记录`);

        if (tasks.length === 0) {
            console.error(`[任务分组] 警告: 从数据库查询到0个任务记录`);
            console.error(`[任务分组] 可能原因: 任务ID不存在或任务已删除`);
        } else {
            // 打印前3个任务的信息用于调试
            console.log(`[任务分组] 任务样本 (前3个):`);
            tasks.slice(0, 3).forEach((task, idx) => {
                console.log(`  [${idx + 1}] id=${task.id}, type=${task.type}, status=${task.status}, priority=${task.priority}`);
            });
        }

        const groups: Record<string, number[]> = {};
        for (const task of
 tasks) {
            if (!groups[task.type]) groups[task.type] = [];
            groups[task.type].push(task.id);
        }

        const groupSummary = Object.fromEntries(
            Object.entries(groups).map(([type, ids]) => [type, ids.length])
        );
        console.log(`[任务分组] 分组汇总: ${JSON.stringify(groupSummary)}`);

        return groups;
    }

    /**
     * 等待任务完成（新增）
     */
    private async waitForCompletion(taskId: number, timeout: number = 300000): Promise<void> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const task = await db('t_task').where('id', taskId).first();
            
            if (task?.status === 'completed' || task?.status === 'failed') {
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error(`任务 ${taskId} 超时`);
    }

    /**
     * 批量任务优先级调度（新增）
     */
    async scheduleBatchTasks(tasks: any[]): Promise<{ scheduled: number; batches: number }> {
        // 按依赖关系排序
        const sortedTasks = this.topologicalSort(tasks);
        
        // 按类型分组
        const groups: Record<string, any[]> = {};
        for (const task of sortedTasks) {
            if (!groups[task.type]) groups[task.type] = [];
            groups[task.type].push(task);
        }
        
        // 创建批量任务记录
        const taskIds: number[] = [];
        for (const task of sortedTasks) {
            const [id] = await db('t_task').insert({
                projectId: task.projectId,
                type: task.type,
                input: JSON.stringify(task.input || {}),
                status: 'pending',
                priority: task.priority || 5,
                createdAt: Date.now(),
            });

            taskIds.push(id);
        }
        
        console.log(`[批量调度] 已调度 ${taskIds.length} 个任务，${Object.keys(groups).length} 种类型`);
        
        return { 
            scheduled: taskIds.length, 
            batches: Object.keys(groups).length 
        };
    }

    /**
     * 拓扑排序（处理任务依赖）（新增）
     */
    private topologicalSort(tasks: any[]): any[] {
        // 定义任务类型依赖顺序
        const typeOrder = [
            'outline',           // 1. 大纲生成
            'script',            // 2. 剧本生成
            'assets_extract',    // 3. 资产提取
            'assets_image',      // 4. 资产图生成
            'storyboard',        // 5. 分镜生成
            'storyboard_image',  // 6. 分镜图生成
            'video_prompt',      // 7. 视频提示词
            'video_generate',    // 8. 视频生成
        ];
        
        return tasks.sort((a, b) => {
            const orderA = typeOrder.indexOf(a.type);
            const orderB = typeOrder.indexOf(b.type);
            
            // 先按依赖顺序排序，再按优先级排序
            if (orderA !== orderB) return orderA - orderB;
            return (b.priority || 5) - (a.priority || 5);
        });
    }

    /**
     * 获取任务队列统计（新增）
     */
    async getStats() {
        const pending = await db('t_task').where('status', 'pending').count('* as count').first();
        const running = await db('t_task').where('status', 'running').count('* as count').first();
        const completed = await db('t_task').where('status', 'completed').count('* as count').first();
        const failed = await db('t_task').where('status', 'failed').count('* as count').first();
        
        return {
            queueLength: this.queue.length,
            activeTasks: this.activeTasks.size,
            maxConcurrent: this.maxConcurrent,
            pending: pending?.count || 0,
            running: running?.count || 0,
            completed: completed?.count || 0,
            failed: failed?.count || 0,
        };
    }

    /**
     * 设置并行度（新增）
     */
    setConcurrency(maxConcurrent: number) {
        this.maxConcurrent = Math.max(1, Math.min(10, maxConcurrent));
        console.log(`[并行配置] 最大并行度设置为 ${this.maxConcurrent}`);
    }
}

export const taskRunner = new TaskRunner();
