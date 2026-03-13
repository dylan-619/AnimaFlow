import db from '../db/index.js';
import { taskRunner } from '../task/taskRunner.js';
import { Router, Request, Response } from 'express';

export const batchRouter = Router();

/**
 * 批量生成分镜图
 */
export async function batchGenerateStoryboardImages(
    projectId: number,
    options?: {
        concurrency?: number;
        skipExisting?: boolean;
        storyboardIds?: number[];
    }
) {
    const { concurrency = 3, skipExisting = true, storyboardIds } = options || {};

    console.log(`[批量分镜图] 项目 ${projectId}, 并行度=${concurrency}, 跳过已存在=${skipExisting}`);

    // 获取待生成分镜
    let query = db('t_storyboard')
        .where('projectId', projectId)
        .whereNotNull('shotPrompt'); // 有提示词的

    if (skipExisting) {
        query = query.whereNull('filePath'); // 未生成图片的
    }

    if (storyboardIds && storyboardIds.length > 0) {
        query = query.whereIn('id', storyboardIds);
    }

    const shots = await query.orderBy('segmentIndex').orderBy('shotIndex');

    if (shots.length === 0) {
        return {
            totalShots: 0,
            batchCount: 0,
            concurrency,
            message: '没有待生成的分镜',
        };
    }

    console.log(`[批量分镜图] 找到 ${shots.length} 个待生成分镜`);

    // 创建批量任务
    const taskIds: string[] = [];
    for (let i = 0; i < shots.length; i += concurrency) {
        const batch = shots.slice(i, i + concurrency);
        
        const [task] = await db('t_task').insert({
            projectId,
            type: 'storyboard_image',
            input: JSON.stringify({ 
                storyboardIds: batch.map(s => s.id) 
            }),
            status: 'pending',
            priority: 5,
            createdAt: Date.now(),
        }).returning('id');

        taskIds.push(task.id || task);
    }

    // 批量入队
    await taskRunner.enqueueBatch(taskIds, { concurrency });

    console.log(`[批量分镜图] 已创建 ${taskIds.length} 个批量任务`);

    return {
        totalShots: shots.length,
        batchCount: taskIds.length,
        concurrency,
        taskIds,
    };
}

/**
 * 批量生成视频
 */
export async function batchGenerateVideos(
    projectId: number,
    options?: {
        concurrency?: number;
        skipExisting?: boolean;
        storyboardIds?: number[];
    }
) {
    const { concurrency = 2, skipExisting = true, storyboardIds } = options || {};

    console.log(`[批量视频] 项目 ${projectId}, 并行度=${concurrency}, 跳过已存在=${skipExisting}`);

    // 获取待生成视频的分镜（需已有图片）
    let query = db('t_storyboard')
        .where('projectId', projectId)
        .whereNotNull('filePath'); // 已有图片

    if (skipExisting) {
        query = query.whereNull('videoPath'); // 未生成视频
    }

    if (storyboardIds && storyboardIds.length > 0) {
        query = query.whereIn('id', storyboardIds);
    }

    const shots = await query.orderBy('segmentIndex').orderBy('shotIndex');

    if (shots.length === 0) {
        return {
            totalShots: 0,
            batchCount: 0,
            concurrency,
            message: '没有待生成视频的分镜',
        };
    }

    console.log(`[批量视频] 找到 ${shots.length} 个待生成视频`);

    // 创建批量任务（视频生成并行度较低，避免API限流）
    const taskIds: string[] = [];
    for (let i = 0; i < shots.length; i += concurrency) {
        const batch = shots.slice(i, i + concurrency);

        const [task] = await db('t_task').insert({
            projectId,
            type: 'video_generate',
            input: JSON.stringify({ 
                storyboardIds: batch.map(s => s.id) 
            }),
            status: 'pending',
            priority: 8,
            createdAt: Date.now(),
        }).returning('id');

        taskIds.push(task.id || task);
    }

    // 批量入队
    await taskRunner.enqueueBatch(taskIds, { concurrency });

    console.log(`[批量视频] 已创建 ${taskIds.length} 个批量任务`);

    return {
        totalShots: shots.length,
        batchCount: taskIds.length,
        concurrency,
        taskIds,
    };
}

/**
 * 批量生成资产图
 */
export async function batchGenerateAssetImages(
    projectId: number,
    options?: {
        concurrency?: number;
        skipExisting?: boolean;
        assetIds?: number[];
    }
) {
    const { concurrency = 3, skipExisting = true, assetIds } = options || {};

    console.log(`[批量资产图] 项目 ${projectId}, 并行度=${concurrency}`);

    // 获取待生成资产图
    let query = db('t_assets')
        .where('projectId', projectId);

    if (skipExisting) {
        query = query.whereNull('publicUrl'); // 未生成图片
    }

    if (assetIds && assetIds.length > 0) {
        query = query.whereIn('id', assetIds);
    }

    const assets = await query;

    if (assets.length === 0) {
        return {
            totalAssets: 0,
            batchCount: 0,
            concurrency,
            message: '没有待生成的资产',
        };
    }

    console.log(`[批量资产图] 找到 ${assets.length} 个待生成资产`);

    // 创建批量任务
    const taskIds: string[] = [];
    for (let i = 0; i < assets.length; i += concurrency) {
        const batch = assets.slice(i, i + concurrency);

        const [task] = await db('t_task').insert({
            projectId,
            type: 'asset_image',
            input: JSON.stringify({ 
                assetIds: batch.map(a => a.id) 
            }),
            status: 'pending',
            priority: 4,
            createdAt: Date.now(),
        }).returning('id');

        taskIds.push(task.id || task);
    }

    // 批量入队
    await taskRunner.enqueueBatch(taskIds, { concurrency });

    return {
        totalAssets: assets.length,
        batchCount: taskIds.length,
        concurrency,
        taskIds,
    };
}

/**
 * 一键生成全流程
 */
export async function oneClickGenerate(
    projectId: number,
    options?: {
        concurrency?: number;
        steps?: string[]; // ['outline', 'script', 'assets', 'storyboard', 'images', 'videos']
    }
) {
    const { concurrency = 3, steps } = options || {};

    console.log(`[一键生成] 项目 ${projectId}, 并行度=${concurrency}`);

    const project = await db('t_project').where('id', projectId).first();
    if (!project) {
        throw new Error('项目不存在');
    }

    const tasks: any[] = [];
    const taskOrder = steps || [
        'outline',        // 1. 大纲
        'script',         // 2. 剧本
        'assets_extract', // 3. 资产提取
        'assets_image',   // 4. 资产图
        'storyboard',     // 5. 分镜
        'storyboard_image', // 6. 分镜图
        'video_prompt',   // 7. 视频提示词
        'video_generate', // 8. 视频
    ];

    // 检查每一步是否已完成，创建待执行任务
    for (let i = 0; i < taskOrder.length; i++) {
        const step = taskOrder[i];
        
        // 检查是否已存在完成的任务
        const existingTask = await db('t_task')
            .where('projectId', projectId)
            .where('type', step)
            .where('status', 'completed')
            .first();

        if (!existingTask) {
            tasks.push({
                projectId,
                type: step,
                input: JSON.stringify({ projectId }),
                priority: 10 - i, // 越早的优先级越高
            });
        }
    }

    if (tasks.length === 0) {
        return {
            message: '所有步骤已完成',
            tasksCreated: 0,
        };
    }

    // 按依赖关系排序并调度
    const result = await taskRunner.scheduleBatchTasks(tasks);

    console.log(`[一键生成] 已调度 ${result.scheduled} 个任务`);

    return {
        message: '一键生成已启动',
        tasksCreated: result.scheduled,
        batches: result.batches,
        steps: taskOrder.filter(s => tasks.some(t => t.type === s)),
    };
}

// ==================== 路由接口 ====================

// 批量生成分镜图
batchRouter.post('/api/batch/storyboardImages', async (req: Request, res: Response) => {
    try {
        const { projectId, concurrency, skipExisting, storyboardIds } = req.body;
        const result = await batchGenerateStoryboardImages(projectId, { 
            concurrency, 
            skipExisting, 
            storyboardIds 
        });
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[批量分镜图] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 批量生成视频
batchRouter.post('/api/batch/videos', async (req: Request, res: Response) => {
    try {
        const { projectId, concurrency, skipExisting, storyboardIds } = req.body;
        const result = await batchGenerateVideos(projectId, { 
            concurrency, 
            skipExisting, 
            storyboardIds 
        });
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[批量视频] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 批量生成资产图
batchRouter.post('/api/batch/assetImages', async (req: Request, res: Response) => {
    try {
        const { projectId, concurrency, skipExisting, assetIds } = req.body;
        const result = await batchGenerateAssetImages(projectId, { 
            concurrency, 
            skipExisting, 
            assetIds 
        });
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[批量资产图] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 一键生成
batchRouter.post('/api/batch/oneClick', async (req: Request, res: Response) => {
    try {
        const { projectId, concurrency, steps } = req.body;
        const result = await oneClickGenerate(projectId, { concurrency, steps });
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[一键生成] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 获取批量任务状态
batchRouter.get('/api/batch/status', async (req: Request, res: Response) => {
    try {
        const stats = await taskRunner.getStats();
        res.json({ code: 0, data: stats });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 设置并行度
batchRouter.post('/api/batch/concurrency', async (req: Request, res: Response) => {
    try {
        const { maxConcurrent } = req.body;
        taskRunner.setConcurrency(maxConcurrent);
        res.json({ code: 0, data: { maxConcurrent } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});
