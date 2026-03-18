import db from '../db/index.js';
import { taskRunner } from '../task/taskRunner.js';
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

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
    const taskIds: number[] = [];
    for (let i = 0; i < shots.length; i += concurrency) {
        const batch = shots.slice(i, i + concurrency);

        const [id] = await db('t_task').insert({
            projectId,
            type: 'storyboard_image',
            input: JSON.stringify({
                storyboardIds: batch.map(s => s.id)
            }),
            status: 'pending',
            priority: 5,
            createdAt: Date.now(),
        });

        taskIds.push(id);
    }

    // 批量入队
    await taskRunner.enqueueBatch(taskIds);

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
 * 简化版本：参考批量生成图片的方式，逐个创建任务
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

    // 创建视频配置和任务（参考单个生成的方式）
    const taskIds: string[] = [];
    for (const shot of shots) {
        // 先创建视频配置（参考 VideoGeneratorModal 中的 createConfig 逻辑）
        const [configId] = await db('t_videoConfig').insert({
            scriptId: shot.scriptId,
            projectId,
            storyboardId: shot.id,
            mode: 'single',
            startFrame: shot.filePath,
            prompt: shot.videoPrompt || shot.shotPrompt || '',
            duration: shot.shotDuration || 5,
            ratio: null, // 使用项目默认值
            draft: 0,
            cameraFixed: 0,
            audioEnabled: 0,
            createTime: Date.now(),
        });

        // 然后创建任务（参考单个生成中的 createTask 逻辑）
        const taskId = uuid();
        await db('t_task').insert({
            id: taskId,
            projectId,
            type: 'video', // 使用 'video' 与单个生成一致
            input: JSON.stringify({
                videoConfigId: configId
            }),
            status: 'pending',
            progress: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // 立即入队（不批量）
        taskRunner.enqueue(taskId);
        taskIds.push(taskId);
    }

    console.log(`[批量视频] 已创建 ${taskIds.length} 个视频任务`);

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

    console.log(`[批量资产图] 项目 ${projectId}, 并行度=${concurrency}, 跳过已存在=${skipExisting}`);

    // 获取待生成资产图
    let query = db('t_assets')
        .where('projectId', projectId)
        .whereNotNull('intro'); // 有描述的

    if (skipExisting) {
        query = query.whereNull('filePath'); // 未生成图片的
    }

    if (assetIds && assetIds.length > 0) {
        query = query.whereIn('id', assetIds);
    }

    const assets = await query.orderBy('createTime', 'desc');

    if (assets.length === 0) {
        return {
            totalAssets: 0,
            batchCount: 0,
            concurrency,
            message: '没有待生成的资产',
        };
    }

    console.log(`[批量资产图] 找到 ${assets.length} 个待生成资产图`);

    // 创建批量任务
    const taskIds: number[] = [];
    for (let i = 0; i < assets.length; i += concurrency) {
        const batch = assets.slice(i, i + concurrency);

        const [id] = await db('t_task').insert({
            projectId,
            type: 'asset_image',
            input: JSON.stringify({
                assetIds: batch.map(a => a.id)
            }),
            status: 'pending',
            priority: 5,
            createdAt: Date.now(),
        });

        taskIds.push(id);
    }

    // 批量入队
    await taskRunner.enqueueBatch(taskIds);

    console.log(`[批量资产图] 已创建 ${taskIds.length} 个批量任务`);

    return {
        totalAssets: assets.length,
        batchCount: taskIds.length,
        concurrency,
        taskIds,
    };
}

// 一键生成全流程
batchRouter.post('/api/batch/oneClick', async (req: Request, res: Response) => {
    try {
        const { projectId, concurrency = 2 } = req.body;
        if (!projectId) { res.json({ code: -1, msg: '缺少 projectId' }); return; }

        // 获取项目所有分镜
        const shots = await db('t_storyboard')
            .where('projectId', projectId)
            .orderBy('segmentIndex')
            .orderBy('shotIndex');

        if (!shots || shots.length === 0) {
            res.json({ code: -1, msg: '该项目没有分镜' });
            return;
        }

        console.log(`[一键生成] 开始一键生成，共 ${shots.length} 个分镜`);

        // 创建任务队列（按依赖顺序）
        const tasks: any[] = [];

        // 1. 大纲生成
        tasks.push({ type: 'outline', priority: 1 });

        // 2. 剧本生成
        tasks.push({ type: 'script', priority: 2 });

        // 3. 资产提取
        tasks.push({ type: 'assets_extract', priority: 3 });

        // 4. 资产图生成
        const assetsToGenerate = shots.filter(s => s.relatedAssets && JSON.parse(s.relatedAssets || '[]').length > 0);
        if (assetsToGenerate.length > 0) {
            tasks.push({ type: 'asset_image', priority: 4 });
        }

        // 5. 分镜生成
        tasks.push({ type: 'storyboard', priority: 5 });

        // 6. 分镜图生成
        const shotsToGenerateImages = shots.filter(s => !s.filePath);
        if (shotsToGenerateImages.length > 0) {
            tasks.push({ type: 'storyboard_image', priority: 6 });
        }

        // 7. 视频提示词
        const shotsToGeneratePrompts = shots.filter(s => !s.videoPrompt);
        if (shotsToGeneratePrompts.length > 0) {
            tasks.push({ type: 'video_prompt', priority: 7 });
        }

        // 8. 视频生成
        const shotsToGenerateVideos = shots.filter(s => s.filePath && !s.videoPath);
        if (shotsToGenerateVideos.length > 0) {
            tasks.push({ type: 'video_generate', priority: 8 });
        }

        // 使用 taskRunner 的批量调度功能
        const result = await taskRunner.scheduleBatchTasks(tasks);

        res.json({
            code: 0,
            data: {
                totalShots: shots.length,
                scheduled: result.scheduled,
                batches: result.batches,
                message: '一键生成任务已创建',
            },
        });
    } catch (err: any) {
        console.error('[一键生成] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 批量生成分镜图
batchRouter.post('/api/batch/storyboardImages', async (req: Request, res: Response) => {
    try {
        const { projectId, concurrency, skipExisting, storyboardIds } = req.body;
        const result = await batchGenerateStoryboardImages(projectId, { concurrency, skipExisting, storyboardIds });
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
        const result = await batchGenerateVideos(projectId, { concurrency, skipExisting, storyboardIds });
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
        const result = await batchGenerateAssetImages(projectId, { concurrency, skipExisting, assetIds });
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[批量资产图] 错误:', err);
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
