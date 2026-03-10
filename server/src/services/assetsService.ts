import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { imageGenerate } from '../ai/image.js';
import { getPrompt, extractJSON } from '../utils/helpers.js';
import type { Task } from '../types/index.js';

// ---------- 路由层 ----------
import { Router, Request, Response } from 'express';

export const assetsRouter = Router();

assetsRouter.post('/api/assets/list', async (req: Request, res: Response) => {
    try {
        const { projectId, type } = req.body;
        let query = db('t_assets').where('projectId', projectId);
        if (type) query = query.where('type', type);
        const list = await query.orderBy('id');
        res.json({ code: 0, data: list });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

assetsRouter.post('/api/assets/update', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_assets').where('id', id).update(fields);
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

assetsRouter.post('/api/assets/delete', async (req: Request, res: Response) => {
    try {
        const { ids } = req.body;
        if (!ids?.length) { res.json({ code: -1, msg: '缺少 IDs' }); return; }
        await db('t_assets').whereIn('id', ids).del();
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// AI 润色资产提示词
assetsRouter.post('/api/assets/polishPrompt', async (req: Request, res: Response) => {
    try {
        const { assetId } = req.body;
        const asset = await db('t_assets').where('id', assetId).first();
        if (!asset) { res.json({ code: -1, msg: '资产不存在' }); return; }

        const promptCode: Record<string, string> = { role: 'role_image', scene: 'scene_image', props: 'props_image' };
        const sysPrompt = await getPrompt(db, promptCode[asset.type] || 'role_image');

        // 获取项目美术风格，注入到润色请求中
        const project = await db('t_project').where('id', asset.projectId).first();
        const styleInfo = project?.artStyle || '写实';
        const styleGuideInfo = project?.styleGuide ? `\n视觉风格指引：${project.styleGuide}` : '';

        const prompt = await textGenerate([
            { role: 'system', content: sysPrompt },
            { role: 'user', content: `风格：${styleInfo}${styleGuideInfo}\n资产名称：${asset.name}\n资产描述：${asset.intro || '无详细描述'}` },
        ]);

        await db('t_assets').where('id', assetId).update({ prompt });
        res.json({ code: 0, data: { prompt } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// ---------- 任务 Handlers ----------

// 资产提取
export async function assetsExtractHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const outlines = await db('t_outline').where('projectId', task.projectId);
    if (!outlines.length) throw new Error('请先生成大纲');

    const outlinesText = outlines.map((o: any) => {
        const data = JSON.parse(o.data);
        return `第${data.episodeIndex}集 ${data.title}：
场景：${(data.scenes || []).map((s: any) => `${s.name}(${s.description})`).join('、')}
角色：${(data.characters || []).map((c: any) => `${c.name}(${c.description})`).join('、')}
道具：${(data.props || []).map((p: any) => `${p.name}(${p.description})`).join('、')}`;
    }).join('\n\n');

    const project = await db('t_project').where('id', task.projectId).first();
    const styleHint = project?.artStyle ? `\n美术风格：${project.artStyle}（资产描述应体现此风格的视觉特征）` : '';

    const systemPrompt = await getPrompt(db, 'assets_extract');
    await updateProgress(20);

    const result = await textGenerate(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: `从以下大纲中提取所有资产：${styleHint}\n\n【提取规则补充】\n1. 请将不同场景中出现的同类物理资产（如“笔记本电脑”和“台式机”、“手机”和“智能手机”等）合并为更通用的实体概念（例如统一成“电脑”、“手机”），提取为一个资产即可，避免生成重复或冲突的资产。\n\n${outlinesText}` }],
        { responseFormat: 'json' },
    );

    const jsonStr = extractJSON(result);
    const parsed = JSON.parse(jsonStr);
    await updateProgress(70);

    // 去重后写入
    const existingNames = new Set(
        (await db('t_assets').where('projectId', task.projectId)).map((a: any) => a.name),
    );

    const toInsert: any[] = [];
    const mapping: Record<string, string> = { roles: 'role', scenes: 'scene', props: 'props' };
    for (const [key, type] of Object.entries(mapping)) {
        for (const item of parsed[key] || []) {
            if (!existingNames.has(item.name)) {
                toInsert.push({
                    name: item.name,
                    intro: item.intro || item.description || '',
                    type,
                    projectId: task.projectId,
                });
                existingNames.add(item.name);
            }
        }
    }

    if (toInsert.length) await db('t_assets').insert(toInsert);
    return { count: toInsert.length };
}

// 资产图片生成
export async function assetImageHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { assetId } = JSON.parse(task.input || '{}');
    const asset = await db('t_assets').where('id', assetId).first();
    if (!asset) throw new Error('资产不存在');

    // 如果没有 prompt，先润色
    let prompt = asset.prompt;
    if (!prompt) {
        const promptCode: Record<string, string> = { role: 'role_image', scene: 'scene_image', props: 'props_image' };
        const sysPrompt = await getPrompt(db, promptCode[asset.type] || 'role_image');
        const project = await db('t_project').where('id', asset.projectId).first();
        const styleInfo = project?.artStyle || '写实';
        const styleGuideInfo = project?.styleGuide ? `\n视觉风格指引：${project.styleGuide}` : '';

        prompt = await textGenerate([
            { role: 'system', content: sysPrompt },
            { role: 'user', content: `风格：${styleInfo}${styleGuideInfo}\n资产名称：${asset.name}\n资产描述：${asset.intro || '无详细描述'}` },
        ]);
        await db('t_assets').where('id', assetId).update({ prompt });
    }
    await updateProgress(30);

    // 生成图片
    const imgOpts: any = { prefix: `asset_${assetId}`, ossDir: 'assets' };
    if (asset.type === 'scene') {
        imgOpts.width = 2560;
        imgOpts.height = 1440;
    }
    const results = await imageGenerate(prompt, imgOpts);
    await updateProgress(90);

    const filePath = results[0].fileName;
    const publicUrl = results[0].publicUrl || null;
    let historyArr: string[] = [];
    try {
        historyArr = JSON.parse(asset.history || '[]');
    } catch (e) { }
    if (!historyArr.includes(filePath)) {
        historyArr.unshift(filePath);
    }

    await db('t_assets').where('id', assetId).update({ filePath, publicUrl, history: JSON.stringify(historyArr) });
    return { filePath, publicUrl };
}
