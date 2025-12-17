import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { authMiddleware } from './middleware/authMiddleware';

const router: Router = Router();
const authService = new AuthService();

/**
 * POST /api/auth/login
 * 用户登录接口
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: '请提供用户名',
      });
    }

    const loginResponse = await authService.login(username);

    res.json({
      success: true,
      data: loginResponse,
    });
  } catch (error) {
    console.error('[AuthRoutes] 登录失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '登录失败',
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

    const user = await authService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在',
      });
    }

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    console.error('[AuthRoutes] 获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      error: '获取用户信息失败',
    });
  }
});

export default router;
