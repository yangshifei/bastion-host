import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AuthUser } from '../types';

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  type?: string; // 'mfa' for MFA intermediate token
  iat?: number;
  exp?: number;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, message: '未提供认证令牌' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Reject MFA intermediate tokens for normal API access
    if (decoded.type === 'mfa') {
      res.status(401).json({ code: 401, message: '需要完成 MFA 验证' });
      return;
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role as AuthUser['role'],
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ code: 401, message: '令牌已过期，请重新登录' });
    } else {
      res.status(401).json({ code: 401, message: '无效的认证令牌' });
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      if (decoded.type !== 'mfa') {
        req.user = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role as AuthUser['role'],
        };
      }
    } catch {
      // Token invalid — continue without user
    }
  }

  next();
}
