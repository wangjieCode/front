import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../db/DatabaseManager';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '../utils/id';
import dayjs from 'dayjs';

export function createAuthRoutes(): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({
          success: false,
          error: '用户名不能为空',
        });
      }

      if (!/^[a-zA-Z]+$/.test(username)) {
        return res.status(400).json({
          success: false,
          error: '用户名只能包含英文字母',
        });
      }

      if (username.length < 2 || username.length > 50) {
        return res.status(400).json({
          success: false,
          error: '用户名长度必须在 2-50 个字符之间',
        });
      }

      const db = DatabaseManager.getDb();
      
      const existingUsers = await db.select().from(users).where(eq(users.username, username)).limit(1);
      let user = existingUsers[0];

      if (!user) {
        const [newUser] = await db.insert(users).values({
          id: newId(),
          username,
        }).returning();
        user = newUser;
      } else {
        await db.update(users)
          .set({ lastLoginAt: dayjs().toDate() })
          .where(eq(users.id, user.id));
      }

      return res.json({
        success: true,
        data: {
          userId: user.id,
          username: user.username,
        },
      });
    } catch (error) {
      console.error('登录失败:', error);
      return res.status(500).json({
        success: false,
        error: '登录失败',
      });
    }
  });

  router.get('/verify', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const db = DatabaseManager.getDb();
      const foundUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = foundUsers[0];

      if (!user) {
        return res.status(401).json({
          success: false,
          error: '用户不存在',
        });
      }

      return res.json({
        success: true,
        data: {
          userId: user.id,
          username: user.username,
        },
      });
    } catch (error) {
      console.error('验证失败:', error);
      return res.status(500).json({
        success: false,
        error: '验证失败',
      });
    }
  });

  return router;
}
