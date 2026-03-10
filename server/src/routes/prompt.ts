import { Router, Request, Response } from 'express';
import db from '../db/index.js';

const router = Router();

// 提示词列表
router.post('/api/prompt/list', async (_req: Request, res: Response) => {
    try {
        const list = await db('t_prompts').orderBy('id');
        res.json({ code: 0, data: list });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 更新提示词（自定义）
router.post('/api/prompt/update', async (req: Request, res: Response) => {
    try {
        const { id, customValue } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_prompts').where('id', id).update({ customValue });
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 重置提示词
router.post('/api/prompt/reset', async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_prompts').where('id', id).update({ customValue: null });
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

export default router;
