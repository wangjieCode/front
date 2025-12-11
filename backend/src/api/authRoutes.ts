import { Router, Request, Response } from 'express';
import { UserAuthService } from '../services/UserAuthService';
import { createAuthMiddleware } from './authMiddleware';

/**
 * 创建认证路由
 */
export function createAuthRoutes(authService: UserAuthService): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  /**
   * POST /api/auth/login
   * 用户登录
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // 验证输入
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: '用户名和密码不能为空',
        });
      }

      // 执行登录
      const result = await authService.login({ username, password });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '登录失败';
      res.status(401).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * GET /api/auth/me
   * 获取当前登录用户信息
   */
  router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      res.json({
        success: true,
        data: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          status: req.user.status,
          createdAt: req.user.createdAt,
          lastLoginAt: req.user.lastLoginAt,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取用户信息失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * 刷新 Token
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token 不能为空',
        });
      }

      const newToken = await authService.refreshToken(token);

      res.json({
        success: true,
        data: {
          token: newToken,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新 Token 失败';
      res.status(401).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /api/auth/logout
   * 登出（前端清除 Token 即可，后端无需处理）
   */
  router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: '登出成功',
    });
  });

  return router;
}
