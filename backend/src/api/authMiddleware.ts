import { Request, Response, NextFunction } from 'express';
import { UserAuthService } from '../services/UserAuthService';
import { User } from '../db/schema';

/**
 * 扩展 Express Request 类型，添加 user 属性
 */
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * JWT 认证中间件
 * 验证请求头中的 Authorization Token
 */
export function createAuthMiddleware(authService: UserAuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 获取 Authorization 头
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: '缺少认证令牌',
        });
        return;
      }

      // 验证格式：Bearer <token>
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.status(401).json({
          success: false,
          error: '认证令牌格式错误',
        });
        return;
      }

      const token = parts[1];

      // 验证 Token
      try {
        const user = await authService.verifyToken(token);
        
        // 将用户信息附加到请求对象
        req.user = user;
        req.userId = user.id;
        
        next();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '认证失败';
        res.status(401).json({
          success: false,
          error: errorMessage,
        });
        return;
      }
    } catch (error) {
      console.error('[AuthMiddleware] 认证中间件错误:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误',
      });
    }
  };
}

/**
 * 可选的认证中间件
 * 如果有 Token 则验证，没有则跳过
 */
export function createOptionalAuthMiddleware(authService: UserAuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        // 没有 Token，继续执行
        next();
        return;
      }

      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        
        try {
          const user = await authService.verifyToken(token);
          req.user = user;
          req.userId = user.id;
        } catch (error) {
          // Token 无效，但不阻止请求
          console.log('[AuthMiddleware] Token 验证失败，继续处理请求');
        }
      }
      
      next();
    } catch (error) {
      console.error('[AuthMiddleware] 可选认证中间件错误:', error);
      next();
    }
  };
}
