import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import config from '../config';

/** Auth routes use dedicated loginLimiter — skip general API limiter */
function isAuthRoute(req: Request): boolean {
  const path = req.path || '';
  return (
    path === '/auth/login' ||
    path.startsWith('/auth/mfa') ||
    path === '/auth/logout'
  );
}

function rateLimitHandler(message: string) {
  return (_req: Request, res: Response, _next: unknown, options: { statusCode: number }) => {
    res.status(options.statusCode).json({
      code: 429,
      message,
    });
  };
}

/**
 * Login / MFA rate limiter — per real client IP (requires trust proxy behind nginx).
 */
export const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  max: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler('登录尝试过于频繁，请稍后再试'),
});

/**
 * General API rate limiter — auth routes excluded (they have loginLimiter).
 */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isAuthRoute,
  handler: rateLimitHandler('请求过多，请稍后再试'),
});
