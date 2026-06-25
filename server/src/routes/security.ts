import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validator';
import { passwordPolicyService } from '../services/passwordPolicyService';
import { notificationService } from '../services/notificationService';
import { recordAudit, auditFromReq } from '../middleware/audit';
import pool from '../database/connection';
import { success, error } from '../utils/response';
import logger from '../utils/logger';

/** Simple CIDR validation */
function isValidCidr(network: string, mask: number): boolean {
  const parts = network.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  return mask >= 0 && mask <= 32;
}

const router = Router();

// ── Schemas ──
const updatePolicySchema = z.object({
  min_length: z.number().min(8).max(64).optional(),
  require_upper: z.boolean().optional(),
  require_lower: z.boolean().optional(),
  require_digit: z.boolean().optional(),
  require_special: z.boolean().optional(),
  expire_days: z.number().min(0).max(365).optional(),
  history_count: z.number().min(0).max(20).optional(),
  force_change_on_create: z.boolean().optional(),
  captcha_threshold: z.number().min(1).max(10).optional(),
  lockout_threshold: z.number().min(5).max(20).optional(),
  lockout_minutes: z.number().min(5).max(1440).optional(),
  require_mfa: z.boolean().optional(),
});

const addIpSchema = z.object({
  network: z.string().min(1),
  mask: z.number().min(0).max(32),
  description: z.string().max(255).optional(),
});

// ═══════════════════ Password Policy ═══════════════════

// GET /api/security/ping — verify routes are loaded
router.get('/ping', (_req: Request, res: Response) => {
  success(res, { loaded: true });
});

// GET /api/security/password-policy
router.get('/password-policy', async (_req: Request, res: Response) => {
  try {
    const policy = await passwordPolicyService.getPolicy();
    success(res, policy);
  } catch (err: any) {
    logger.error({ err }, 'GET /password-policy failed');
    error(res, err?.message || 'Unknown error', 1, 500);
  }
});

// PUT /api/security/password-policy (admin only)
router.put('/password-policy', authenticate, requireAdmin, validate(updatePolicySchema), async (req: Request, res: Response) => {
  try {
    const policy = await passwordPolicyService.updatePolicy(req.body);
    await recordAudit({
      ...auditFromReq(req),
      action: 'update',
      targetType: 'system_config',
      detail: { key: 'password_policy', changes: req.body },
    });
    success(res, policy, '密码策略已更新');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ═══════════════════ IP Whitelist ═══════════════════

// GET /api/security/ip-whitelist
router.get('/ip-whitelist', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, network, mask, description, enabled, created_at FROM ip_whitelist ORDER BY id`
    );
    success(res, rows);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// POST /api/security/ip-whitelist (admin only)
router.post('/ip-whitelist', authenticate, requireAdmin, validate(addIpSchema), async (req: Request, res: Response) => {
  try {
    const { network, mask, description } = req.body;
    if (!isValidCidr(network, mask)) {
      error(res, '无效的 CIDR 格式', 1, 400);
      return;
    }
    const [result] = await pool.query<any>(
      `INSERT INTO ip_whitelist (network, mask, description) VALUES (?, ?, ?)`,
      [network, mask, description || null]
    );
    await recordAudit({
      ...auditFromReq(req),
      action: 'create',
      targetType: 'ip_whitelist',
      targetId: result.insertId,
      detail: { network, mask, description },
    });
    success(res, { id: result.insertId }, 'IP 白名单已添加');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// DELETE /api/security/ip-whitelist/:id (admin only)
router.delete('/ip-whitelist/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await pool.query('DELETE FROM ip_whitelist WHERE id = ?', [id]);
    await recordAudit({
      ...auditFromReq(req),
      action: 'delete',
      targetType: 'ip_whitelist',
      targetId: id,
    });
    success(res, null, 'IP 白名单已删除');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// PATCH /api/security/ip-whitelist/:id (admin only)
router.patch('/ip-whitelist/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { enabled } = req.body;
    await pool.query('UPDATE ip_whitelist SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    success(res, null, enabled ? '白名单规则已启用' : '白名单规则已禁用');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ═══════════════════ Notifications ═══════════════════

// GET /api/notifications
router.get('/notifications', authenticate, async (req: Request, res: Response) => {
  try {
    const unreadOnly = req.query.unread_only === 'true';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const list = await notificationService.getNotifications(req.user!.userId, unreadOnly, limit);
    const unreadCount = await notificationService.getUnreadCount(req.user!.userId);
    success(res, { list, unread_count: unreadCount });
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// GET /api/notifications/unread-count
router.get('/notifications/unread-count', authenticate, async (req: Request, res: Response) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId);
    success(res, { count });
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// POST /api/notifications/mark-read
router.post('/notifications/mark-read', authenticate, async (req: Request, res: Response) => {
  try {
    const { ids, all } = req.body;
    await notificationService.markRead(req.user!.userId, ids, !!all);
    success(res, null, '已标记为已读');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
