import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import { users, User } from '../db/schema';

/**
 * 用户登录请求
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
  };
}

/**
 * JWT Payload
 */
export interface JwtPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * 用户认证服务
 * 负责用户登录、JWT 生成与验证
 */
export class UserAuthService {
  private client: postgres.Sql;
  private db: ReturnType<typeof drizzle>;
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor(databaseUrl: string, jwtSecret?: string, jwtExpiresIn?: string) {
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client);
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtExpiresIn = jwtExpiresIn || process.env.JWT_EXPIRES_IN || '24h';

    if (this.jwtSecret === 'your-secret-key-change-in-production') {
      console.warn('[UserAuthService] ⚠️  警告：正在使用默认 JWT 密钥，请在生产环境中设置 JWT_SECRET 环境变量');
    }
  }

  /**
   * 用户登录
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    try {
      console.log(`[UserAuthService] 用户登录请求: ${request.username}`);

      // 查找用户
      const userList = await this.db
        .select()
        .from(users)
        .where(eq(users.username, request.username))
        .limit(1);

      if (userList.length === 0) {
        throw new Error('用户名或密码错误');
      }

      const user = userList[0];

      // 检查用户状态
      if (user.status !== 'active') {
        throw new Error('用户账号已被禁用');
      }

      // 验证密码
      const passwordValid = await bcrypt.compare(request.password, user.passwordHash);
      if (!passwordValid) {
        throw new Error('用户名或密码错误');
      }

      // 更新最后登录时间
      await this.db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      // 生成 JWT Token
      const token = this.generateToken(user);

      console.log(`[UserAuthService] ✅ 用户登录成功: ${user.username}`);

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      };
    } catch (error) {
      console.error(`[UserAuthService] ❌ 登录失败:`, error);
      throw error;
    }
  }

  /**
   * 生成 JWT Token
   */
  private generateToken(user: User): string {
    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  /**
   * 验证 JWT Token
   */
  async verifyToken(token: string): Promise<User> {
    try {
      // 验证 Token
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;

      // 查询用户信息
      const userList = await this.db
        .select()
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (userList.length === 0) {
        throw new Error('用户不存在');
      }

      const user = userList[0];

      // 检查用户状态
      if (user.status !== 'active') {
        throw new Error('用户账号已被禁用');
      }

      return user;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Token 无效');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token 已过期');
      }
      throw error;
    }
  }

  /**
   * 解析 Token（不验证有效性）
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * 刷新 Token
   */
  async refreshToken(oldToken: string): Promise<string> {
    try {
      // 验证旧 Token（允许过期）
      const decoded = jwt.decode(oldToken) as JwtPayload;
      if (!decoded || !decoded.userId) {
        throw new Error('Token 无效');
      }

      // 查询用户
      const userList = await this.db
        .select()
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (userList.length === 0) {
        throw new Error('用户不存在');
      }

      const user = userList[0];

      // 检查用户状态
      if (user.status !== 'active') {
        throw new Error('用户账号已被禁用');
      }

      // 生成新 Token
      return this.generateToken(user);
    } catch (error) {
      console.error(`[UserAuthService] ❌ Token 刷新失败:`, error);
      throw error;
    }
  }

  /**
   * 根据用户 ID 获取用户信息
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const userList = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return userList.length > 0 ? userList[0] : null;
    } catch (error) {
      console.error(`[UserAuthService] ❌ 获取用户失败:`, error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    await this.client.end();
  }
}
