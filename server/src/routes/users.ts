import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import pool from '../database/connection';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validator';
import { recordAudit, auditFromReq } from '../middleware/audit';
import { success, error, paginated } from '../utils/response';

const router = Router();

// All routes require authentication + admin
router.use(authenticate, requireAdmin);

// ---- Schemas ----
const createUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  password: z.string().min(8).regex(/^(?=.*[a-zA-Z])(?=.*\d)/, '密码必须包含字母和数字'),
  role: z.enum(['admin', 'operator', 'auditor']).default('operator'),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/).optional(),
  password: z.string().min(8).regex(/^(?=.*[a-zA-Z])(?=.*\d)/).optional(),
  role: z.enum(['admin', 'operator', 'auditor']).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  status: z.enum(['active', 'disabled']).optional(),
});

// ---- GET /api/users ----
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const search = req.query.search as string || '';
    const role = req.query.role as string || '';
    const status = req.query.status as string || '';

    let where = 'WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (search) {
      where += ' AND username LIKE ?';
      params.push(`%${search}%`);
    }
    if (role) {
      where += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total FROM users ${where}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT id, username, role, email, phone, mfa_enabled, status, last_login, created_at, updated_at
       FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = rows.map((u: any) => ({ ...u, mfa_enabled: !!u.mfa_enabled }));
    paginated(res, list, total, page, pageSize);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/users ----
router.post('/', validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, role, email, phone } = req.body;

    // Check uniqueness
    const [existing] = await pool.query<any[]>(
      'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
      [username]
    );
    if (existing.length > 0) {
      error(res, '用户名已存在', 1, 409);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query<any>(
      'INSERT INTO users (username, password_hash, role, email, phone) VALUES (?, ?, ?, ?, ?)',
      [username, passwordHash, role, email, phone]
    );

    await recordAudit({
      ...auditFromReq(req),
      action: 'create',
      targetType: 'user',
      targetId: result.insertId,
      detail: { username, role },
    });

    success(res, { id: result.insertId, username, role }, '用户创建成功', 201);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- PUT /api/users/:id ----
router.put('/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string);

    const [existing] = await pool.query<any[]>(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    if (existing.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    const detail: Record<string, any> = { old: {}, new: {} };

    const { username, password, role, email, phone, status } = req.body;

    if (username !== undefined) {
      // Check uniqueness
      const [dup] = await pool.query<any[]>(
        'SELECT id FROM users WHERE username = ? AND id != ? AND deleted_at IS NULL',
        [username, userId]
      );
      if (dup.length > 0) {
        error(res, '用户名已被占用', 1, 409);
        return;
      }
      detail.old.username = existing[0].username;
      detail.new.username = username;
      updates.push('username = ?');
      params.push(username);
    }

    if (password !== undefined) {
      const hash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?');
      params.push(hash);
      updates.push('password_changed_at = NOW()');
      detail.new.passwordChanged = true;
    }

    if (role !== undefined) {
      detail.old.role = existing[0].role;
      detail.new.role = role;
      updates.push('role = ?');
      params.push(role);
    }

    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      error(res, '没有需要更新的字段', 1, 400);
      return;
    }

    params.push(userId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    await recordAudit({
      ...auditFromReq(req),
      action: 'update',
      targetType: 'user',
      targetId: userId,
      detail,
    });

    success(res, null, '用户更新成功');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- DELETE /api/users/:id ----
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string);

    // Cannot delete self
    if (userId === req.user!.userId) {
      error(res, '不能删除自己的账号', 1, 400);
      return;
    }

    const [existing] = await pool.query<any[]>(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    if (existing.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    // Soft delete
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [userId]);

    await recordAudit({
      ...auditFromReq(req),
      action: 'delete',
      targetType: 'user',
      targetId: userId,
      detail: { username: existing[0].username },
    });

    success(res, null, '用户已删除');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
