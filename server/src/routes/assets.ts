import { Router, Request, Response } from 'express';
import { z } from 'zod';
import net from 'net';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import pool from '../database/connection';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireUser } from '../middleware/rbac';
import { validate } from '../middleware/validator';
import { recordAudit, auditFromReq } from '../middleware/audit';
import { encrypt } from '../utils/crypto';
import { success, error, paginated } from '../utils/response';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All routes require authentication
router.use(authenticate);

// ---- Schemas ----
const createAssetSchema = z.object({
  name: z.string().min(1).max(128),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['ssh', 'rdp']),
  username: z.string().max(64).optional().nullable(),
  password: z.string().max(256).optional().nullable(),
  private_key: z.string().optional().nullable(),
  group_name: z.string().max(64).default('default'),
  description: z.string().max(512).optional().nullable(),
  recording_enabled: z.boolean().optional(),
});

const updateAssetSchema = createAssetSchema.partial();

// ---- GET /api/assets/groups ----
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    let where = 'WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (!isAdmin) {
      where += ` AND id IN (
        SELECT az.asset_id FROM authorizations az
        WHERE az.user_id = ?
        AND (az.start_time IS NULL OR az.start_time <= NOW())
        AND (az.end_time IS NULL OR az.end_time >= NOW())
      )`;
      params.push(req.user!.userId);
    }

    const [rows] = await pool.query<any[]>(
      `SELECT DISTINCT group_name FROM assets ${where} ORDER BY group_name ASC`,
      params
    );

    success(res, rows.map((r) => r.group_name));
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/assets/stats ----
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN protocol = 'ssh' THEN 1 ELSE 0 END) as ssh,
         SUM(CASE WHEN protocol = 'rdp' THEN 1 ELSE 0 END) as rdp,
         SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
         SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
       FROM assets WHERE deleted_at IS NULL`
    );
    success(res, rows[0]);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/assets ----
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const search = req.query.search as string || '';
    const protocol = req.query.protocol as string || '';
    const group = req.query.group as string || '';
    const status = req.query.status as string || '';

    const isAdmin = req.user!.role === 'admin';
    let where = 'WHERE a.deleted_at IS NULL';
    const params: any[] = [];

    // Non-admin users can only see authorized assets
    if (!isAdmin) {
      where += ` AND a.id IN (
        SELECT az.asset_id FROM authorizations az
        WHERE az.user_id = ?
        AND (az.start_time IS NULL OR az.start_time <= NOW())
        AND (az.end_time IS NULL OR az.end_time >= NOW())
      )`;
      params.push(req.user!.userId);
    }

    if (search) {
      where += ' AND (a.name LIKE ? OR a.host LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (protocol) {
      where += ' AND a.protocol = ?';
      params.push(protocol);
    }
    if (group) {
      where += ' AND a.group_name = ?';
      params.push(group);
    }
    if (status) {
      where += ' AND a.status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total FROM assets a ${where}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT a.id, a.name, a.host, a.port, a.protocol, a.username, a.group_name, a.description, a.recording_enabled, a.status, a.last_checked_at, a.created_at, a.updated_at
       FROM assets a ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    paginated(res, rows, total, page, pageSize);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/assets/:id ----
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, host, port, protocol, username, group_name, description, recording_enabled, status, last_checked_at, created_at, updated_at FROM assets WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (rows.length === 0) {
      error(res, '资产不存在', 1, 404);
      return;
    }
    success(res, rows[0]);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/assets (admin only) ----
router.post('/', requireAdmin, validate(createAssetSchema), async (req: Request, res: Response) => {
  try {
    const { name, host, port, protocol, username, password, private_key, group_name, description, recording_enabled } = req.body;

    const passwordEncrypted = password ? encrypt(password) : null;
    const privateKeyEncrypted = private_key ? encrypt(private_key) : null;
    const recordingFlag = recording_enabled === false ? 0 : 1;

    const [result] = await pool.query<any>(
      `INSERT INTO assets (name, host, port, protocol, username, password_encrypted, private_key_encrypted, group_name, description, recording_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, host, port, protocol, username || null, passwordEncrypted, privateKeyEncrypted, group_name, description || null, recordingFlag]
    );

    await recordAudit({
      ...auditFromReq(req),
      action: 'create',
      targetType: 'asset',
      targetId: result.insertId,
      detail: { name, host, port, protocol },
    });

    success(res, { id: result.insertId }, '资产创建成功', 201);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- PUT /api/assets/:id (admin only) ----
router.put('/:id', requireAdmin, validate(updateAssetSchema), async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);

    const [existing] = await pool.query<any[]>(
      'SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL',
      [assetId]
    );
    if (existing.length === 0) {
      error(res, '资产不存在', 1, 404);
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];

    const { name, host, port, protocol, username, password, private_key, group_name, description, recording_enabled } = req.body;

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (host !== undefined) { updates.push('host = ?'); params.push(host); }
    if (port !== undefined) { updates.push('port = ?'); params.push(port); }
    if (protocol !== undefined) { updates.push('protocol = ?'); params.push(protocol); }
    if (username !== undefined) { updates.push('username = ?'); params.push(username); }
    if (password !== undefined) {
      updates.push('password_encrypted = ?');
      params.push(encrypt(password));
    }
    if (private_key !== undefined) {
      updates.push('private_key_encrypted = ?');
      params.push(encrypt(private_key));
    }
    if (group_name !== undefined) { updates.push('group_name = ?'); params.push(group_name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (recording_enabled !== undefined) {
      updates.push('recording_enabled = ?');
      params.push(recording_enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      error(res, '没有需要更新的字段', 1, 400);
      return;
    }

    params.push(assetId);
    await pool.query(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, params);

    await recordAudit({
      ...auditFromReq(req),
      action: 'update',
      targetType: 'asset',
      targetId: assetId,
    });

    success(res, null, '资产更新成功');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- PATCH /api/assets/:id/recording (admin only) ----
router.patch('/:id/recording', requireAdmin, async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string, 10);
    const enabled = req.body?.recording_enabled ?? req.body?.enabled;
    if (enabled === undefined) {
      error(res, '缺少 recording_enabled 参数', 1, 400);
      return;
    }

    const [existing] = await pool.query<any[]>(
      'SELECT id FROM assets WHERE id = ? AND deleted_at IS NULL',
      [assetId]
    );
    if (existing.length === 0) {
      error(res, '资产不存在', 1, 404);
      return;
    }

    const flag = enabled ? 1 : 0;
    await pool.query('UPDATE assets SET recording_enabled = ? WHERE id = ?', [flag, assetId]);

    await recordAudit({
      ...auditFromReq(req),
      action: 'update',
      targetType: 'asset',
      targetId: assetId,
      detail: { recording_enabled: Boolean(enabled) },
    });

    success(res, { recording_enabled: Boolean(enabled) }, enabled ? '已开启会话回放' : '已关闭会话回放');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- DELETE /api/assets/:id (admin only) ----
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);

    const [existing] = await pool.query<any[]>(
      'SELECT name FROM assets WHERE id = ? AND deleted_at IS NULL',
      [assetId]
    );
    if (existing.length === 0) {
      error(res, '资产不存在', 1, 404);
      return;
    }

    await pool.query('UPDATE assets SET deleted_at = NOW() WHERE id = ?', [assetId]);

    await recordAudit({
      ...auditFromReq(req),
      action: 'delete',
      targetType: 'asset',
      targetId: assetId,
      detail: { name: existing[0].name },
    });

    success(res, null, '资产已删除');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/assets/:id/test ----
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL',
      [assetId]
    );
    if (rows.length === 0) {
      error(res, '资产不存在', 1, 404);
      return;
    }

    const asset = rows[0];
    const startTime = Date.now();

    // Simple TCP connectivity test
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('连接超时'));
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.connect(asset.port, asset.host);
    });

    const latencyMs = Date.now() - startTime;

    await pool.query(
      'UPDATE assets SET status = ?, last_checked_at = NOW() WHERE id = ?',
      ['online', assetId]
    );

    success(res, { success: true, latencyMs }, '连接成功');
  } catch (err: any) {
    await pool.query(
      'UPDATE assets SET status = ?, last_checked_at = NOW() WHERE id = ?',
      ['offline', parseInt(req.params.id as string)]
    );
    success(res, { success: false, latencyMs: 0, error: err.message }, '连接失败');
  }
});

// ---- PATCH /api/assets/group/rename (admin only) ----
router.patch('/group/rename', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName || !newName.trim()) {
      error(res, '分组名称不能为空', 1, 400);
      return;
    }
    const [result] = await pool.query<any>(
      'UPDATE assets SET group_name = ? WHERE group_name = ? AND deleted_at IS NULL',
      [newName.trim(), oldName]
    );
    await recordAudit({
      ...auditFromReq(req),
      action: 'update',
      targetType: 'asset_group',
      detail: { oldName, newName: newName.trim(), affected: result.affectedRows },
    });
    success(res, { affected: result.affectedRows }, `已将 ${result.affectedRows} 个资产移至分组「${newName.trim()}」`);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/assets/import (admin only) ----
router.post('/import', requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      error(res, '请上传 CSV 文件', 1, 400);
      return;
    }

    const csvContent = req.file.buffer.toString('utf8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        if (!row.name || !row.host || !row.port || !row.protocol) {
          skipped++;
          errors.push(`第 ${i + 2} 行: 缺少必填字段`);
          continue;
        }

        const port = parseInt(row.port);
        if (isNaN(port) || port < 1 || port > 65535) {
          skipped++;
          errors.push(`第 ${i + 2} 行: 端口号无效`);
          continue;
        }

        await pool.query(
          `INSERT INTO assets (name, host, port, protocol, username, password_encrypted, group_name, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.name,
            row.host,
            port,
            row.protocol,
            row.username || null,
            row.password ? encrypt(row.password) : null,
            row.group_name || 'default',
            row.description || null,
          ]
        );
        imported++;
      } catch (err: any) {
        skipped++;
        errors.push(`第 ${i + 2} 行: ${err.message}`);
      }
    }

    success(res, { imported, skipped, total: records.length, errors }, `导入完成: ${imported} 成功, ${skipped} 跳过`, 201);
  } catch (err: any) {
    error(res, 'CSV 解析失败: ' + err.message, 1, 400);
  }
});

export default router;
