import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { getPrompt } from '../utils/helpers.js';
import type { Task } from '../types/index.js';

// ---------- 路由层 ----------
import { Router, Request, Response } from 'express';

export const storylineRouter = Router();

storylineRouter.post('/api/storyline/get', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.body;
        const data = await db('t_storyline').where('projectId', projectId).first();
        res.json({ code: 0, data: data || null });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

storylineRouter.post('/api/storyline/update', async (req: Request, res: Response) => {
    try {
        const { projectId, content } = req.body;
        const existing = await db('t_storyline').where('projectId', projectId).first();
        if (existing) {
            await db('t_storyline').where('id', existing.id).update({ content });
        } else {
            await db('t_storyline').insert({ projectId, content });
        }
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// ---------- 任务 Handler ----------

export async function storylineHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    console.log(`[故事线] 开始执行, taskId=${task.id}, projectId=${task.projectId}`);
    const input = task.input ? JSON.parse(task.input) : {};

    // 1. 获取小说章节
    let query = db('t_novel').where('projectId', task.projectId).orderBy('chapterIndex');
    if (input.chapterIds?.length) query = query.whereIn('id', input.chapterIds);
    const chapters = await query;
    if (!chapters.length) throw new Error('未找到小说章节，请先上传小说');
    console.log(`[故事线] 找到 ${chapters.length} 个章节`);
    await updateProgress(10);

    // 2. 拼接原文
    const novelText = chapters.map((c: any) =>
        `=== 第${c.chapterIndex}章 ${c.chapter || ''} ===\n${c.chapterData || ''}`
    ).join('\n\n');
    console.log(`[故事线] 原文拼接完成, 总字符数=${novelText.length}`);

    // 3. 获取提示词
    const systemPrompt = await getPrompt(db, 'storyline');
    console.log(`[故事线] 提示词获取完成, 长度=${systemPrompt.length}`);
    await updateProgress(20);

    // 4. 调用 AI
    console.log(`[故事线] 开始调用 AI 生成...`);
    const result = await textGenerate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请分析以下小说原文并生成故事线：\n\n${novelText}` },
    ]);
    console.log(`[故事线] AI 生成完成, 结果长度=${result.length}`);
    await updateProgress(80);

    // 5. 写入数据库
    const existing = await db('t_storyline').where('projectId', task.projectId).first();
    if (existing) {
        await db('t_storyline').where('id', existing.id).update({ content: result });
    } else {
        await db('t_storyline').insert({
            projectId: task.projectId,
            content: result,
            novelIds: JSON.stringify(chapters.map((c: any) => c.id)),
        });
    }

    console.log(`[故事线] 写入数据库完成`);
    return { content: result };
}
