import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/AuthService';

/**
 * 扩展 Request 接口，添加用户信息
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
      };
    }
  }
}

/**
 * JWT Token 认证中间件
 * 验证用户身份并将用户信息注入到请求上下文
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // 从请求头提取 Token
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌',
      });
    }

    // 提取 Bearer Token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: '认证令牌格式错误',
      });
    }

    const token = parts[1];

    // 验证 Token
    const authService = new AuthService();
    const payload = authService.verifyToken(token);

    // 将用户信息注入到请求上下文
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };

    next();
  } catch (error) {
    console.error('[AuthMiddleware] 认证失败:', error);
    return res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : '认证失败',
    });
  }
}

/**
 * 可选认证中间件
 * 如果提供了 Token 则验证，否则继续执行
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // 没有提供 Token，继续执行
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    const authService = new AuthService();
    
    try {
      const payload = authService.verifyToken(token);
      req.user = {
        userId: payload.userId,
        username: payload.username,
      };
    } catch (error) {
      // Token 无效，但不阻止请求
      console.warn('[OptionalAuthMiddleware] Token 验证失败:', error);
    }

    next();
  } catch (error) {
    next();
  }
}
