import { Router, Request, Response } from 'express';
import db from '../db/index.js';
import OpenAI from 'openai';
import { testImageGenerate } from '../ai/image.js';
import { generateTTS } from '../ai/tts.js';
import path from 'path';
import fs from 'fs';

const router = Router();

// 获取设置（含模型配置列表）
router.post('/api/setting/get', async (_req: Request, res: Response) => {
    try {
        const setting = await db('t_setting').where('userId', 1).first();
        const configs = await db('t_config').orderBy('id');
        res.json({ code: 0, data: { setting, configs } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 更新设置（切换当前使用的模型 + OSS 配置）
router.post('/api/setting/update', async (req: Request, res: Response) => {
    try {
        const { textConfigId, imageConfigId, videoConfigId, ttsConfigId,
            ossAccessKeyId, ossAccessKeySecret, ossBucket, ossRegion, ossCustomDomain } = req.body;
        const updates: any = {};
        if (textConfigId !== undefined) updates.textConfigId = textConfigId;
        if (imageConfigId !== undefined) updates.imageConfigId = imageConfigId;
        if (videoConfigId !== undefined) updates.videoConfigId = videoConfigId;
        if (ttsConfigId !== undefined) updates.ttsConfigId = ttsConfigId;
        if (ossAccessKeyId !== undefined) updates.ossAccessKeyId = ossAccessKeyId;
        if (ossAccessKeySecret !== undefined) updates.ossAccessKeySecret = ossAccessKeySecret;
        if (ossBucket !== undefined) updates.ossBucket = ossBucket;
        if (ossRegion !== undefined) updates.ossRegion = ossRegion;
        if (ossCustomDomain !== undefined) updates.ossCustomDomain = ossCustomDomain;

        await db('t_setting').where('userId', 1).update(updates);
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 添加模型配置
router.post('/api/setting/addModel', async (req: Request, res: Response) => {
    try {
        const { name, type, model, apiKey, baseUrl, manufacturer } = req.body;
        if (!type || !manufacturer) {
            res.json({ code: -1, msg: '类型和厂商不能为空' }); return;
        }
        const [id] = await db('t_config').insert({
            name, type, model, apiKey, baseUrl, manufacturer, createTime: Date.now(), userId: 1,
        });
        res.json({ code: 0, data: { id } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 更新模型配置
router.post('/api/setting/updateModel', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_config').where('id', id).update(fields);
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 删除模型配置
router.post('/api/setting/deleteModel', async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_config').where('id', id).del();
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 测试模型连通性
router.post('/api/setting/testModel', async (req: Request, res: Response) => {
    try {
        const { configId } = req.body;
        const config = await db('t_config').where('id', configId).first();
        if (!config) { res.json({ code: -1, msg: '配置不存在' }); return; }

        if (config.type === 'text') {
            // 用 OpenAI SDK 测试文本模型
            const client = new OpenAI({
                apiKey: config.apiKey || '',
                baseURL: config.baseUrl || 'https://api.deepseek.com',
            });
            const completion = await client.chat.completions.create({
                model: config.model || 'deepseek-chat',
                messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
                max_tokens: 20,
            });
            const reply = completion.choices[0]?.message?.content || '';
            res.json({ code: 0, data: { success: true, message: `模型回复: ${reply}` } });
        } else if (config.type === 'image') {
            // 调用图像生成引擎，测试生成“一只卡通小狗”
            try {
                const images = await testImageGenerate(config, '一只卡通小狗', { prefix: 'test_img' });
                res.json({ code: 0, data: { success: true, message: '图像模型测试成功', imagePath: images[0] } });
            } catch (err: any) {
                res.json({ code: 0, data: { success: false, message: `图像生成测试失败: ${err.message}` } });
            }
        } else if (config.type === 'tts') {
            // TTS 真实测试
            const logs: string[] = [];
            const testText = '你好，Anime!';
            const testVoice = config.manufacturer === 'minimax' ? 'male-qn-qingse' : 'alloy';
            logs.push(`[TTS测试] 厂商: ${config.manufacturer}, 模型: ${config.model}`);
            logs.push(`[TTS测试] BaseURL: ${config.baseUrl || '(默认)'}`);
            logs.push(`[TTS测试] 测试文本: "${testText}", 音色: ${testVoice}`);
            try {
                const startTime = Date.now();
                const audioBuffer = await generateTTS({
                    text: testText,
                    voiceType: testVoice,
                    configId: config.id
                });
                const elapsed = Date.now() - startTime;
                logs.push(`[TTS测试] 生成成功! 耗时: ${elapsed}ms, 音频大小: ${audioBuffer.length} bytes`);

                const uploadsDir = path.resolve('uploads/tts_test');
                fs.mkdirSync(uploadsDir, { recursive: true });
                const fileName = `tts_test_${Date.now()}.mp3`;
                const filePath = path.join(uploadsDir, fileName);
                fs.writeFileSync(filePath, audioBuffer);
                const relativePath = `tts_test/${fileName}`;
                logs.push(`[TTS测试] 文件已保存: ${relativePath}`);

                res.json({
                    code: 0,
                    data: {
                        success: true,
                        message: `TTS 测试成功! 耗时 ${elapsed}ms`,
                        audioPath: relativePath,
                        logs
                    }
                });
            } catch (err: any) {
                logs.push(`[TTS测试] 失败: ${err.message}`);
                res.json({
                    code: 0,
                    data: { success: false, message: `TTS 测试失败: ${err.message}`, logs }
                });
            }
        } else {
            // 视频模型检查 apiKey 是否存在即可
            if (!config.apiKey) {
                res.json({ code: 0, data: { success: false, message: 'API Key 未填写' } });
            } else {
                res.json({ code: 0, data: { success: true, message: 'API Key 已配置（完整测试需实际调用）' } });
            }
        }
    } catch (err: any) {
        res.json({ code: 0, data: { success: false, message: `连接失败: ${err.message}` } });
    }
});

export default router;
