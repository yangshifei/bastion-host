import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';

/**
 * Require one of the specified roles to access the route.
 * Must be used after `authenticate` middleware.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ code: 401, message: '未认证' });
      return;
    }

    if (!roles.includes(req.user.role as UserRole)) {
      res.status(403).json({ code: 403, message: '权限不足' });
      return;
    }

    next();
  };
}

/**
 * Requires admin role.
 */
export const requireAdmin = requireRole('admin');

/**
 * Requires admin or auditor role.
 */
export const requireAdminOrAuditor = requireRole('admin', 'auditor');

/**
 * Requires any authenticated user (operator+).
 */
export const requireUser = requireRole('admin', 'operator', 'auditor');
