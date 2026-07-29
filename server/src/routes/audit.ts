import { Router, Request, Response } from 'express';
import { Transform } from 'stream';
import pool from '../database/connection';
import { authenticate } from '../middleware/auth';
import { requireAdminOrAuditor } from '../middleware/rbac';
import { success, error, paginated } from '../utils/response';

const router = Router();

// All audit routes require admin or auditor
router.use(authenticate, requireAdminOrAuditor);

// ---- GET /api/audit/commands ----
router.get('/commands', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const username = req.query.username as string || '';
    const isDangerous = req.query.isDangerous as string || '';
    const startDate = req.query.startDate as string || '';
    const endDate = req.query.endDate as string || '';

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (username) {
      where += ' AND u.username LIKE ?';
      params.push(`%${username}%`);
    }
    if (isDangerous === '1' || isDangerous === 'true') {
      where += ' AND c.is_dangerous = 1';
    }
    if (startDate) {
      where += ' AND c.timestamp >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND c.timestamp <= ?';
      params.push(endDate + ' 23:59:59');
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total
       FROM command_logs c
       JOIN sessions s ON c.session_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN assets a ON s.asset_id = a.id
       ${where}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT c.*, s.protocol, u.username, a.name as asset_name, a.host as asset_host
       FROM command_logs c
       JOIN sessions s ON c.session_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN assets a ON s.asset_id = a.id
       ${where}
       ORDER BY c.timestamp DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    paginated(res, rows, total, page, pageSize);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/audit ----
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

    // Filters
    const userId = req.query.userId as string || '';
    const username = req.query.username as string || '';
    const action = req.query.action as string || '';
    const targetType = req.query.targetType as string || '';
    const startDate = req.query.startDate as string || '';
    const endDate = req.query.endDate as string || '';

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (userId) {
      where += ' AND user_id = ?';
      params.push(parseInt(userId));
    }
    if (username) {
      where += ' AND username LIKE ?';
      params.push(`%${username}%`);
    }
    if (action) {
      where += ' AND action = ?';
      params.push(action);
    }
    if (targetType) {
      where += ' AND target_type = ?';
      params.push(targetType);
    }
    if (startDate) {
      where += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total FROM audit_logs ${where}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT a.*,
         CASE
           WHEN a.target_type IN ('asset', 'database_asset') THEN ast.name
           WHEN a.target_type = 'user' THEN target_u.username
           WHEN a.target_type = 'authorization' THEN CONCAT(auth_u.username, ' → ', auth_ast.name)
           WHEN a.target_type = 'session' THEN CONCAT('会话 #', a.target_id)
           ELSE NULL
         END as target_name
       FROM audit_logs a
       LEFT JOIN assets ast ON a.target_type IN ('asset', 'database_asset') AND a.target_id = ast.id
       LEFT JOIN users target_u ON a.target_type = 'user' AND a.target_id = target_u.id
       LEFT JOIN authorizations auth ON a.target_type = 'authorization' AND a.target_id = auth.id
       LEFT JOIN users auth_u ON auth.user_id = auth_u.id
       LEFT JOIN assets auth_ast ON auth.asset_id = auth_ast.id
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Parse detail JSON
    const list = rows.map((r: any) => ({
      ...r,
      detail: r.detail ? (typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail) : null,
    }));

    paginated(res, list, total, page, pageSize);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/audit/export ----
router.get('/export', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string || '';
    const action = req.query.action as string || '';
    const targetType = req.query.targetType as string || '';
    const startDate = req.query.startDate as string || '';
    const endDate = req.query.endDate as string || '';

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (username) {
      where += ' AND username LIKE ?';
      params.push(`%${username}%`);
    }
    if (action) {
      where += ' AND action = ?';
      params.push(action);
    }
    if (targetType) {
      where += ' AND target_type = ?';
      params.push(targetType);
    }
    if (startDate) {
      where += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    // Limit export to 10000 rows
    const [rows] = await pool.query<any[]>(
      `SELECT id, user_id, username, action, target_type, target_id, detail, ip, user_agent, created_at
       FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 10000`,
      params
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');

    // CSV header
    res.write('id,user_id,username,action,target_type,target_id,detail,ip,user_agent,created_at\n');

    // CSV rows (simple escaping)
    for (const row of rows) {
      const line = [
        row.id,
        row.user_id ?? '',
        `"${(row.username || '').replace(/"/g, '""')}"`,
        row.action,
        row.target_type ?? '',
        row.target_id ?? '',
        `"${((typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail)) || '').replace(/"/g, '""')}"`,
        row.ip ?? '',
        `"${(row.user_agent || '').replace(/"/g, '""')}"`,
        row.created_at,
      ].join(',');
      res.write(line + '\n');
    }

    res.end();
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/audit/stats ----
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [todayCount] = await pool.query<any[]>(
      `SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= CURDATE()`
    );
    const [connectCount] = await pool.query<any[]>(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE action = 'connect' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    const [dangerousCount] = await pool.query<any[]>(
      `SELECT COUNT(*) as count FROM command_logs WHERE is_dangerous = 1 AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    const [blockedCount] = await pool.query<any[]>(
      `SELECT COUNT(*) as count FROM command_logs WHERE is_blocked = 1 AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    const [actionDist] = await pool.query<any[]>(
      `SELECT action, COUNT(*) as count FROM audit_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY action ORDER BY count DESC`
    );

    const [dailyCounts] = await pool.query<any[]>(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM audit_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at) ORDER BY date`
    );

    const [topUsers] = await pool.query<any[]>(
      `SELECT username, COUNT(*) as count FROM audit_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND username IS NOT NULL
       GROUP BY username ORDER BY count DESC LIMIT 10`
    );

    success(res, {
      todayCount: todayCount[0].count,
      connectCount: connectCount[0].count,
      dangerousCount: dangerousCount[0].count,
      blockedCount: blockedCount[0].count,
      actionDistribution: actionDist,
      dailyCounts,
      topUsers,
    });
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
