import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

const JWT_ALG = 'HS256';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';

export interface AuthJwtPayload extends JwtPayload {
  sub: string;
  username: string;
}

export function signAuthToken(userId: string, username: string, expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS): string {
  const payload: AuthJwtPayload = {
    sub: userId,
    username,
  };

  const signOptions: SignOptions = {
    algorithm: JWT_ALG,
    expiresIn: expiresInSeconds,
  };

  return jwt.sign(payload, JWT_SECRET, signOptions);
}

export function verifyAuthToken(token: string): AuthJwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
    if (typeof decoded !== 'object' || !decoded) return null;
    if (typeof decoded.sub !== 'string') return null;
    if (typeof (decoded as AuthJwtPayload).username !== 'string') return null;
    return decoded as AuthJwtPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}
