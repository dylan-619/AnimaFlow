import db from '../db/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToOSS } from '../utils/oss.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

export interface ImageResult {
    fileName: string;      // 本地文件名（相对于 uploads/）
    publicUrl: string | null; // OSS 公网 URL（未配置 OSS 则为 null）
}

// 编辑模式类型定义
export type EditMode = 'create' | 'local_edit' | 'style_transfer' | 'expand';

export interface EditOptions {
    mode: EditMode;
    sourceImage: string;        // 源图片路径或URL
    editPrompt: string;         // 编辑描述
    strength: number;           // 编辑强度 0.3-0.8
}

/**
 * 图片生成统一入口
 * @returns 生成结果数组，包含本地文件名和 OSS 公网 URL
 */
export async function imageGenerate(
    prompt: string,
    options?: {
        width?: number;
        height?: number;
        count?: number;
        prefix?: string;
        size?: string;
        referenceImages?: string[];
        referenceStrength?: number; // 🔴 新增：参考图权重（0-1）
        consistencyMode?: string;   // 🔴 新增：一致性模式标记
        ossDir?: string
    },
): Promise<ImageResult[]> {
    const setting = await db('t_setting').where('userId', 1).first();
    const config = await db('t_config').where('id', setting?.imageConfigId).first();
    if (!config?.apiKey) throw new Error('请先在设置中配置图像模型的 API Key');

    switch (config.manufacturer) {
        case 'volcengine':
            return volcengineImage(config, prompt, options);
        default:
            throw new Error(`不支持的图像厂商: ${config.manufacturer}，当前仅支持: volcengine`);
    }
}

/**
 * 图片编辑入口（图生图）
 * 根据编辑模式生成增强提示词，然后调用图片生成接口
 */
export async function editImage(
    options: EditOptions,
    generateOptions?: {
        width?: number;
        height?: number;
        prefix?: string;
        ossDir?: string;
    },
): Promise<ImageResult[]> {
    const { mode, sourceImage, editPrompt, strength } = options;

    // 根据编辑模式生成增强提示词
    const enhancedPrompt = generateEditPrompt(editPrompt, mode, strength);

    console.log(`[图片编辑] 模式: ${mode}, 强度: ${strength}, 源图: ${sourceImage}`);
    console.log(`[图片编辑] 增强提示词: ${enhancedPrompt.slice(0, 100)}...`);

    // 调用图片生成接口，传入源图片作为参考图
    return imageGenerate(enhancedPrompt, {
        ...generateOptions,
        referenceImages: [sourceImage],
        referenceStrength: strength,
        consistencyMode: mode,
    });
}

/**
 * 根据编辑模式生成增强提示词
 */
function generateEditPrompt(editPrompt: string, mode: EditMode, strength: number): string {
    // 强度关键词映射
    const strengthKeywords: Record<number, string> = {
        0.3: 'subtle, gentle modification, light changes',
        0.4: 'moderate modification, medium strength',
        0.5: 'medium strength, balanced modification',
        0.6: 'strong edit, significant changes',
        0.7: 'significant transformation, major changes',
        0.8: 'dramatic change, complete transformation',
    };

    const strengthKeyword = strengthKeywords[strength] || strengthKeywords[0.5];

    switch (mode) {
        case 'local_edit':
            // 局部修改：保持原画面，修改特定区域
            return `${editPrompt}, maintain the original composition and lighting, keep the overall style consistent, ${strengthKeyword}`;

        case 'style_transfer':
            // 风格迁移：改变整体风格
            return `${editPrompt}, transform the style completely, ${strengthKeyword}, artistic transformation`;

        case 'expand':
            // 画面扩展：扩展边界
            return `${editPrompt}, seamlessly extend the image, match the original style and lighting, ${strengthKeyword}`;

        default:
            return editPrompt;
    }
}

/**
 * 直接通过任意 config 配置对象生成图像（用于设置页中的测试功能）
 * 返回 fileName 数组（简化版，不需要 OSS URL）
 */
export async function testImageGenerate(
    config: any,
    prompt: string,
    options?: { width?: number; height?: number; count?: number; prefix?: string; size?: string },
): Promise<string[]> {
    if (!config?.apiKey) throw new Error('API Key 未填写');
    switch (config.manufacturer) {
        case 'volcengine': {
            const results = await volcengineImage(config, prompt, options);
            return results.map(r => r.fileName);
        }
        default:
            throw new Error(`不支持的图像厂商: ${config.manufacturer}`);
    }
}

/**
 * 根据模型名称获取默认分辨率
 * seedream-4-5 及以上要求最小 1920x1920 (3,686,400 像素)
 */
function getDefaultSize(model: string): string {
    if (model.includes('seedream-4-5') || model.includes('seedream-5')) {
        return '1920x1920';
    }
    return '1024x1024';
}

/**
 * 火山引擎（豆包）图片生成 - 基于大模型 V3/V4 接口
 * 官网示例：https://ark.cn-beijing.volces.com/api/v3/images/generations
 */
async function volcengineImage(
    config: any,
    prompt: string,
    options?: any,
): Promise<ImageResult[]> {
    const modelName = config.model || 'doubao-seedream-4-0-250828';
    const requestBody: any = {
        model: modelName,
        prompt,
        sequential_image_generation: 'disabled',
        response_format: 'url',
        size: options?.size || getDefaultSize(modelName),
        watermark: false
    };

    // 如果传入了参考图 URL 数组，按照官方文档加入 image 参数
    if (options?.referenceImages && options.referenceImages.length > 0) {
        requestBody.image = options.referenceImages;

        // 🔴 新增：记录参考图权重和一致性模式（豆包API当前不支持权重参数，但记录用于未来升级）
        if (options.referenceStrength !== undefined) {
            console.log(`[图片生成] 参考图权重: ${options.referenceStrength}, 一致性模式: ${options.consistencyMode || 'default'}`);
            // TODO: 当豆包API支持权重参数时，在此处添加：requestBody.reference_strength = options.referenceStrength;
        }
    }

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`豆包图片生成失败: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // 保存图片到本地 + 上传 OSS
    const results: ImageResult[] = [];
    const imageList = data.data || [];
    const ossDir = options?.ossDir || 'images';
    console.log(`[图片生成] 返回 ${imageList.length} 张图片, ossDir=${ossDir}`);

    for (let i = 0; i < imageList.length; i++) {
        const fileName = `${options?.prefix || 'img'}_${Date.now()}_${i}.png`;
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        if (imageList[i].url && imageList[i].url.startsWith('http')) {
            const imgRes = await fetch(imageList[i].url);
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            console.log(`[图片生成] 下载保存: ${fileName} (${buffer.length} bytes)`);
        } else if (imageList[i].b64_json) {
            const buf = Buffer.from(imageList[i].b64_json, 'base64');
            fs.writeFileSync(filePath, buf);
            console.log(`[图片生成] Base64 保存: ${fileName} (${buf.length} bytes)`);
        } else {
            console.warn(`[图片生成] 第 ${i} 张图片无有效数据, keys:`, Object.keys(imageList[i]));
        }

        // 自动尝试上传 OSS
        const publicUrl = await uploadToOSS(fileName, ossDir);
        console.log(`[图片生成] OSS 上传结果: ${publicUrl || '未上传(OSS 未配置或失败)'}`);
        results.push({ fileName, publicUrl });
    }

    if (results.length === 0) throw new Error('图片生成成功但未返回图片数据');
    return results;
}
