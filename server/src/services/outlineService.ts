import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { getPrompt, extractJSON } from '../utils/helpers.js';
import type { Task, EpisodeData } from '../types/index.js';

// ---------- 路由层 ----------
import { Router, Request, Response } from 'express';

export const outlineRouter = Router();

outlineRouter.post('/api/outline/list', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.body;
        const list = await db('t_outline').where('projectId', projectId).orderBy('episode');
        // 解析 data JSON
        const parsed = list.map((item: any) => ({
            ...item,
            data: item.data ? JSON.parse(item.data) : null,
        }));
        res.json({ code: 0, data: parsed });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

outlineRouter.post('/api/outline/update', async (req: Request, res: Response) => {
    try {
        const { id, data } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_outline').where('id', id).update({
            data: typeof data === 'string' ? data : JSON.stringify(data),
        });
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

outlineRouter.post('/api/outline/delete', async (req: Request, res: Response) => {
    try {
        const { ids } = req.body;
        if (!ids?.length) { res.json({ code: -1, msg: '缺少 IDs' }); return; }
        // 级联删除关联剧本和分镜（先查后删，避免孤儿数据）
        const scripts = await db('t_script').whereIn('outlineId', ids).select('id');
        if (scripts.length) {
            const scriptIds = scripts.map((s: any) => s.id);
            await db('t_storyboard').whereIn('scriptId', scriptIds).del();
            await db('t_script').whereIn('id', scriptIds).del();
        }
        await db('t_outline').whereIn('id', ids).del();
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// ---------- 任务 Handler ----------

export async function outlineHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const input = JSON.parse(task.input || '{}');
    const { episodeCount, episodeDuration, overwrite } = input;

    if (!episodeCount) throw new Error('请指定目标集数');

    // 1. 获取故事线
    const storyline = await db('t_storyline').where('projectId', task.projectId).first();
    if (!storyline?.content) throw new Error('请先生成故事线');

    // 2. 获取小说原文
    const chapters = await db('t_novel').where('projectId', task.projectId).orderBy('chapterIndex');
    const novelText = chapters.map((c: any) => `第${c.chapterIndex}章 ${c.chapter || ''}\n${c.chapterData || ''}`).join('\n\n');

    // 3. 获取项目信息
    const project = await db('t_project').where('id', task.projectId).first();
    await updateProgress(10);

    // 4. 组装提示词
    const systemPrompt = await getPrompt(db, 'outline');
    const styleGuideInfo = project?.styleGuide ? `\n- 视觉风格指引：${project.styleGuide}` : '';
    const userPrompt = `项目信息：
- 类型：${project?.type || '未设定'}
- 美术风格：${project?.artStyle || '未设定'}${styleGuideInfo}
- 目标集数：${episodeCount}
- 单集时长：${episodeDuration || 60}秒

故事线：
${storyline.content}

小说原文（用于细节参考）：
${novelText.slice(0, 30000)}

请严格按照 JSON 数组格式输出 ${episodeCount} 集大纲。只输出 JSON 数组，不要输出其他任何内容。`;

    // 5. 调用 AI
    const result = await textGenerate(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { responseFormat: 'json', maxTokens: 8192 },
    );
    await updateProgress(70);

    // 6. 解析 JSON
    const jsonStr = extractJSON(result);
    let episodes: EpisodeData[];
    const parsed = JSON.parse(jsonStr);
    episodes = Array.isArray(parsed) ? parsed : parsed.episodes || parsed.data || [];
    if (!episodes.length) throw new Error('AI 未返回有效的大纲数据');

    // 7. 写入数据库
    if (overwrite) {
        const oldOutlines = await db('t_outline').where('projectId', task.projectId);
        const oldIds = oldOutlines.map((o: any) => o.id);
        if (oldIds.length) {
            const oldScripts = await db('t_script').whereIn('outlineId', oldIds).select('id');
            if (oldScripts.length) {
                await db('t_storyboard').whereIn('scriptId', oldScripts.map((s: any) => s.id)).del();
            }
            await db('t_script').whereIn('outlineId', oldIds).del();
        }
        await db('t_outline').where('projectId', task.projectId).del();
    }

    for (const ep of episodes) {
        const [outlineId] = await db('t_outline').insert({
            episode: ep.episodeIndex,
            data: JSON.stringify(ep),
            projectId: task.projectId,
        });
        await db('t_script').insert({
            name: `第${ep.episodeIndex}集：${ep.title}`,
            content: '',
            projectId: task.projectId,
            outlineId,
        });
    }

    return { count: episodes.length };
}
