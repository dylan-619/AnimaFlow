import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');
const upload = multer({ dest: uploadsDir });

const router = Router();

// 通用文件上传（BGM 等）
router.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) { res.json({ code: -1, msg: '未上传文件' }); return; }
        const ext = path.extname(req.file.originalname) || '.dat';
        const fileName = `upload_${Date.now()}${ext}`;
        fs.renameSync(req.file.path, path.join(uploadsDir, fileName));
        res.json({ code: 0, data: { filePath: fileName } });
    } catch (err: any) { res.json({ code: -1, msg: err.message }); }
});

// 项目列表
router.post('/api/project/list', async (_req: Request, res: Response) => {
    try {
        const list = await db('t_project').orderBy('createTime', 'desc');
        res.json({ code: 0, data: list });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 项目详情
router.post('/api/project/detail', async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        const project = await db('t_project').where('id', id).first();
        if (!project) { res.json({ code: -1, msg: '项目不存在' }); return; }

        const [novelCount, outlineCount, scriptCount, assetCount] = await Promise.all([
            db('t_novel').where('projectId', id).count('* as c').first(),
            db('t_outline').where('projectId', id).count('* as c').first(),
            db('t_script').where('projectId', id).count('* as c').first(),
            db('t_assets').where('projectId', id).count('* as c').first(),
        ]);

        res.json({
            code: 0,
            data: {
                ...project,
                novelCount: (novelCount as any)?.c || 0,
                outlineCount: (outlineCount as any)?.c || 0,
                scriptCount: (scriptCount as any)?.c || 0,
                assetCount: (assetCount as any)?.c || 0,
            },
        });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 创建项目
router.post('/api/project/create', async (req: Request, res: Response) => {
    try {
        const { name, type, artStyle, styleGuide, videoRatio, intro } = req.body;
        if (!name) { res.json({ code: -1, msg: '项目名称不能为空' }); return; }

        const [id] = await db('t_project').insert({
            name, type, artStyle, styleGuide, videoRatio, intro, createTime: Date.now(), userId: 1,
        });
        res.json({ code: 0, data: { id } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 更新项目
router.post('/api/project/update', async (req: Request, res: Response) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少项目 ID' }); return; }
        await db('t_project').where('id', id).update(fields);
        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 删除项目（级联删除）
router.post('/api/project/delete', async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        if (!id) { res.json({ code: -1, msg: '缺少项目 ID' }); return; }

        // 级联删除相关的子表数据，确保项目删除干净
        // 表结构关系：
        // t_novel -> projectId
        // t_storyline -> projectId
        // t_outline -> projectId
        // t_script -> projectId
        // t_assets -> projectId
        // t_storyboard -> projectId
        // t_videoConfig -> projectId
        // t_task -> projectId
        // t_video -> configId (通过 t_videoConfig.scriptId 关联)
        // t_prompts -> 全局表，无 projectId，不需要删除

        // 1. 删除直接关联 projectId 的子表
        const tablesWithProjectId = [
            't_novel', 't_storyline', 't_outline', 't_script',
            't_assets', 't_storyboard', 't_task'
        ];
        for (const table of tablesWithProjectId) {
            await db(table).where('projectId', id).del();
        }

        // 2. 删除 t_videoConfig (有 projectId)
        const videoConfigs = await db('t_videoConfig').where('projectId', id).select('id');
        if (videoConfigs.length > 0) {
            const configIds = videoConfigs.map((c: any) => c.id);
            // 2.1 删除关联的 t_video 记录
            await db('t_video').whereIn('configId', configIds).del();
            // 2.2 删除 t_videoConfig 记录
            await db('t_videoConfig').where('projectId', id).del();
        }

        // 3. 删除项目本身
        await db('t_project').where('id', id).del();

        res.json({ code: 0 });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

export default router;
