import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/index.js';
import { taskRunner } from '../task/taskRunner.js';
import type { TaskType } from '../types/index.js';

const router = Router();

const VALID_TYPES: TaskType[] = [
    'storyline', 'outline', 'assets_extract', 'asset_image',
    'script', 'storyboard', 'storyboard_image', 'storyboard_tts',
    'storyboard_inpaint', 'video', 'video_mux', 'video_generate', 'composite',
];

// 创建并执行任务
router.post('/api/task/create', async (req: Request, res: Response) => {
    try {
        const { projectId, type, input } = req.body;
        if (!projectId || !type) { res.json({ code: -1, msg: '缺少 projectId 或 type' }); return; }
        if (!VALID_TYPES.includes(type)) { res.json({ code: -1, msg: `不支持的任务类型: ${type}` }); return; }

        const taskId = uuid();
        await db('t_task').insert({
            id: taskId,
            projectId,
            type,
            status: 'pending',
            input: input ? JSON.stringify(input) : null,
            progress: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // 加入队列
        taskRunner.enqueue(taskId);

        res.json({ code: 0, data: { taskId } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 查询任务状态
router.post('/api/task/status', async (req: Request, res: Response) => {
    try {
        const { taskId } = req.body;
        if (!taskId) { res.json({ code: -1, msg: '缺少 taskId' }); return; }

        const task = await db('t_task').where('id', taskId).first();
        if (!task) { res.json({ code: -1, msg: '任务不存在' }); return; }

        res.json({
            code: 0,
            data: {
                id: task.id,
                type: task.type,
                status: task.status,
                progress: task.progress,
                output: task.output ? JSON.parse(task.output) : null,
                error: task.error,
            },
        });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 查询任务状态 (GET 方法，用于前端轮询）
router.get('/api/task/status', async (req: Request, res: Response) => {
    try {
        const { taskId } = req.query;
        if (!taskId) { res.json({ code: -1, msg: '缺少 taskId' }); return; }

        const task = await db('t_task').where('id', taskId).first();
        if (!task) { res.json({ code: -1, msg: '任务不存在' }); return; }

        res.json({
            code: 0,
            data: {
                id: task.id,
                type: task.type,
                status: task.status,
                progress: task.progress,
                output: task.output ? JSON.parse(task.output) : null,
                error: task.error,
            },
        });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 项目任务列表
router.post('/api/task/list', async (req: Request, res: Response) => {
    try {
        const { projectId, type } = req.body;
        let query = db('t_task').where('projectId', projectId).orderBy('createdAt', 'desc').limit(50);
        if (type) query = query.where('type', type);
        const list = await query;
        res.json({ code: 0, data: list });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

export default router;
