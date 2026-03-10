import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';

// 不需要认证的路径
const PUBLIC_PATHS = ['/api/auth/login'];

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    if (PUBLIC_PATHS.includes(req.path)) return next();

    // 静态资源不需要认证
    if (!req.path.startsWith('/api/')) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ code: -1, msg: '未登录' });
        return;
    }

    const token = authHeader.slice(7);
    const setting = await db('t_setting').where('userId', 1).first();
    if (!setting?.tokenKey) {
        res.status(401).json({ code: -1, msg: '认证配置异常' });
        return;
    }

    try {
        const decoded = jwt.verify(token, setting.tokenKey) as any;
        (req as any).userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ code: -1, msg: 'Token 无效或已过期' });
    }
}
