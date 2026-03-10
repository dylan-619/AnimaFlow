import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT } from './env.js';
import { ensureDB } from './db/index.js';
import { authMiddleware } from './middleware/auth.js';
import { registerAllHandlers } from './task/taskTypes.js';

// 路由
import authRouter from './routes/auth.js';
import projectRouter from './routes/project.js';
import novelRouter from './routes/novel.js';
import promptRouter from './routes/prompt.js';
import settingRouter from './routes/setting.js';
import taskRouter from './routes/task.js';
import storylineRouter from './routes/storyline.js';
import outlineRouter from './routes/outline.js';
import assetsRouter from './routes/assets.js';
import scriptRouter from './routes/script.js';
import storyboardRouter from './routes/storyboard.js';
import videoRouter from './routes/video.js';
import exportRouter from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    // 初始化数据库
    await ensureDB();
    // 注册任务 handlers
    await registerAllHandlers();

    const app = express();

    // 中间件
    app.use(cors());
    app.use(morgan('dev'));
    app.use(express.json({ limit: '100mb' }));
    app.use(express.urlencoded({ extended: true, limit: '100mb' }));

    // 静态文件
    const uploadsDir = path.resolve(__dirname, '../uploads');
    app.use('/uploads', express.static(uploadsDir));

    // 前端静态文件（生产模式）
    const webDist = path.resolve(__dirname, '../../web/dist');
    app.use(express.static(webDist));

    // JWT 认证
    app.use(authMiddleware);

    // 注册路由
    app.use(authRouter);
    app.use(projectRouter);
    app.use(novelRouter);
    app.use(promptRouter);
    app.use(settingRouter);
    app.use(taskRouter);
    app.use(storylineRouter);
    app.use(outlineRouter);
    app.use(assetsRouter);
    app.use(scriptRouter);
    app.use(storyboardRouter);
    app.use(videoRouter);
    app.use(exportRouter);

    // SPA fallback — 非 API 请求返回 index.html
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
            res.sendFile(path.join(webDist, 'index.html'), (err) => {
                if (err) next();
            });
        } else {
            next();
        }
    });

    app.listen(PORT, () => {
        console.log(`[Anime] 服务已启动: http://localhost:${PORT}`);
    });
}

main().catch((err) => {
    console.error('[Anime] 启动失败:', err);
    process.exit(1);
});
