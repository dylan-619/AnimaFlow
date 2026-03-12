import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { videoGenerate, pollVideoTask } from '../ai/video.js';
import { readFileBase64, downloadFile, getPrompt } from '../utils/helpers.js';
import type { Task } from '../types/index.js';

// ---------- 路由层 ----------
import { Router, Request, Response } from 'express';

export const videoRouter = Router();

videoRouter.post('/api/video/createConfig', async (req: Request, res: Response) => {
    try {
        const { scriptId, projectId, configId, mode, resolution, ratio, draft, cameraFixed, duration, prompt, startFrame, endFrame, audioEnabled, storyboardId } = req.body;
        if (!scriptId || !projectId) { res.json({ code: -1, msg: '缺少参数' }); return; }

        let finalStartFrame = startFrame || null;

        // 如果关联了分镜且没有手动指定首帧，自动使用分镜图片
        if (storyboardId && !startFrame) {
            const shot = await db('t_storyboard').where('id', storyboardId).first();
            if (shot?.filePath) {
                finalStartFrame = shot.filePath;
            }
        }

        const [id] = await db('t_videoConfig').insert({
            scriptId, projectId, configId, mode: mode || 'single', resolution, duration: duration || 5,
            ratio: ratio || '16:9', draft: draft ? 1 : 0, cameraFixed: cameraFixed ? 1 : 0,
            prompt, startFrame: finalStartFrame, endFrame, audioEnabled: audioEnabled || 0,
            storyboardId: storyboardId || null,
            createTime: Date.now(),
        });
        res.json({ code: 0, data: { id } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

videoRouter.post('/api/video/listConfigs', async (req: Request, res: Response) => {
    try {
        const { scriptId } = req.body;
        const list = await db('t_videoConfig').where('scriptId', scriptId).orderBy('createTime', 'desc');

        // 附带关联的分镜信息
        for (const vc of list) {
            if (vc.storyboardId) {
                const shot = await db('t_storyboard').where('id', vc.storyboardId).first();
                vc.storyboard = shot || null;
            }
        }

        res.json({ code: 0, data: list });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

videoRouter.post('/api/video/updateConfig', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_videoConfig').where('id', id).update(fields);
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

videoRouter.post('/api/video/deleteConfig', async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        await db('t_video').where('configId', id).del();
        await db('t_videoConfig').where('id', id).del();
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

videoRouter.post('/api/video/listResults', async (req: Request, res: Response) => {
    try {
        const { configId } = req.body;
        const list = await db('t_video').where('configId', configId).orderBy('createTime', 'desc');
        res.json({ code: 0, data: list });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

videoRouter.post('/api/video/queryStatus', async (req: Request, res: Response) => {
    try {
        const { videoIds } = req.body;
        const list = await db('t_video').whereIn('id', videoIds);
        res.json({ code: 0, data: list });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// 直接查询外部视频任务状态（调试用）
videoRouter.post('/api/video/queryExternalTask', async (req: Request, res: Response) => {
    try {
        const { taskId } = req.body;
        if (!taskId) { res.json({ code: -1, msg: '请输入任务 ID' }); return; }

        const setting = await db('t_setting').where('userId', 1).first();
        const config = await db('t_config').where('id', setting?.videoConfigId).first();
        if (!config?.apiKey) { res.json({ code: -1, msg: '请先配置视频模型' }); return; }

        const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${config.apiKey}` },
        });
        const data = await response.json();
        res.json({ code: 0, data });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// 按分镜 ID 查询关联的所有视频结果
videoRouter.post('/api/video/listByStoryboard', async (req: Request, res: Response) => {
    try {
        const { storyboardId } = req.body;
        if (!storyboardId) { res.json({ code: 0, data: [] }); return; }

        const configs = await db('t_videoConfig').where('storyboardId', storyboardId).orderBy('createTime', 'desc');
        const results: any[] = [];
        for (const vc of configs) {
            const videos = await db('t_video').where('configId', vc.id).orderBy('createTime', 'desc');
            for (const v of videos) {
                results.push({ ...v, prompt: vc.prompt, duration: vc.duration });
            }
        }
        res.json({ code: 0, data: results });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// AI 润色视频提示词：基于分镜描述生成适合视频生成的动态提示词
videoRouter.post('/api/video/polishPrompt', async (req: Request, res: Response) => {
    try {
        const { storyboardId, duration } = req.body;
        if (!storyboardId) { res.json({ code: -1, msg: '请指定分镜 ID' }); return; }

        const shot = await db('t_storyboard').where('id', storyboardId).first();
        if (!shot) { res.json({ code: -1, msg: '分镜不存在' }); return; }

        const project = await db('t_project').where('id', shot.projectId).first();
        const videoPromptTemplate = await getPrompt(db, 'video_prompt');

        // 查询匹配的资产描述
        const allAssets = await db('t_assets')
            .where('projectId', shot.projectId)
            .whereNotNull('filePath')
            .where('filePath', '!=', '');
        const matchedAssets = allAssets.filter((a: any) => shot.shotPrompt?.includes(a.name));
        const assetsDesc = matchedAssets.length > 0
            ? '\n相关角色/场景描述：\n'
            + matchedAssets.map((a: any) =>
                `[${a.type === 'role' ? '角色' : a.type === 'scene' ? '场景' : '道具'}] ${a.name}: ${a.intro || ''}`
            ).join('\n')
            : '';

        const styleGuideInfo = project?.styleGuide ? `\n视觉风格指引：${project.styleGuide}` : '';

        // 使用 shotAction（动作序列）而非 shotPrompt（静态首帧）
        const actionDesc = shot.shotAction || shot.shotPrompt || '';
        const cameraDesc = shot.cameraMovement ? `\n运镜指令：${shot.cameraMovement}` : '';

        const polished = await textGenerate([
            { role: 'system', content: videoPromptTemplate },
            { role: 'user', content: `风格：${project?.artStyle || '写实'}${styleGuideInfo}\n镜头时长：${duration || 5}秒\n首帧静态描述：${shot.shotPrompt || ''}\n动作序列：${actionDesc}${cameraDesc}${assetsDesc}\n台词：${shot.dubbingText || '无'}` },
        ]);

        // 保存到分镜记录
        await db('t_storyboard').where('id', storyboardId).update({ videoPrompt: polished });

        res.json({ code: 0, data: { polishedPrompt: polished } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// 选择指定分镜的最佳视频（更新 selectedResultId）
videoRouter.post('/api/video/selectResult', async (req: Request, res: Response) => {
    try {
        const { storyboardId, videoId } = req.body;
        if (!storyboardId || !videoId) { res.json({ code: -1, msg: '缺少参数' }); return; }
        // 找到该分镜关联的所有 videoConfig，更新 selectedResultId
        const configs = await db('t_videoConfig').where('storyboardId', storyboardId).select('id');
        if (configs.length) {
            // 先清除旧选择
            await db('t_videoConfig').where('storyboardId', storyboardId).update({ selectedResultId: null });
            // 找到包含该 video 的 config 并设置
            const video = await db('t_video').where('id', videoId).first();
            if (video) {
                await db('t_videoConfig').where('id', video.configId).update({ selectedResultId: videoId });
            }
        }
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// ---------- 任务 Handler ----------

// 🔴 新增：批量视频生成处理器（用于批量生成功能）
export async function batchVideoHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const input = JSON.parse(task.input || '{}');
    const { storyboardIds, skipExisting = true } = input;
    
    if (!storyboardIds?.length) {
        throw new Error('请指定分镜 ID');
    }

    console.log(`[批量视频] 开始处理 ${storyboardIds.length} 个分镜`);

    // 筛选需要生成视频的分镜
    let query = db('t_storyboard')
        .whereIn('id', storyboardIds)
        .whereNotNull('filePath'); // 必须有图片
    
    if (skipExisting) {
        query = query.whereNull('videoPath'); // 跳过已有视频的
    }

    const shots = await query;
    
    if (shots.length === 0) {
        console.log(`[批量视频] 所有分镜已有视频，跳过生成`);
        return { count: 0, skipped: true };
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        try {
            console.log(`[批量视频] 处理分镜 S${shot.segmentIndex}-${shot.shotIndex} (${i + 1}/${shots.length})`);
            
            await updateProgress(Math.round((i / shots.length) * 100));
            
            // 生成视频
            const imageFileNames = [shot.filePath];
            const { externalTaskId } = await videoGenerate({
                prompt: shot.videoPrompt || shot.shotPrompt || '',
                imageFileNames,
                duration: shot.shotDuration || 5,
                ratio: '16:9',
                generateAudio: false,
            });

            // 写入视频记录
            const [videoId] = await db('t_video').insert({
                configId: null, // 批量生成不需要 configId
                state: 0,
                prompt: shot.videoPrompt || shot.shotPrompt,
                duration: shot.shotDuration || 5,
                taskId: externalTaskId,
                scriptId: shot.scriptId,
                createTime: Date.now(),
            });

            // 轮询等待视频生成完成
            const videoUrl = await pollVideoTask(externalTaskId);
            const fileName = `video_${videoId}_${Date.now()}.mp4`;
            await downloadFile(videoUrl, fileName);
            
            console.log(`[批量视频] 分镜 S${shot.segmentIndex}-${shot.shotIndex} 视频下载完成: ${fileName}`);

            // 更新视频记录和分镜的 videoPath
            await db('t_video').where('id', videoId).update({ state: 1, filePath: fileName });
            await db('t_storyboard').where('id', shot.id).update({ videoPath: fileName });
            
            successCount++;
        } catch (err: any) {
            console.error(`[批量视频] 分镜 S${shot.segmentIndex}-${shot.shotIndex} 生成失败:`, err.message);
            failCount++;
        }
    }

    console.log(`[批量视频] 完成: 成功 ${successCount}, 失败 ${failCount}`);
    return { count: successCount, failed: failCount };
}

export async function videoHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { videoConfigId } = JSON.parse(task.input || '{}');
    if (!videoConfigId) throw new Error('请指定视频配置 ID');

    const config = await db('t_videoConfig').where('id', videoConfigId).first();
    if (!config) throw new Error('视频配置不存在');

    console.log(`[视频] 开始生成, configId=${videoConfigId}, mode=${config.mode}, startFrame=${config.startFrame || '无'}`);

    // 准备首帧图片（文件名 + base64 兜底）
    const imageFileNames: string[] = [];
    const imageBase64: string[] = [];
    if (config.startFrame) {
        imageFileNames.push(config.startFrame);
        imageBase64.push(readFileBase64(config.startFrame));
    }
    if (config.mode === 'startEnd' && config.endFrame) {
        imageFileNames.push(config.endFrame);
        imageBase64.push(readFileBase64(config.endFrame));
    }
    await updateProgress(10);

    // 提交视频生成任务
    const { externalTaskId } = await videoGenerate({
        prompt: config.prompt || '',
        imageFileNames: imageFileNames.length > 0 ? imageFileNames : undefined,
        imageBase64: imageBase64.length > 0 ? imageBase64 : undefined,
        duration: config.duration,
        resolution: config.resolution,
        ratio: config.ratio,
        draft: config.draft === 1,
        cameraFixed: config.cameraFixed === 1,
        generateAudio: config.audioEnabled === 1,
        configId: config.configId,
    });

    // 写入记录
    const [videoId] = await db('t_video').insert({
        configId: videoConfigId,
        state: 0,
        prompt: config.prompt,
        duration: config.duration,
        taskId: externalTaskId,
        scriptId: config.scriptId,
        createTime: Date.now(),
    });
    await updateProgress(20);

    // 轮询等待
    try {
        const videoUrl = await pollVideoTask(externalTaskId, config.configId);
        const fileName = `video_${videoId}_${Date.now()}.mp4`;
        await downloadFile(videoUrl, fileName);
        console.log(`[视频] 下载完成: ${fileName}`);

        await db('t_video').where('id', videoId).update({ state: 1, filePath: fileName });
        return { videoId, filePath: fileName };
    } catch (err: any) {
        console.error(`[视频] 生成失败:`, err.message);
        await db('t_video').where('id', videoId).update({ state: -1, errorReason: err.message });
        throw err;
    }
}
