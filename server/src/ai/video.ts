import db from '../db/index.js';
import { uploadToOSS } from '../utils/oss.js';

/**
 * 提交视频生成任务
 * @returns 外部任务 ID
 */
export async function videoGenerate(params: {
    prompt: string;
    imageBase64?: string[];
    imageFileNames?: string[];  // 本地文件名（优先用 OSS URL，降级用 base64）
    duration?: number;
    resolution?: string;
    ratio?: string;
    draft?: boolean;
    cameraFixed?: boolean;
    generateAudio?: boolean;
    configId?: number;
}): Promise<{ externalTaskId: string }> {
    const config = await getVideoConfig(params.configId);

    switch (config.manufacturer) {
        case 'volcengine':
            return volcengineVideoSubmit(config, params);
        default:
            throw new Error(`不支持的视频厂商: ${config.manufacturer}`);
    }
}

/**
 * 查询视频生成状态
 */
export async function videoQuery(
    externalTaskId: string,
    configId?: number,
): Promise<{ completed: boolean; url?: string; error?: string }> {
    const config = await getVideoConfig(configId);

    switch (config.manufacturer) {
        case 'volcengine':
            return volcengineVideoQuery(config, externalTaskId);
        default:
            throw new Error(`不支持的视频厂商: ${config.manufacturer}`);
    }
}

/**
 * 轮询等待视频完成
 */
export async function pollVideoTask(
    externalTaskId: string,
    configId?: number,
    maxAttempts = 120,
    interval = 5000,
): Promise<string> {
    console.log(`[视频] 开始轮询任务: ${externalTaskId}, 最多 ${maxAttempts} 次, 间隔 ${interval}ms`);
    let consecutiveErrors = 0;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, interval));

        try {
            const result = await videoQuery(externalTaskId, configId);
            consecutiveErrors = 0; // 请求成功，重置计数

            if (i % 6 === 0) {
                console.log(`[视频] 轮询第 ${i + 1} 次, 状态: ${result.completed ? '完成' : '进行中'}${result.error ? ', 错误: ' + result.error : ''}`);
            }
            if (result.error) throw new Error(result.error);
            if (result.completed) {
                if (result.url) {
                    console.log(`[视频] 生成完成, URL: ${result.url.slice(0, 80)}...`);
                    return result.url;
                } else {
                    throw new Error('视频任务已完成但未返回视频 URL，请检查 API 返回格式');
                }
            }
        } catch (err: any) {
            consecutiveErrors++;
            console.warn(`[视频] 轮询第 ${i + 1} 次请求失败 (连续 ${consecutiveErrors} 次): ${err.message}`);
            // 如果是 API 返回的业务错误（非网络错误），直接抛出
            if (err.message && !err.message.includes('fetch failed') && !err.message.includes('ETIMEDOUT') && !err.message.includes('ECONNRESET')) {
                throw err;
            }
            // 网络错误容忍 5 次连续失败
            if (consecutiveErrors >= 5) {
                throw new Error(`视频查询连续失败 ${consecutiveErrors} 次: ${err.message}`);
            }
        }
    }
    throw new Error(`视频生成超时（已等待 ${(maxAttempts * interval) / 1000}s）`);
}

// ---------- 内部函数 ----------

async function getVideoConfig(configId?: number) {
    if (configId) {
        const config = await db('t_config').where('id', configId).first();
        if (config) return config;
    }
    const setting = await db('t_setting').where('userId', 1).first();
    const config = await db('t_config').where('id', setting?.videoConfigId).first();
    if (!config?.apiKey) throw new Error('请先在设置中配置视频模型的 API Key');
    return config;
}

/**
 * 火山引擎视频生成 - 提交任务 (V3 API 对应 Ark 模型)
 */
async function volcengineVideoSubmit(config: any, params: any): Promise<{ externalTaskId: string }> {
    const content: any[] = [];

    // V3 使用 content 数组组合 prompt 
    if (params.prompt) {
        content.push({
            type: 'text',
            text: params.prompt
        });
    }

    // 处理首帧图片：优先上传 OSS 得到公网 URL，降级用 base64 data URI
    if (params.imageFileNames?.length) {
        for (const fileName of params.imageFileNames) {
            // 尝试上传到 OSS 获取公网 URL
            const ossUrl = await uploadToOSS(fileName, 'video_frames');
            if (ossUrl) {
                console.log(`[视频] 首帧使用 OSS URL: ${ossUrl}`);
                content.push({
                    type: 'image_url',
                    image_url: { url: ossUrl }
                });
            } else if (params.imageBase64?.length) {
                // 降级使用 base64
                const b64 = params.imageBase64.shift();
                const url = b64.startsWith('http') || b64.startsWith('data:')
                    ? b64
                    : `data:image/png;base64,${b64}`;
                console.log(`[视频] 首帧使用 base64 data URI (长度: ${url.length})`);
                content.push({
                    type: 'image_url',
                    image_url: { url }
                });
            }
        }
    } else if (params.imageBase64?.length) {
        // 兼容旧调用方式
        params.imageBase64.forEach((b64: string) => {
            const url = b64.startsWith('http') || b64.startsWith('data:')
                ? b64
                : `data:image/png;base64,${b64}`;
            console.log(`[视频] 首帧使用 base64 data URI (长度: ${url.length})`);
            content.push({
                type: 'image_url',
                image_url: { url }
            });
        });
    }

    const body: any = {
        model: config.model || 'doubao-seedance-1-5-pro-251215',
        content,
        watermark: false,
        return_last_frame: true, // 这是连贯生成多个视频必须的
    };

    if (params.ratio) body.ratio = params.ratio;
    if (params.resolution) body.resolution = params.resolution;
    if (params.duration) body.duration = params.duration;
    if (params.cameraFixed !== undefined) body.camera_fixed = params.cameraFixed;
    if (params.draft !== undefined) body.draft = params.draft;
    if (params.generateAudio !== undefined) body.generate_audio = params.generateAudio;

    console.log(`[视频] 提交任务: model=${body.model}, content项数=${content.length}`);

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log(`[视频] 提交响应:`, JSON.stringify(data).slice(0, 300));

    if (data.error || !data.id) {
        throw new Error(`视频任务提交失败: ${data.error?.message || JSON.stringify(data)}`);
    }

    console.log(`[视频] 任务已提交, taskId: ${data.id}`);
    return { externalTaskId: data.id };
}

/**
 * 火山引擎视频生成 - 查询状态 (V3 API)
 */
async function volcengineVideoQuery(config: any, taskId: string) {
    const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
        },
    });

    const data = await response.json();
    if (data.error) {
        console.error(`[视频] 查询错误: ${data.error.message || JSON.stringify(data.error)}`);
        return { completed: false, error: data.error.message || '查询失败' };
    }

    const taskStatus = data.status;

    if (taskStatus === 'succeed' || taskStatus === 'succeeded' || taskStatus === 'done') {
        let videoUrl = '';

        if (data.content) {
            if (Array.isArray(data.content)) {
                // 格式1: content 是数组 [{type: "video_url", video_url: {url: "..."}}]
                const v = data.content.find((c: any) => c.type === 'video_url');
                if (v && v.video_url && v.video_url.url) {
                    videoUrl = v.video_url.url;
                }
            } else if (typeof data.content === 'object') {
                // 格式2: content 是对象 {video_url: "https://..."}
                if (data.content.video_url) {
                    videoUrl = data.content.video_url;
                }
            }
        }

        console.log(`[视频] 任务完成, videoUrl: ${videoUrl ? videoUrl.slice(0, 80) + '...' : '空!'}`);
        return { completed: true, url: videoUrl };
    }

    if (taskStatus === 'failed') {
        const errMsg = data.error?.message || '视频生成失败';
        console.error(`[视频] 任务失败: ${errMsg}`);
        return { completed: false, error: errMsg };
    }

    return { completed: false };
}
