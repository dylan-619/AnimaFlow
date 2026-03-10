import { Router, Request, Response } from 'express';
import db from '../db/index.js';

const router = Router();

// 章节列表
router.post('/api/novel/list', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.body;
        const list = await db('t_novel').where('projectId', projectId).orderBy('chapterIndex');
        res.json({ code: 0, data: list });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 批量添加章节
router.post('/api/novel/batchAdd', async (req: Request, res: Response) => {
    try {
        const { projectId, chapters } = req.body;
        if (!projectId || !chapters?.length) {
            res.json({ code: -1, msg: '缺少参数' }); return;
        }

        const rows = chapters.map((ch: any) => ({
            chapterIndex: ch.chapterIndex,
            chapter: ch.chapter,
            chapterData: ch.chapterData,
            reel: ch.reel || null,
            projectId,
            createTime: Date.now(),
        }));
        await db('t_novel').insert(rows);

        res.json({ code: 0, data: { count: rows.length } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 更新章节
router.post('/api/novel/update', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少 ID' }); return; }
        await db('t_novel').where('id', id).update(fields);
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 删除章节
router.post('/api/novel/delete', async (req: Request, res: Response) => {
    try {
        const { ids } = req.body;
        if (!ids?.length) { res.json({ code: -1, msg: '缺少 IDs' }); return; }
        await db('t_novel').whereIn('id', ids).del();
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

export default router;
