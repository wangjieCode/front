import { Request, Response, NextFunction } from 'express';

/**
 * 错误处理中间件
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  res.status(500).json({
    error: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 请求日志中间件
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestStart = process.hrtime.bigint();
  const slowThresholdMs = Number(process.env.API_SLOW_LOG_MS || 1000);
  const requestUrl = req.originalUrl || req.url;
  const isApiRequest = requestUrl.startsWith('/api');
  let hasLogged = false;

  const logRequest = (event: 'finish' | 'close') => {
    if (!isApiRequest || hasLogged) return;
    hasLogged = true;

    const durationMs = Number(process.hrtime.bigint() - requestStart) / 1_000_000;
    const durationText = `${durationMs.toFixed(2)}ms`;
    const baseLog = `[API] ${req.method} ${requestUrl} status=${res.statusCode} duration=${durationText} event=${event}`;

    if (durationMs >= slowThresholdMs) {
      console.warn(`${baseLog} slow_threshold=${slowThresholdMs}ms`);
    } else {
      console.log(baseLog);
    }
  };

  res.on('finish', () => logRequest('finish'));
  res.on('close', () => logRequest('close'));

  next();
}

/**
 * CORS 中间件
 */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}

/**
 * 请求验证中间件
 */
export function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 验证 Content-Type
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({
        error: 'Content-Type 必须是 application/json',
      });
      return;
    }
  }

  next();
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(
  req: Request,
  res: Response
): void {
  res.status(404).json({
    error: '请求的资源不存在',
    path: req.path,
  });
}
