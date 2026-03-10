import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import db from '../db/index.js';

const router = Router();

router.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) {
            res.json({ code: -1, msg: '用户名和密码不能为空' });
            return;
        }

        const user = await db('t_user').where({ name, password }).first();
        if (!user) {
            res.json({ code: -1, msg: '用户名或密码错误' });
            return;
        }

        // 生成或获取 tokenKey
        let setting = await db('t_setting').where('userId', user.id).first();
        if (!setting?.tokenKey) {
            const tokenKey = uuid().slice(0, 8);
            if (setting) {
                await db('t_setting').where('id', setting.id).update({ tokenKey });
            } else {
                await db('t_setting').insert({ id: 1, userId: user.id, tokenKey });
            }
            setting = { ...setting, tokenKey };
        }

        const token = jwt.sign({ userId: user.id, name: user.name }, setting.tokenKey, { expiresIn: '7d' });

        res.json({
            code: 0,
            data: {
                token,
                user: { id: user.id, name: user.name },
            },
        });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

export default router;
