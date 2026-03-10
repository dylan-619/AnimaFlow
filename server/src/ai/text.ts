import OpenAI from 'openai';
import db from '../db/index.js';

/**
 * 文本生成（统一入口）
 * 支持: DeepSeek / OpenAI / 任何 OpenAI 兼容接口
 */
export async function textGenerate(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'json' | 'text' },
): Promise<string> {
    const setting = await db('t_setting').where('userId', 1).first();
    const config = await db('t_config').where('id', setting?.textConfigId).first();
    if (!config?.apiKey) throw new Error('请先在设置中配置文本模型的 API Key');

    const baseURL = config.baseUrl || 'https://api.deepseek.com';
    const model = config.model || 'deepseek-chat';
    const maskedKey = config.apiKey ? config.apiKey.slice(0, 8) + '***' : '(空)';
    const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    console.log(`[文本AI] 配置: name=${config.name}, model=${model}, baseURL=${baseURL}, apiKey=${maskedKey}, manufacturer=${config.manufacturer}`);
    console.log(`[文本AI] 开始调用 消息数=${messages.length}, 输入字符数=${inputChars}, maxTokens=${options?.maxTokens ?? 8192}`);
    const startTime = Date.now();

    const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL,
        timeout: 180_000, // 3 分钟超时，防止 API 无限挂起
    });

    try {
        const completion = await client.chat.completions.create({
            model,
            messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 8192,
            // ...(options?.responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
        });

        const elapsed = Date.now() - startTime;
        const content = completion.choices[0]?.message?.content ?? '';
        console.log(`[文本AI] 调用完成 耗时=${elapsed}ms, 返回字符数=${content.length}, usage=${JSON.stringify(completion.usage || {})}`);
        if (!content) throw new Error('AI 返回内容为空');
        return content;
    } catch (err: any) {
        const elapsed = Date.now() - startTime;
        console.error(`[文本AI] 调用失败 耗时=${elapsed}ms, 错误: ${err.message}`);
        throw err;
    }
}
