import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { EpisodeData } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../../uploads');

// 确保 uploads 目录存在
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * 将 Base64 保存为文件
 */
export function saveBase64File(base64: string, fileName: string): string {
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return fileName;
}

/**
 * 读取文件为 Base64
 */
export function readFileBase64(filePath: string): string {
    const fullPath = filePath.startsWith('/') ? filePath : path.join(uploadsDir, filePath);
    return fs.readFileSync(fullPath, 'base64');
}

/**
 * 从 URL 下载文件到本地
 */
export async function downloadFile(url: string, fileName: string): Promise<string> {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return fileName;
}

/**
 * 格式化 EpisodeData 为剧本生成的用户 Prompt
 * (复用旧版 generateScript.ts 的 formatEpisodePrompt 逻辑)
 */
export function formatEpisodePrompt(episode: EpisodeData): string {
    const scenesStr = episode.scenes
        .map((s, i) => `  场景${i + 1}：${s.name}\n    环境描写：${s.description}`)
        .join('\n');

    const charsStr = episode.characters
        .map((c, i) => `  角色${i + 1}：${c.name}\n    描述：${c.description}`)
        .join('\n');

    const propsStr = episode.props
        .map((p, i) => `  道具${i + 1}：${p.name}\n    描述：${p.description}`)
        .join('\n');

    const keyEventsStr = episode.keyEvents
        .map((e, i) => `  ${['起', '承', '转', '合'][i] || i + 1}：${e}`)
        .join('\n');

    const highlightsStr = episode.visualHighlights
        .map((h, i) => `  ${i + 1}. ${h}`)
        .join('\n');

    return `
═══════════════════════════════════════
第${episode.episodeIndex}集：${episode.title}
关联章节：第${episode.chapterRange.join('、')}章
═══════════════════════════════════════

【场景列表】必须全部使用（按出场顺序排列）
${scenesStr}

【角色列表】必须全部使用
${charsStr}

【道具列表】必须全部使用
${propsStr}

【核心冲突】
${episode.coreConflict}

【剧情主干(outline)】⚠️ 最高优先级 - 剧本必须严格按此顺序展开
${episode.outline}

【开篇钩子(openingHook)】必须是剧本第一个镜头
${episode.openingHook}

【剧情节点(keyEvents)】严格按顺序：起→承→转→合
${keyEventsStr}

【情感曲线】
${episode.emotionalCurve}

【视觉高光】
${highlightsStr}

【结尾钩子(endingHook)】
${episode.endingHook}

【金句】必须原文出现在高潮段落
${episode.classicQuotes.join('\n')}
`.trim();
}

/**
 * 获取提示词内容（优先取 customValue）
 */
export async function getPrompt(db: any, code: string): Promise<string> {
    const row = await db('t_prompts').where('code', code).first();
    if (!row) throw new Error(`提示词 ${code} 不存在`);
    return row.customValue || row.defaultValue || '';
}

/**
 * 尝试从 AI 返回的文本中提取 JSON
 */
export function extractJSON(text: string): string {
    // 尝试直接解析
    try { JSON.parse(text); return text; } catch { }

    // 尝试提取 ```json ... ``` 块
    const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlock) {
        try { JSON.parse(jsonBlock[1]); return jsonBlock[1]; } catch { }
    }

    // 尝试找到 [ 或 { 开头的部分
    const match = text.match(/[\[{][\s\S]*[\]}]/);
    if (match) {
        try { JSON.parse(match[0]); return match[0]; } catch { }
    }

    throw new Error('无法从 AI 返回内容中提取有效 JSON');
}
