import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../db/DatabaseManager';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { extractBearerToken, verifyAuthToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: '未登录',
      });
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      return res.status(401).json({
        success: false,
        error: '登录已失效',
      });
    }
    const userId = payload.sub;

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
    return next();
  } catch (error) {
    console.error('认证失败:', error);
    return res.status(500).json({
      success: false,
      error: '认证失败',
    });
  }
}
