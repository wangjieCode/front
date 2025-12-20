import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../db/DatabaseManager';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
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

    req.userId = user.id;
    req.username = user.username;
    next();
  } catch (error) {
    console.error('认证失败:', error);
    return res.status(500).json({
      success: false,
      error: '认证失败',
    });
  }
}
