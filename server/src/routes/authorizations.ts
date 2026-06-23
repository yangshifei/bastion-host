import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/connection';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validator';
import { recordAudit, auditFromReq } from '../middleware/audit';
import { success, error, paginated } from '../utils/response';

const router = Router();

router.use(authenticate, requireAdmin);

const AUTHZ_STATUS_SQL = `
  CASE
    WHEN a.end_time IS NOT NULL AND a.end_time < NOW() THEN 'expired'
    WHEN a.start_time IS NOT NULL AND a.start_time > NOW() THEN 'pending'
    ELSE 'active'
  END
`;

const createAuthzSchema = z.object({
  user_id: z.number().int().positive(),
  asset_id: z.number().int().positive(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
});

const updateAuthzSchema = z.object({
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
});

const batchCreateSchema = z.object({
  user_id: z.number().int().positive(),
  asset_ids: z.array(z.number().int().positive()).min(1),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
});

function validateTimeRange(start_time?: string | null, end_time?: string | null): string | null {
  if (start_time && end_time && new Date(start_time) >= new Date(end_time)) {
    return '生效时间必须早于过期时间';
  }
  return null;
}

// ---- GET /api/authorizations/stats ----
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [stats] = await pool.query<any[]>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE
          WHEN end_time IS NOT NULL AND end_time < NOW() THEN 0
          WHEN start_time IS NOT NULL AND start_time > NOW() THEN 0
          ELSE 1
        END) as active,
        SUM(CASE WHEN end_time IS NOT NULL AND end_time < NOW() THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN start_time IS NOT NULL AND start_time > NOW() THEN 1 ELSE 0 END) as pending
      FROM authorizations
    `);

    success(res, stats[0]);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/authorizations/pairs ----
router.get('/pairs', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT user_id, asset_id FROM authorizations'
    );
    success(res, rows);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/authorizations ----
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const userId = req.query.user_id as string || '';
    const assetId = req.query.asset_id as string || '';
    const status = req.query.status as string || '';
    const protocol = req.query.protocol as string || '';
    const search = req.query.search as string || '';

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (userId) {
      where += ' AND a.user_id = ?';
      params.push(parseInt(userId));
    }
    if (assetId) {
      where += ' AND a.asset_id = ?';
      params.push(parseInt(assetId));
    }
    if (protocol) {
      where += ' AND ast.protocol = ?';
      params.push(protocol);
    }
    if (search) {
      where += ' AND (u.username LIKE ? OR ast.name LIKE ? OR ast.host LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status === 'active') {
      where += ` AND (${AUTHZ_STATUS_SQL} = 'active')`;
    } else if (status === 'expired') {
      where += ` AND (${AUTHZ_STATUS_SQL} = 'expired')`;
    } else if (status === 'pending') {
      where += ` AND (${AUTHZ_STATUS_SQL} = 'pending')`;
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total
       FROM authorizations a
       JOIN users u ON a.user_id = u.id
       JOIN assets ast ON a.asset_id = ast.id
       ${where}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT a.*,
              u.username as user_username,
              ast.name as asset_name, ast.host as asset_host, ast.protocol as asset_protocol,
              gb.username as granted_by_username,
              ${AUTHZ_STATUS_SQL} as status
       FROM authorizations a
       JOIN users u ON a.user_id = u.id
       JOIN assets ast ON a.asset_id = ast.id
       LEFT JOIN users gb ON a.granted_by = gb.id
       ${where}
       ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    paginated(res, rows, total, page, pageSize);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/authorizations/batch ----
router.post('/batch', validate(batchCreateSchema), async (req: Request, res: Response) => {
  try {
    const { user_id, asset_ids, start_time, end_time } = req.body;

    const timeError = validateTimeRange(start_time, end_time);
    if (timeError) {
      error(res, timeError, 1, 400);
      return;
    }

    const [users] = await pool.query<any[]>(
      'SELECT id, username, role FROM users WHERE id = ? AND deleted_at IS NULL AND status = ?',
      [user_id, 'active']
    );
    if (users.length === 0) {
      error(res, '用户不存在或已禁用', 1, 404);
      return;
    }

    if (users[0].role === 'admin') {
      error(res, '管理员拥有全部资产访问权限，无需授权', 1, 400);
      return;
    }

    const uniqueIds = [...new Set(asset_ids as number[])];
    const [assets] = await pool.query<any[]>(
      `SELECT id, name FROM assets WHERE id IN (${uniqueIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      uniqueIds
    );
    if (assets.length !== uniqueIds.length) {
      error(res, '部分资产不存在或已删除', 1, 404);
      return;
    }

    const [existing] = await pool.query<any[]>(
      `SELECT asset_id FROM authorizations WHERE user_id = ? AND asset_id IN (${uniqueIds.map(() => '?').join(',')})`,
      [user_id, ...uniqueIds]
    );
    const existingSet = new Set(existing.map((r: any) => r.asset_id));
    const toCreate = uniqueIds.filter((id) => !existingSet.has(id));

    if (toCreate.length === 0) {
      error(res, '所选资产均已授权给该用户', 1, 409);
      return;
    }

    const createdIds: number[] = [];
    for (const assetId of toCreate) {
      const [result] = await pool.query<any>(
        'INSERT INTO authorizations (user_id, asset_id, start_time, end_time, granted_by) VALUES (?, ?, ?, ?, ?)',
        [user_id, assetId, start_time || null, end_time || null, req.user!.userId]
      );
      createdIds.push(result.insertId);
    }

    await recordAudit({
      ...auditFromReq(req),
      action: 'create',
      targetType: 'authorization',
      targetId: createdIds[0],
      detail: { user_id, asset_ids: toCreate, start_time, end_time, count: toCreate.length },
    });

    success(res, {
      created: toCreate.length,
      skipped: uniqueIds.length - toCreate.length,
      ids: createdIds,
    }, `成功创建 ${toCreate.length} 条授权`, 201);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/authorizations ----
router.post('/', validate(createAuthzSchema), async (req: Request, res: Response) => {
  try {
    const { user_id, asset_id, start_time, end_time } = req.body;

    const timeError = validateTimeRange(start_time, end_time);
    if (timeError) {
      error(res, timeError, 1, 400);
      return;
    }

    const [users] = await pool.query<any[]>(
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
      [user_id]
    );
    if (users.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    const [assets] = await pool.query<any[]>(
      'SELECT id FROM assets WHERE id = ? AND deleted_at IS NULL',
      [asset_id]
    );
    if (assets.length === 0) {
      error(res, '资产不存在', 1, 404);
      return;
    }

    const [existing] = await pool.query<any[]>(
      'SELECT id FROM authorizations WHERE user_id = ? AND asset_id = ?',
      [user_id, asset_id]
    );
    if (existing.length > 0) {
      error(res, '该用户对此资产的授权已存在', 1, 409);
      return;
    }

    const [result] = await pool.query<any>(
      'INSERT INTO authorizations (user_id, asset_id, start_time, end_time, granted_by) VALUES (?, ?, ?, ?, ?)',
      [user_id, asset_id, start_time || null, end_time || null, req.user!.userId]
    );

    await recordAudit({
      ...auditFromReq(req),
      action: 'create',
      targetType: 'authorization',
      targetId: result.insertId,
      detail: { user_id, asset_id, start_time, end_time },
    });

    success(res, { id: result.insertId }, '授权创建成功', 201);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- PUT /api/authorizations/:id ----
router.put('/:id', validate(updateAuthzSchema), async (req: Request, res: Response) => {
  try {
    const authzId = parseInt(req.params.id as string);
    const { start_time, end_time } = req.body;

    const timeError = validateTimeRange(start_time, end_time);
    if (timeError) {
      error(res, timeError, 1, 400);
      return;
    }

    const [existing] = await pool.query<any[]>(
      'SELECT * FROM authorizations WHERE id = ?',
      [authzId]
    );
    if (existing.length === 0) {
      error(res, '授权不存在', 1, 404);
      return;
    }

    await pool.query(
      'UPDATE authorizations SET start_time = ?, end_time = ? WHERE id = ?',
      [start_time || null, end_time || null, authzId]
    );

    await recordAudit({
      ...auditFromReq(req),
      action: 'update',
      targetType: 'authorization',
      targetId: authzId,
      detail: {
        before: { start_time: existing[0].start_time, end_time: existing[0].end_time },
        after: { start_time: start_time || null, end_time: end_time || null },
      },
    });

    success(res, null, '授权更新成功');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- DELETE /api/authorizations/:id ----
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const authzId = parseInt(req.params.id as string);

    const [existing] = await pool.query<any[]>(
      `SELECT a.*, u.username as user_username, ast.name as asset_name
       FROM authorizations a
       JOIN users u ON a.user_id = u.id
       JOIN assets ast ON a.asset_id = ast.id
       WHERE a.id = ?`,
      [authzId]
    );
    if (existing.length === 0) {
      error(res, '授权不存在', 1, 404);
      return;
    }

    await pool.query('DELETE FROM authorizations WHERE id = ?', [authzId]);

    await recordAudit({
      ...auditFromReq(req),
      action: 'delete',
      targetType: 'authorization',
      targetId: authzId,
      detail: {
        user_id: existing[0].user_id,
        asset_id: existing[0].asset_id,
        user_username: existing[0].user_username,
        asset_name: existing[0].asset_name,
      },
    });

    success(res, null, '授权已删除');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
