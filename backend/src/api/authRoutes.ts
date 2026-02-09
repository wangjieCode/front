import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../db/DatabaseManager';
import { users } from '../db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { newId } from '../utils/id';
import dayjs from 'dayjs';
import { hashPassword, verifyPassword } from '../utils/password';
import { requireAuth, AuthRequest } from './authMiddleware';
import { signAuthToken } from '../utils/jwt';

const USERNAME_PATTERN = /^[a-zA-Z]+$/;

function validateUsername(username?: string): string | null {
  if (!username) return '用户名不能为空';
  if (!USERNAME_PATTERN.test(username)) return '用户名只能包含英文字母';
  if (username.length < 2 || username.length > 50) return '用户名长度必须在 2-50 个字符之间';
  return null;
}

function validatePassword(password?: string): string | null {
  if (!password) return '密码不能为空';
  if (password.length < 6 || password.length > 128) return '密码长度必须在 6-128 个字符之间';
  return null;
}

export function createAuthRoutes(): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      const usernameError = validateUsername(username);
      if (usernameError) {
        return res.status(400).json({ success: false, error: usernameError });
      }

      const db = DatabaseManager.getDb();
      const existingUsers = await db.select().from(users).where(eq(users.username, username)).limit(1);
      let user = existingUsers[0];
      let hasPassword = Boolean(user?.passwordHash);

      if (!user) {
        const passwordError = validatePassword(password);
        if (passwordError) {
          return res.status(400).json({ success: false, error: passwordError });
        }

        const [newUser] = await db.insert(users).values({
          id: newId(),
          username,
          passwordHash: hashPassword(password),
        }).returning();
        user = newUser;
        hasPassword = true;
      } else if (user.passwordHash) {
        const passwordError = validatePassword(password);
        if (passwordError) {
          return res.status(400).json({ success: false, error: passwordError });
        }

        if (!verifyPassword(password, user.passwordHash)) {
          return res.status(401).json({ success: false, error: '用户名或密码错误' });
        }

        await db.update(users)
          .set({ lastLoginAt: dayjs().toDate() })
          .where(eq(users.id, user.id));
      } else {
        const passwordError = validatePassword(password);
        if (passwordError) {
          return res.status(400).json({ success: false, error: passwordError });
        }

        await db.update(users)
          .set({ passwordHash: hashPassword(password), lastLoginAt: dayjs().toDate() })
          .where(eq(users.id, user.id));
        hasPassword = true;
      }

      return res.json({
        success: true,
        data: {
          userId: user.id,
          username: user.username,
          hasPassword,
          token: signAuthToken(user.id, user.username),
        },
      });
    } catch (error) {
      console.error('登录失败:', error);
      return res.status(500).json({ success: false, error: '登录失败' });
    }
  });

  router.get('/verify', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const db = DatabaseManager.getDb();
      const foundUsers = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
      const user = foundUsers[0];

      if (!user) {
        return res.status(401).json({ success: false, error: '用户不存在' });
      }

      return res.json({
        success: true,
        data: {
          userId: user.id,
          username: user.username,
          hasPassword: Boolean(user.passwordHash),
        },
      });
    } catch (error) {
      console.error('验证失败:', error);
      return res.status(500).json({ success: false, error: '验证失败' });
    }
  });

  router.get('/users', async (_req: Request, res: Response) => {
    try {
      const db = DatabaseManager.getDb();
      const rows = await db.select({ id: users.id, username: users.username, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users);
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('获取账号列表失败:', error);
      return res.status(500).json({ success: false, error: '获取账号列表失败' });
    }
  });

  router.patch('/users/:id/password', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;

      const targetId = req.params.id;
      if (targetId !== userId) {
        return res.status(403).json({ success: false, error: '只能修改当前账号密码' });
      }

      const { oldPassword, newPassword } = req.body;
      const passwordError = validatePassword(newPassword);
      if (passwordError) return res.status(400).json({ success: false, error: passwordError });

      const db = DatabaseManager.getDb();
      const foundUsers = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      const user = foundUsers[0];
      if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

      if (user.passwordHash) {
        const oldPasswordError = validatePassword(oldPassword);
        if (oldPasswordError) return res.status(400).json({ success: false, error: '旧密码不能为空且长度至少 6 位' });
        if (!verifyPassword(oldPassword, user.passwordHash)) {
          return res.status(401).json({ success: false, error: '旧密码错误' });
        }
      }

      await db.update(users)
        .set({ passwordHash: hashPassword(newPassword), lastLoginAt: dayjs().toDate() })
        .where(eq(users.id, targetId));

      return res.json({ success: true });
    } catch (error) {
      console.error('修改密码失败:', error);
      return res.status(500).json({ success: false, error: '修改密码失败' });
    }
  });

  router.patch('/users/:id/username', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;

      const targetId = req.params.id;
      if (targetId !== userId) {
        return res.status(403).json({ success: false, error: '只能修改当前账号名' });
      }

      const { username } = req.body;
      const usernameError = validateUsername(username);
      if (usernameError) return res.status(400).json({ success: false, error: usernameError });

      const db = DatabaseManager.getDb();
      const existed = await db.select().from(users).where(and(eq(users.username, username), ne(users.id, targetId))).limit(1);
      if (existed[0]) {
        return res.status(409).json({ success: false, error: '用户名已存在' });
      }

      await db.update(users).set({ username }).where(eq(users.id, targetId));

      return res.json({ success: true, data: { userId: targetId, username } });
    } catch (error) {
      console.error('修改用户名失败:', error);
      return res.status(500).json({ success: false, error: '修改用户名失败' });
    }
  });

  return router;
}
