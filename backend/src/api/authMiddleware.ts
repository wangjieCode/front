import { Request, Response, NextFunction } from 'express';
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
    req.userId = payload.sub;
    req.username = payload.username;
    return next();
  } catch (error) {
    console.error('认证失败:', error);
    return res.status(500).json({
      success: false,
      error: '认证失败',
    });
  }
}
