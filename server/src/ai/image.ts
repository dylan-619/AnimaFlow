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

/**
 * 图片生成统一入口
 * @returns 生成结果数组，包含本地文件名和 OSS 公网 URL
 */
export async function imageGenerate(
    prompt: string,
    options?: { width?: number; height?: number; count?: number; prefix?: string; size?: string; referenceImages?: string[]; ossDir?: string },
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
