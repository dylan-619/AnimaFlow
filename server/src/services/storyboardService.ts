import db from '../db/index.js';
import { textGenerate } from '../ai/text.js';
import { imageGenerate, editImage } from '../ai/image.js';
import { getPrompt, extractJSON } from '../utils/helpers.js';
import { validateStoryboard, getShotsNeedingFix } from '../utils/storyboardValidator.js';
import type { Task } from '../types/index.js';
import type { EditMode } from '../ai/image.js';
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
        
        // 解析history字段为historyData（包含OSS地址）
        const listWithHistoryData = list.map((item: any) => {
            let historyData = null;
            try {
                if (item.history) {
                    const parsed = JSON.parse(item.history);
                    // 判断是否为新格式（对象数组）
                    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'fileName' in parsed[0]) {
                        historyData = parsed;
                    } else if (Array.isArray(parsed)) {
                        // 旧格式字符串数组，转换为新格式
                        historyData = parsed.map((h: string) => ({ fileName: h, publicUrl: item.publicUrl }));
                    }
                }
            } catch (e) { }
            return { ...item, historyData };
        });
        
        res.json({ code: 0, data: listWithHistoryData });
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

// 🔴 新增：选择使用某张历史图片
storyboardRouter.post('/api/storyboard/select-image', async (req: Request, res: Response) => {
    try {
        const { id, filePath } = req.body;
        if (!id || !filePath) {
            res.json({ code: -1, msg: '缺少必要参数' });
            return;
        }
        
        // 验证该图片是否在历史记录中
        const shot = await db('t_storyboard').where('id', id).first();
        if (!shot) {
            res.json({ code: -1, msg: '分镜不存在' });
            return;
        }
        
        let historyArr: any[] = [];
        try { historyArr = JSON.parse(shot.history || '[]'); } catch (e) { }
        
        // 兼容新旧格式：新格式为对象数组[{fileName, publicUrl}]，旧格式为字符串数组
        let isInHistory = false;
        if (historyArr.length > 0 && typeof historyArr[0] === 'object' && 'fileName' in historyArr[0]) {
            isInHistory = historyArr.some((h: any) => h.fileName === filePath);
        } else {
            isInHistory = historyArr.includes(filePath);
        }
        
        if (!isInHistory) {
            res.json({ code: -1, msg: '该图片不在历史记录中' });
            return;
        }
        
        // 更新当前使用的图片
        await db('t_storyboard').where('id', id).update({ filePath });
        
        res.json({ code: 0, msg: '图片切换成功' });
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

// 🔴 新增：质量检查接口
storyboardRouter.post('/api/storyboard/validate', async (req: Request, res: Response) => {
    try {
        const { scriptId } = req.body;
        if (!scriptId) {
            res.json({ code: -1, msg: '请指定剧本 ID' });
            return;
        }

        const shots = await db('t_storyboard').where('scriptId', scriptId).orderBy('segmentIndex').orderBy('shotIndex');

        if (!shots || shots.length === 0) {
            res.json({ code: -1, msg: '未找到分镜数据' });
            return;
        }

        const result = validateStoryboard(shots);

        res.json({
            code: 0,
            data: {
                ...result,
                shotsNeedingFix: getShotsNeedingFix(result.issues)
            }
        });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
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

// 🔴 新增：分镜图片编辑接口
storyboardRouter.post('/api/storyboard/editImage', async (req: Request, res: Response) => {
    try {
        const { storyboardId, mode, sourceImage, editPrompt, strength = 0.5 } = req.body;
        
        if (!storyboardId || !mode || !sourceImage || !editPrompt) {
            res.json({ code: -1, msg: '缺少必要参数' });
            return;
        }

        const shot = await db('t_storyboard').where('id', storyboardId).first();
        if (!shot) {
            res.json({ code: -1, msg: '分镜不存在' });
            return;
        }

        // 获取项目信息以确定图片尺寸
        const project = await db('t_project').where('id', shot.projectId).first();
        const videoRatio = project?.videoRatio || '16:9';

        // 根据视频比例计算图片尺寸 - 提升至2K级别
        const dimensionMap: Record<string, [number, number]> = {
            '9:16': [1080, 1920],
            '16:9': [2560, 1440],
            '1:1': [2048, 2048],
            '3:4': [1620, 2160],
            '4:3': [2160, 1620],
        };
        const [imgWidth, imgHeight] = dimensionMap[videoRatio] || [2560, 1440];

        // 调用图片编辑接口
        const results = await editImage({
            mode: mode as EditMode,
            sourceImage,
            editPrompt,
            strength: Math.max(0.3, Math.min(0.8, strength)),
        }, {
            prefix: `storyboard_edit_${storyboardId}`,
            width: imgWidth,
            height: imgHeight,
            ossDir: 'storyboard',
        });

        // 更新历史记录 - 存储对象数组，包含文件名和OSS地址
        let historyArr: Array<{fileName: string; publicUrl: string | null}> = [];
        try {
            const oldHistory = JSON.parse(shot.history || '[]');
            // 兼容旧格式（字符串数组）
            historyArr = oldHistory.map((h: any) => {
                if (typeof h === 'string') {
                    return { fileName: h, publicUrl: null };
                }
                return h;
            });
        } catch (e) { }

        const filePath = results[0].fileName;
        const publicUrl = results[0].publicUrl || null;
        
        // 检查是否已存在相同文件名的记录，有则更新publicUrl，无则新增
        const existingIndex = historyArr.findIndex(h => h.fileName === filePath);
        const newRecord = { fileName: filePath, publicUrl };
        
        if (existingIndex >= 0) {
            historyArr[existingIndex] = newRecord;
        } else {
            historyArr.unshift(newRecord);
        }

        // 更新分镜
        await db('t_storyboard').where('id', storyboardId).update({
            filePath,
            publicUrl,
            history: JSON.stringify(historyArr),
        });

        // 返回给前端时转换为字符串数组格式（兼容旧版）
        const historyForFrontend = historyArr.map(h => h.fileName);
        
        res.json({ 
            code: 0, 
            data: { 
                filePath, 
                publicUrl, 
                history: historyForFrontend,
                historyData: historyArr  // 新增：包含OSS地址的详细历史
            } 
        });
    } catch (err: any) { 
        res.json({ code: -1, msg: err.message }); 
    }
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

    // 🔴 新增：构建角色名 -> 音色和情绪的映射（用于自动匹配配音音色和情绪）
    const roleVoiceMap = new Map<string, string>();
    const roleEmotionMap = new Map<string, string>();
    for (const asset of assets) {
        if (asset.type === 'role' && asset.name) {
            if (asset.voiceType) {
                roleVoiceMap.set(asset.name, asset.voiceType);
            }
            if (asset.defaultEmotion) {
                roleEmotionMap.set(asset.name, asset.defaultEmotion);
            }
        }
    }

    // 清除旧分镜
    await db('t_storyboard').where('scriptId', scriptId).del();

    // 构建分镜数据（不再拆解，保持完整性）
    const rows: any[] = [];
    let globalShotIndex = 1; // 🔴 优化：全局连续分镜编号

    // 🔴 优化：预先获取视频提示词模板
    const videoPromptTemplate = await getPrompt(db, 'video_prompt');
    // 使用已有的 styleHint 变量（在第298行定义）

    for (const seg of segList) {
        for (const shot of seg.shots || []) {
            // 校验 relatedAssets：只保留实际存在的资产名称
            const rawRelated: string[] = Array.isArray(shot.relatedAssets) ? shot.relatedAssets : [];
            const validRelated = rawRelated.filter(name => assetNames.has(name));

            // 🔴 新增：解析说话者并自动匹配音色和情绪
            const speaker = shot.speaker || '';
            let dubbingVoice = '';
            let dubbingEmotion = '';
            if (speaker && speaker !== '旁白') {
                // 如果说话者是角色名，查找该角色的音色配置
                dubbingVoice = roleVoiceMap.get(speaker) || '';
                
                // 情绪推断优先级：
                // 1. AI 推断的情绪（shot.emotion）
                // 2. 角色默认情绪（roleEmotionMap）
                // 3. 默认 calm
                const validEmotions = ['calm', 'happy', 'sad', 'angry', 'fearful', 'surprised', 'fluent', 'whisper', 'disgusted'];
                if (shot.emotion && validEmotions.includes(shot.emotion)) {
                    // 优先使用 AI 推断的情绪
                    dubbingEmotion = shot.emotion;
                } else if (roleEmotionMap.has(speaker)) {
                    // 使用角色默认情绪
                    dubbingEmotion = roleEmotionMap.get(speaker) || '';
                } else {
                    // 默认中性情绪
                    dubbingEmotion = 'calm';
                }
            }

            // 🔴 优化：自动生成视频提示词
            let videoPrompt = '';
            try {
                const videoPromptInput = `
风格：${styleHint}
镜头时长：${shot.shotDuration || 5}秒
首帧静态描述：${shot.shotPrompt || ''}
动作序列：${shot.shotAction || ''}
运镜指令：${shot.cameraMovement || ''}
台词：${shot.dubbingText || '无'}
                `.trim();

                videoPrompt = await textGenerate([
                    { role: 'system', content: videoPromptTemplate },
                    { role: 'user', content: videoPromptInput }
                ], { responseFormat: 'text' });

                console.log(`[分镜生成] S${seg.segmentIndex}-${globalShotIndex} 视频提示词生成成功`);
            } catch (e: any) {
                console.error(`[分镜生成] S${seg.segmentIndex}-${globalShotIndex} 视频提示词生成失败:`, e.message);
                videoPrompt = shot.shotPrompt || ''; // 失败时使用首帧提示词作为 fallback
            }

            rows.push({
                scriptId,
                projectId: task.projectId,
                segmentIndex: seg.segmentIndex,
                segmentDesc: seg.segmentDesc || '',
                shotIndex: globalShotIndex++, // 🔴 优化：使用全局连续编号
                shotPrompt: shot.shotPrompt || '',
                shotAction: shot.shotAction || '',
                shotDuration: shot.shotDuration || 5,
                cameraMovement: shot.cameraMovement || '',
                dubbingText: shot.dubbingText || '',
                dubbingVoice, // 🔴 自动匹配的音色
                dubbingEmotion, // 🔴 自动匹配的情绪
                speaker, // 🔴 说话者
                relatedAssets: JSON.stringify(validRelated),
                videoPrompt, // 🔴 优化：自动生成的视频提示词
            });
        }
    }

    console.log(`[分镜生成] 生成分镜 ${rows.length} 个镜头`);

    // 写入分镜数据
    if (rows.length) await db('t_storyboard').insert(rows);

    return {
        segmentCount: segList.length,
        shotCount: rows.length,
    };
}

// 分镜图生成
export async function storyboardImageHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const input = JSON.parse(task.input || '{}');
    const { storyboardIds, skipExisting = true } = input; // 🔴 新增：支持 skipExisting 参数
    if (!storyboardIds?.length) throw new Error('请指定分镜 ID');

    // 🔴 修改：根据 skipExisting 参数筛选分镜
    let query = db('t_storyboard').whereIn('id', storyboardIds);
    if (skipExisting) {
        query = query.whereNull('filePath'); // 跳过已有图片的
    }
    
    const shots = await query;
    if (!shots.length) {
        console.log(`[分镜图] 所有分镜已有图片，跳过生成`);
        return { count: 0, skipped: true };
    }

    const project = await db('t_project').where('id', task.projectId).first();

    // 查询项目下所有资产（含无图片的，确保关联完整）
    const allAssets = await db('t_assets').where('projectId', task.projectId);

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];

        // 🔴 优化：增强资产匹配算法
        let relatedNames: string[] = [];
        try { relatedNames = JSON.parse(shot.relatedAssets || '[]'); } catch (e) { }

        // 1. 精确匹配：通过 relatedAssets 字段
        const exactMatches = relatedNames.length > 0
            ? allAssets.filter((a: any) => relatedNames.includes(a.name))
            : [];

        // 2. 模糊匹配：通过 shotPrompt 文本搜索
        const fuzzyMatches = allAssets.filter((a: any) => {
            const shotPrompt = shot.shotPrompt || '';
            // 完全匹配
            if (shotPrompt.includes(a.name)) return true;
            // 模糊匹配：处理资产名称变体
            const nameVariants = a.name.split(/[，,、和与]/);
            return nameVariants.some((variant: string) => shotPrompt.includes(variant.trim()));
        });

        // 3. 按资产类型优先级排序：角色 > 场景 > 道具
        const typePriority: Record<string, number> = { 'role': 1, 'scene': 2, 'props': 3 };
        const sortByType = (a: any, b: any) => (typePriority[a.type] || 99) - (typePriority[b.type] || 99);

        // 4. 合并去重，并按类型优先级排序
        const seenIds = new Set<number>();
        const matchedAssets: any[] = [];
        for (const a of [...exactMatches, ...fuzzyMatches].sort(sortByType)) {
            if (seenIds.has(a.id)) continue;
            seenIds.add(a.id);
            matchedAssets.push(a);
        }

        console.log(`[分镜图] S${shot.segmentIndex}-${shot.shotIndex} 关联资产(${matchedAssets.length}): ${matchedAssets.map((a: any) => `${a.name}(${a.type})`).join(', ') || '无'}`);

        // 🔴 优先使用 polishedPrompt（前端智能润色后的提示词），如果为空则使用 shotPrompt
        const imagePrompt = shot.polishedPrompt || shot.shotPrompt || '';

        // 🔴 优化：增强参考图注入逻辑 - 智能权重控制和一致性验证

        // 收集匹配资产中有 OSS 公网 URL 的参考图，并按优先级排序
        const assetsWithImages = matchedAssets.filter((a: any) => a.publicUrl);

        // 3. 根据资产类型分配参考图权重
        const typeWeights: Record<string, number> = {
            'role': 0.8,    // 角色资产权重最高，确保人物一致性
            'scene': 0.6,   // 场景资产中等权重
            'props': 0.4    // 道具资产较低权重
        };

        // 4. 按权重排序参考图，角色优先
        const sortedAssets = assetsWithImages.sort((a: any, b: any) => {
            const weightDiff = (typeWeights[b.type] || 0.4) - (typeWeights[a.type] || 0.4);
            if (weightDiff !== 0) return weightDiff;
            // 同类型按精确匹配优先
            return (relatedNames.includes(a.name) ? 1 : 0) - (relatedNames.includes(b.name) ? 1 : 0);
        });

        // 5. 提取参考图 URL（豆包限制最多 4 张参考图）
        const referenceImages = sortedAssets.slice(0, 4).map((a: any) => a.publicUrl as string);

        // 6. 根据资产类型组合计算参考图综合权重
        const hasRole = sortedAssets.some((a: any) => a.type === 'role');
        const hasScene = sortedAssets.some((a: any) => a.type === 'scene');
        let referenceStrength = 0.6; // 默认权重

        if (hasRole && hasScene) {
            referenceStrength = 0.75; // 角色场景都有：高权重确保整体一致性
        } else if (hasRole) {
            referenceStrength = 0.8; // 只有角色：最高权重确保人物一致性
        } else if (hasScene) {
            referenceStrength = 0.65; // 只有场景：中等权重
        }

        console.log(`[分镜图] 参考图注入: ${referenceImages.length}张, 权重=${referenceStrength}, 类型=${[...new Set(sortedAssets.map((a: any) => a.type))].join(',')}`);

        // 7. 根据项目 videoRatio 计算分镜图宽高 - 提升至2K级别
        const videoRatio = project?.videoRatio || '16:9';
        const dimensionMap: Record<string, [number, number]> = {
            '9:16': [1080, 1920],
            '16:9': [2560, 1440],
            '1:1': [2048, 2048],
            '3:4': [1620, 2160],
            '4:3': [2160, 1620],
        };
        const [imgWidth, imgHeight] = dimensionMap[videoRatio] || [2560, 1440];

        // 生成图片（传入参考图 URL 和权重参数以保持视觉一致性）
        const results = await imageGenerate(imagePrompt, {
            prefix: `storyboard_${shot.id}`,
            width: imgWidth,
            height: imgHeight,
            count: 2, // 一次生成两张图片供用户选择
            ossDir: 'storyboard',
            ...(referenceImages.length > 0 ? {
                referenceImages,
                referenceStrength,
                consistencyMode: hasRole ? 'character-focused' : 'scene-focused',
            } : {}),
        });

        // 9. 更新历史记录（存储所有生成的图片）
        let historyArr: string[] = [];
        try { historyArr = JSON.parse(shot.history || '[]'); } catch (e) { }
        
        // 将所有新生成的图片加入历史记录（去重）
        for (const result of results) {
            if (!historyArr.includes(result.fileName)) {
                historyArr.unshift(result.fileName);
            }
        }

        // 默认使用第一张图片
        const filePath = results[0].fileName;
        const publicUrl = results[0].publicUrl || null;

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
                voiceType: shot.dubbingVoice,
                emotion: shot.dubbingEmotion // 🔴 传递情绪参数
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
