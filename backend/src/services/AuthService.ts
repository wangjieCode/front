import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import { users, type User, type NewUser } from '../db/schema';

/**
 * JWT Token 载荷接口
 */
export interface TokenPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * 登录响应接口
 */
export interface LoginResponse {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  token: string;
}

/**
 * 用户认证服务
 * 处理用户登录和身份验证
 */
export class AuthService {
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor() {
    // JWT 密钥，从环境变量读取，默认使用一个密钥（生产环境必须配置）
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    // Token 有效期：7 天
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  }

  /**
   * 用户登录
   * 如果用户不存在则自动创建
   */
  async login(username: string): Promise<LoginResponse> {
    // 验证用户名格式
    if (!username || username.trim().length === 0) {
      throw new Error('用户名不能为空');
    }

    if (username.length > 100) {
      throw new Error('用户名长度不能超过100个字符');
    }

    // 只允许字母、数字、下划线、连字符
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error('用户名只能包含字母、数字、下划线和连字符');
    }

    const db = DatabaseManager.getInstance().getDb();

    // 查询用户是否存在
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    let user: User;

    if (existingUsers.length > 0) {
      // 用户已存在，更新最后登录时间
      user = existingUsers[0];
      
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      console.log(`[AuthService] 用户登录: ${username}`);
    } else {
      // 用户不存在，创建新用户
      const newUser: NewUser = {
        username,
        displayName: username, // 默认显示名称为用户名
        isActive: true,
        lastLoginAt: new Date(),
      };

      const insertedUsers = await db
        .insert(users)
        .values(newUser)
        .returning();

      user = insertedUsers[0];
      console.log(`[AuthService] 新用户注册: ${username}`);
    }

    // 生成 JWT Token
    const token = this.generateToken({
      userId: user.id,
      username: user.username,
    });

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      token,
    };
  }

  /**
   * 生成 JWT Token
   */
  generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  /**
   * 验证 JWT Token
   * @returns Token 载荷，如果验证失败则抛出异常
   */
  verifyToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token 已过期，请重新登录');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('无效的 Token');
      } else {
        throw new Error('Token 验证失败');
      }
    }
  }

  /**
   * 从 Token 获取用户信息
   */
  async getUserFromToken(token: string): Promise<User | null> {
    try {
      const payload = this.verifyToken(token);
      const db = DatabaseManager.getInstance().getDb();

      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      return result[0];
    } catch (error) {
      console.error('[AuthService] 获取用户失败:', error);
      return null;
    }
  }

  /**
   * 获取用户信息（通过用户 ID）
   */
  async getUserById(userId: string): Promise<User | null> {
    const db = DatabaseManager.getInstance().getDb();

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * 获取用户信息（通过用户名）
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const db = DatabaseManager.getInstance().getDb();

    const result = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }
}
