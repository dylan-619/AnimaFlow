import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { imageGenerate } from '../ai/image.js';
import { getPrompt, extractJSON } from '../utils/helpers.js';
import type { Task } from '../types/index.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

// ---------- 路由层 ----------
import { Router, Request, Response } from 'express';

export const storyboardRouter = Router();

const upload = multer({ dest: uploadsDir });

storyboardRouter.post('/api/storyboard/list', async (req: Request, res: Response) => {
    try {
        const { scriptId } = req.body;
        const list = await db('t_storyboard').where('scriptId', scriptId).orderBy('segmentIndex').orderBy('shotIndex');
        res.json({ code: 0, data: list });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

storyboardRouter.post('/api/storyboard/update', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_storyboard').where('id', id).update(fields);
        res.json({ code: 0 });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

storyboardRouter.post('/api/storyboard/batchDelete', async (req: Request, res: Response) => {
    try {
        const { ids } = req.body;
        if (!ids?.length) { res.json({ code: -1, msg: '缺少 ID 列表' }); return; }
        await db('t_storyboard').whereIn('id', ids).del();
        res.json({ code: 0, data: { deleted: ids.length } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

storyboardRouter.post('/api/storyboard/uploadImage', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        if (!req.file) { res.json({ code: -1, msg: '未上传文件' }); return; }
        const fileName = `storyboard_upload_${id}_${Date.now()}${path.extname(req.file.originalname)}`;
        const fs = await import('fs');
        fs.renameSync(req.file.path, path.join(uploadsDir, fileName));
        await db('t_storyboard').where('id', id).update({ filePath: fileName });
        res.json({ code: 0, data: { filePath: fileName } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// 获取分镜匹配的资产信息 + 润色提示词预览
storyboardRouter.post('/api/storyboard/matchAssets', async (req: Request, res: Response) => {
    try {
        const { storyboardId, extraPrompt } = req.body;
        const shot = await db('t_storyboard').where('id', storyboardId).first();
        if (!shot) { res.json({ code: -1, msg: '分镜不存在' }); return; }

        // 查询所有资产（含无图片的，确保关联完整）
        const allAssets = await db('t_assets').where('projectId', shot.projectId);

        // 1. 优先使用存储的 relatedAssets（分镜生成时 AI 输出的关联列表）
        let relatedNames: string[] = [];
        try { relatedNames = JSON.parse(shot.relatedAssets || '[]'); } catch (e) { }
        const matchedById = relatedNames.length > 0
            ? allAssets.filter((a: any) => relatedNames.includes(a.name))
            : [];

        // 2. 补充：从 shotPrompt + extraPrompt 文本中匹配额外资产
        const matchText = [shot.shotPrompt || '', extraPrompt || ''].join(' ');
        const matchedByText = allAssets.filter((a: any) => matchText.includes(a.name));

        // 3. 合并去重
        const seenIds = new Set<number>();
        const merged: any[] = [];
        for (const a of [...matchedById, ...matchedByText]) {
            if (seenIds.has(a.id)) continue;
            seenIds.add(a.id);
            merged.push({
                id: a.id, name: a.name, type: a.type, intro: a.intro,
                filePath: a.filePath, publicUrl: a.publicUrl,
            });
        }

        res.json({ code: 0, data: { matched: merged } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// 润色分镜提示词（不生成图片，仅返回润色结果）
storyboardRouter.post('/api/storyboard/polishPrompt', async (req: Request, res: Response) => {
    try {
        const { storyboardId } = req.body;
        const shot = await db('t_storyboard').where('id', storyboardId).first();
        if (!shot) { res.json({ code: -1, msg: '分镜不存在' }); return; }

        const project = await db('t_project').where('id', shot.projectId).first();
        const polishPrompt = await getPrompt(db, 'storyboard_image');

        // 使用存储的 relatedAssets 查找关联资产，fallback 到文本匹配
        const allAssets = await db('t_assets').where('projectId', shot.projectId);
        let relatedNames: string[] = [];
        try { relatedNames = JSON.parse(shot.relatedAssets || '[]'); } catch (e) { }
        let matchedAssets = relatedNames.length > 0
            ? allAssets.filter((a: any) => relatedNames.includes(a.name))
            : allAssets.filter((a: any) => shot.shotPrompt?.includes(a.name));
        const assetsDesc = matchedAssets.length > 0
            ? '\n相关资产描述（请严格按照以下描述绘制对应的角色外貌、场景环境或道具外观）：\n'
            + matchedAssets.map((a: any) =>
                `[${a.type === 'role' ? '角色' : a.type === 'scene' ? '场景' : '道具'}] ${a.name}: ${a.intro || ''}`
            ).join('\n')
            : '';

        const styleInfo = project?.artStyle || '写实';
        const styleGuideInfo = project?.styleGuide ? `\n视觉风格指引：${project.styleGuide}` : '';

        const polished = await textGenerate([
            { role: 'system', content: polishPrompt },
            { role: 'user', content: `风格：${styleInfo}${styleGuideInfo}\n分镜描述：${shot.shotPrompt}${assetsDesc}\n\n【重要提取要求】\n请务必只描述该分镜首帧的静态视觉构图，不要包含人物的连续动作转移、时间推移或状态前后的变化描述。提示词应能够生成一张确定的定格画面。` },
        ]);

        res.json({ code: 0, data: { polishedPrompt: polished } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// ---------- 任务 Handlers ----------

// 分镜生成
export async function storyboardHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { scriptId } = JSON.parse(task.input || '{}');
    if (!scriptId) throw new Error('请指定剧本 ID');

    const script = await db('t_script').where('id', scriptId).first();
    if (!script?.content) throw new Error('剧本内容为空，请先生成剧本');

    const assets = await db('t_assets').where('projectId', task.projectId);
    const assetsInfo = assets.map((a: any) => `[${a.type}] ${a.name}: ${a.intro || ''}`).join('\n');

    const project = await db('t_project').where('id', task.projectId).first();
    const styleHint = project?.artStyle ? `\n美术风格：${project.artStyle}（分镜描述应贴合此风格基调）` : '';

    const systemPrompt = await getPrompt(db, 'storyboard');
    await updateProgress(10);

    const result = await textGenerate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `剧本内容：\n${script.content}\n\n资产列表：\n${assetsInfo}${styleHint}\n\n请分析关键片段并生成分镜提示词和台词。每个 shot 必须包含 relatedAssets 字段（字符串数组），列出该镜头涉及的资产名称（必须与上方资产列表中的名称完全一致）。只输出 JSON 数组。` },
    ], { responseFormat: 'json', maxTokens: 8192 });

    await updateProgress(70);

    const jsonStr = extractJSON(result);
    const segments = JSON.parse(jsonStr);
    const segList = Array.isArray(segments) ? segments : segments.segments || [];

    // 构建资产名称集合，用于校验 AI 返回的 relatedAssets
    const assetNames = new Set(assets.map((a: any) => a.name));

    // 清除旧分镜
    await db('t_storyboard').where('scriptId', scriptId).del();

    // 写入新分镜
    const rows: any[] = [];
    for (const seg of segList) {
        for (const shot of seg.shots || []) {
            // 校验 relatedAssets：只保留实际存在的资产名称
            const rawRelated: string[] = Array.isArray(shot.relatedAssets) ? shot.relatedAssets : [];
            const validRelated = rawRelated.filter(name => assetNames.has(name));
            rows.push({
                scriptId,
                projectId: task.projectId,
                segmentIndex: seg.segmentIndex,
                segmentDesc: seg.segmentDesc || '',
                shotIndex: shot.shotIndex,
                shotPrompt: shot.shotPrompt || '',
                shotAction: shot.shotAction || '', // 新增：动作序列描述
                shotDuration: shot.shotDuration || 5, // 新增：预估时长
                cameraMovement: shot.cameraMovement || '', // 新增：运镜指令
                dubbingText: shot.dubbingText || '',
                relatedAssets: JSON.stringify(validRelated),
            });
        }
    }
    if (rows.length) await db('t_storyboard').insert(rows);

    return { segmentCount: segList.length, shotCount: rows.length };
}

// 分镜图生成
export async function storyboardImageHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { storyboardIds } = JSON.parse(task.input || '{}');
    if (!storyboardIds?.length) throw new Error('请指定分镜 ID');

    const shots = await db('t_storyboard').whereIn('id', storyboardIds);
    if (!shots.length) throw new Error('未找到分镜数据');

    const polishPrompt = await getPrompt(db, 'storyboard_image');
    const project = await db('t_project').where('id', task.projectId).first();

    // 查询项目下所有资产（含无图片的，确保关联完整）
    const allAssets = await db('t_assets').where('projectId', task.projectId);

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];

        // 使用存储的 relatedAssets + shotPrompt 文本匹配，合并去重（与 matchAssets 接口一致）
        let relatedNames: string[] = [];
        try { relatedNames = JSON.parse(shot.relatedAssets || '[]'); } catch (e) { }
        const matchedById = relatedNames.length > 0
            ? allAssets.filter((a: any) => relatedNames.includes(a.name))
            : [];
        const matchedByText = allAssets.filter((a: any) => shot.shotPrompt?.includes(a.name));
        const seenIds = new Set<number>();
        const matchedAssets: any[] = [];
        for (const a of [...matchedById, ...matchedByText]) {
            if (seenIds.has(a.id)) continue;
            seenIds.add(a.id);
            matchedAssets.push(a);
        }
        console.log(`[分镜图] S${shot.segmentIndex}-${shot.shotIndex} 关联资产: ${matchedAssets.map((a: any) => `${a.name}(${a.type})`).join(', ') || '无'}`);

        // 构建匹配到的资产描述，注入润色提示词以保持角色/场景/道具一致性
        const assetsDesc = matchedAssets.length > 0
            ? '\n相关资产描述（请严格按照以下描述绘制对应的角色外貌、场景环境或道具外观）：\n'
            + matchedAssets.map((a: any) =>
                `[${a.type === 'role' ? '角色' : a.type === 'scene' ? '场景' : '道具'}] ${a.name}: ${a.intro || ''}`
            ).join('\n')
            : '';

        const styleInfo = project?.artStyle || '写实';
        const styleGuideInfo = project?.styleGuide ? `\n视觉风格指引：${project.styleGuide}` : '';

        // 1. 润色提示词（注入匹配到的资产描述 + 视觉风格指引）
        const polished = await textGenerate([
            { role: 'system', content: polishPrompt },
            { role: 'user', content: `风格：${styleInfo}${styleGuideInfo}\n分镜描述：${shot.shotPrompt}${assetsDesc}\n\n【重要提取要求】\n请务必只描述该分镜首帧的静态视觉构图，不要包含人物的连续动作转移、时间推移或状态前后的变化描述。提示词应能够生成一张确定的定格画面。` },
        ]);

        // 2. 收集匹配资产中有 OSS 公网 URL 的参考图
        const referenceImages = matchedAssets
            .filter((a: any) => a.publicUrl)
            .map((a: any) => a.publicUrl as string);

        // 3. 根据项目 videoRatio 计算分镜图宽高
        const videoRatio = project?.videoRatio || '16:9';
        const dimensionMap: Record<string, [number, number]> = {
            '9:16': [720, 1280],
            '16:9': [1280, 720],
            '1:1': [1080, 1080],
            '3:4': [810, 1080],
            '4:3': [1080, 810],
        };
        const [imgWidth, imgHeight] = dimensionMap[videoRatio] || [1280, 720];

        // 4. 生成图片（传入参考图 URL 以保持视觉一致性）
        const results = await imageGenerate(polished, {
            prefix: `storyboard_${shot.id}`,
            width: imgWidth,
            height: imgHeight,
            ossDir: 'storyboard',
            ...(referenceImages.length > 0 ? { referenceImages } : {}),
        });

        // 4. 更新 + 保存历史
        const filePath = results[0].fileName;
        const publicUrl = results[0].publicUrl || null;

        let historyArr: string[] = [];
        try { historyArr = JSON.parse(shot.history || '[]'); } catch (e) { }
        if (!historyArr.includes(filePath)) {
            historyArr.unshift(filePath);
        }

        await db('t_storyboard').where('id', shot.id).update({
            filePath,
            publicUrl,
            history: JSON.stringify(historyArr),
        });
        await updateProgress(Math.round(((i + 1) / shots.length) * 100));
    }

    return { count: shots.length };
}

// 分镜配音生成
export async function storyboardTTSHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { storyboardIds } = JSON.parse(task.input || '{}');
    if (!storyboardIds?.length) throw new Error('请指定分镜 ID');

    const shots = await db('t_storyboard').whereIn('id', storyboardIds);
    if (!shots.length) throw new Error('未找到分镜数据');

    let successCount = 0;
    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        if (!shot.dubbingText || !shot.dubbingVoice) {
            console.log(`[配音] S${shot.segmentIndex}-${shot.shotIndex} 无配音台词或无音色，跳过`);
            continue;
        }

        try {
            // 调用 TTS
            const { generateTTS } = await import('../ai/tts.js');
            const audioBuffer = await generateTTS({
                text: shot.dubbingText,
                voiceType: shot.dubbingVoice
            });

            // 保存到本地
            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

            const audioDir = path.join(UPLOADS_DIR, 'audio');
            if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

            const fileName = `tts_${shot.id}_${Date.now()}.mp3`;
            const filePath = path.join(audioDir, fileName);
            fs.writeFileSync(filePath, audioBuffer);

            // 更新数据库
            await db('t_storyboard').where('id', shot.id).update({
                audioPath: `audio/${fileName}`
            });
            successCount++;
        } catch (e: any) {
            console.error(`[配音] 分镜 S${shot.segmentIndex}-${shot.shotIndex} 配音失败:`, e.message);
        }
        await updateProgress(Math.round(((i + 1) / shots.length) * 100));
    }

    return { count: successCount };
}
