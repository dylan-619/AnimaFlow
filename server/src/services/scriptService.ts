import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { getPrompt, formatEpisodePrompt } from '../utils/helpers.js';
import type { Task, EpisodeData } from '../types/index.js';

// ---------- 路由层 ----------
import { Router, Request, Response } from 'express';

export const scriptRouter = Router();

scriptRouter.post('/api/script/list', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.body;
        const list = await db('t_script').where('projectId', projectId).orderBy('id');
        res.json({ code: 0, data: list });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

scriptRouter.post('/api/script/update', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        // 支持更新 content、subtitleEnabled、subtitleStyle、bgmPath、bgmVolume 等字段
        const allowedFields = ['content', 'subtitleEnabled', 'subtitleStyle', 'bgmPath', 'bgmVolume'];
        const updates: Record<string, any> = {};
        for (const key of allowedFields) {
            if (key in fields) updates[key] = fields[key];
        }
        if (Object.keys(updates).length === 0) { res.json({ code: -1, msg: '无有效更新字段' }); return; }
        await db('t_script').where('id', id).update(updates);
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// ---------- 任务 Handler ----------

export async function scriptHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { outlineId } = JSON.parse(task.input || '{}');
    if (!outlineId) throw new Error('请指定大纲 ID');

    const outline = await db('t_outline').where('id', outlineId).first();
    if (!outline) throw new Error('大纲不存在');

    const ep: EpisodeData = JSON.parse(outline.data);

    // 获取关联章节原文
    const chapters = await db('t_novel')
        .where('projectId', task.projectId)
        .whereIn('chapterIndex', ep.chapterRange)
        .orderBy('chapterIndex');
    const novelText = chapters.map((c: any) => c.chapterData || '').join('\n\n');

    const episodePrompt = formatEpisodePrompt(ep);
    const systemPrompt = await getPrompt(db, 'script');

    // 获取项目信息（美术风格）
    const project = await db('t_project').where('id', task.projectId).first();
    const styleInfo = project?.artStyle ? `\n美术风格：${project.artStyle}（剧本中的镜头描写和场景氛围应贴合此风格）` : '';

    // 获取项目已提取的资产列表，注入剧本生成上下文以确保名称一致性
    const assets = await db('t_assets').where('projectId', task.projectId);
    const assetsInfo = assets.length
        ? `\n═══════════════════════════════════════\n资产列表（剧本中必须严格使用以下名称，不得使用别名或简称）\n═══════════════════════════════════════\n`
        + assets.map((a: any) => `[${a.type === 'role' ? '角色' : a.type === 'scene' ? '场景' : '道具'}] ${a.name}: ${a.intro || ''}`).join('\n')
        : '';

    await updateProgress(20);

    const result = await textGenerate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请根据以下大纲生成剧本：${styleInfo}\n\n${episodePrompt}${assetsInfo}\n\n═══════════════════════════════════════\n原文参考（仅用于补充细节和对话优化）\n═══════════════════════════════════════\n${novelText}` },
    ], { maxTokens: 4096 });

    await updateProgress(90);

    // 更新对应剧本
    const script = await db('t_script').where('outlineId', outlineId).first();
    if (script) {
        await db('t_script').where('id', script.id).update({ content: result });
    } else {
        await db('t_script').insert({
            name: `第${ep.episodeIndex}集：${ep.title}`,
            content: result,
            projectId: task.projectId,
            outlineId,
        });
    }

    return { content: result };
}
