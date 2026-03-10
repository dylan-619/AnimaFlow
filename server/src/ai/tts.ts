import db from '../db/index.js';

export const VOLCENGINE_VOICES = [
    { name: '灿灿 (活泼女声)', value: 'BV001_streaming' },
    { name: '超哥 (沉稳男声)', value: 'BV002_streaming' },
    { name: '星火 (阳光男声)', value: 'BV115_streaming' },
    { name: '悠悠 (温柔女声)', value: 'BV119_streaming' },
    { name: '反派 (低沉男声)', value: 'BV056_streaming' },
];

/**
 * 文本转语音（TTS）入口
 * 目前实现接入火山引擎（剪映同款音色方案模拟）
 */
export async function generateTTS(params: {
    text: string;
    voiceType: string;
    configId?: number;
}): Promise<Buffer> {
    const config = await getTTSConfig(params.configId);

    // 适配 MiniMax (星火/语音大模型)
    if (config.manufacturer === 'minimax') {
        const response = await fetch(`${config.baseUrl || 'https://api.minimax.chat/v1'}/t2a_v2`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model || 'speech-01-turbo',
                text: params.text,
                stream: false,
                voice_setting: {
                    voice_id: params.voiceType,
                    speed: 1,
                    vol: 1,
                    pitch: 0
                },
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3',
                    channel: 1
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`MiniMax TTS生成失败 [${response.status}]: ${errText}`);
        }

        const json: any = await response.json();
        if (json.base_resp && json.base_resp.status_code !== 0) {
            throw new Error(`MiniMax API 报错: ${json.base_resp.status_msg}`);
        }

        if (json.data && json.data.audio) {
            // MiniMax 返回的 audio 是 hex 编码字符串
            return Buffer.from(json.data.audio, 'hex');
        } else {
            throw new Error('MiniMax 返回音频数据为空');
        }
    }

    // 适配 OpenAI Compatible TTS API
    const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model || 'tts-1',
            input: params.text,
            voice: params.voiceType
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`TTS生成失败 [${response.status}]: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function getTTSConfig(configId?: number) {
    if (configId) {
        const cfg = await db('t_config').where('id', configId).first();
        if (!cfg) throw new Error('指定的 TTS 配置不存在');
        return cfg;
    }
    const setting = await db('t_setting').where('userId', 1).first();
    const config = await db('t_config').where('id', setting?.ttsConfigId).first();
    if (!config?.apiKey) throw new Error('请先在系统设置中配置 TTS 模型的参数');
    return config;
}
