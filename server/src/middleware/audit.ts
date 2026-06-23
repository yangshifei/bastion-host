import { Request } from 'express';
import pool from '../database/connection';
import logger from '../utils/logger';

export interface AuditParams {
  userId?: number | null;
  username?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  detail?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Record an audit log entry. Non-blocking — errors are logged but swallowed.
 */
export async function recordAudit(params: AuditParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, username, action, target_type, target_id, detail, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId ?? null,
        params.username ?? null,
        params.action,
        params.targetType ?? null,
        params.targetId ?? null,
        params.detail ? JSON.stringify(params.detail) : null,
        params.ip ?? null,
        params.userAgent ?? null,
      ]
    );
  } catch (err) {
    logger.error({ err, params }, 'Failed to record audit log');
  }
}

/**
 * Extract common audit fields from Express request.
 */
export function auditFromReq(req: Request): Pick<AuditParams, 'userId' | 'username' | 'ip' | 'userAgent'> {
  return {
    userId: req.user?.userId ?? null,
    username: req.user?.username ?? null,
    ip: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent']?.substring(0, 512) || null,
  };
}
