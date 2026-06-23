import { Router, Request, Response } from 'express';
import fs from 'fs';
import pool from '../database/connection';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { success, error, paginated } from '../utils/response';
import { SessionManager } from '../terminal/sessionManager';
import { recordAudit, auditFromReq } from '../middleware/audit';

const router = Router();
router.use(authenticate);

let sessionManager: SessionManager;

export function setSessionManager(sm: SessionManager): void {
  sessionManager = sm;
}

// ---- GET /api/sessions ----
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const status = req.query.status as string || '';
    const protocol = req.query.protocol as string || '';
    const hasRecording = req.query.hasRecording === '1' || req.query.hasRecording === 'true';

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (req.user!.role !== 'admin' && req.user!.role !== 'auditor') {
      where += ' AND s.user_id = ?';
      params.push(req.user!.userId);
    }

    if (status) {
      where += ' AND s.status = ?';
      params.push(status);
    } else if (hasRecording) {
      where += " AND s.status IN ('closed', 'terminated', 'timeout')";
    }

    if (protocol) {
      where += ' AND s.protocol = ?';
      params.push(protocol);
    }

    if (hasRecording) {
      where += ' AND s.recording_path IS NOT NULL';
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total FROM sessions s ${where}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT s.*, u.username, a.name as asset_name, a.host as asset_host
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN assets a ON s.asset_id = a.id
       ${where}
       ORDER BY s.start_time DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    paginated(res, rows, total, page, pageSize);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/sessions/active (admin only) ----
router.get('/active', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const active = sessionManager ? sessionManager.getAllActive() : [];
    if (active.length === 0) {
      success(res, []);
      return;
    }

    const dbIds = active.map((s) => s.dbSessionId).filter(Boolean) as number[];
    const [rows] = await pool.query<any[]>(
      `SELECT s.id, u.username, a.name AS asset_name, a.host AS asset_host
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN assets a ON s.asset_id = a.id
       WHERE s.id IN (?)`,
      [dbIds]
    );

    const meta = new Map(rows.map((r) => [r.id, r]));
    const enriched = active.map((s) => {
      const info = s.dbSessionId ? meta.get(s.dbSessionId) : undefined;
      return {
        ...s,
        username: info?.username,
        asset_name: info?.asset_name,
        asset_host: info?.asset_host,
      };
    });

    success(res, enriched);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/sessions/terminate-all (admin only) ----
router.post('/terminate-all', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!sessionManager) {
      success(res, { terminated: 0 }, '无活跃会话');
      return;
    }

    const excludeSelf = req.body?.excludeSelf !== false;
    const adminId = req.user!.userId;
    const active = sessionManager.getAllActive();
    let terminated = 0;

    for (const session of active) {
      if (excludeSelf && session.userId === adminId) continue;
      if (session.dbSessionId) {
        await sessionManager.terminate(session.dbSessionId, 'admin');
        terminated++;
      }
    }

    await recordAudit({
      ...auditFromReq(req),
      action: 'terminate_all',
      targetType: 'session',
      detail: { terminated, excludeSelf },
    });

    success(res, { terminated }, `已阻断 ${terminated} 个会话`);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/sessions/:id ----
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id as string, 10);
    if (isNaN(sessionId)) {
      error(res, '无效的会话 ID', 1, 400);
      return;
    }

    let where = 'WHERE s.id = ?';
    const params: any[] = [sessionId];

    if (req.user!.role !== 'admin' && req.user!.role !== 'auditor') {
      where += ' AND s.user_id = ?';
      params.push(req.user!.userId);
    }

    const [rows] = await pool.query<any[]>(
      `SELECT s.*, u.username, a.name as asset_name, a.host as asset_host
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN assets a ON s.asset_id = a.id
       ${where}`,
      params
    );

    if (rows.length === 0) {
      error(res, '会话不存在', 1, 404);
      return;
    }

    success(res, rows[0]);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/sessions/:id/terminate (admin only) ----
router.post('/:id/terminate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const dbId = parseInt(req.params.id as string, 10);
    if (isNaN(dbId)) {
      error(res, '无效的会话 ID', 1, 400);
      return;
    }

    const [rows] = await pool.query<any[]>(
      'SELECT id, status, user_id FROM sessions WHERE id = ?',
      [dbId]
    );

    if (rows.length === 0 || rows[0].status !== 'active') {
      error(res, '活跃会话不存在', 1, 404);
      return;
    }

    if (sessionManager) {
      await sessionManager.terminate(dbId, 'admin');
    } else {
      await pool.query(
        "UPDATE sessions SET status = 'terminated', end_time = NOW(3), termination_by = 'admin' WHERE id = ?",
        [dbId]
      );
    }

    await recordAudit({
      ...auditFromReq(req),
      action: 'terminate',
      targetType: 'session',
      targetId: dbId,
      detail: { userId: rows[0].user_id },
    });

    success(res, null, '会话已强制断开');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- GET /api/sessions/:id/recording ----
router.get('/:id/recording', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id as string, 10);

    const [rows] = await pool.query<any[]>(
      'SELECT id, user_id, protocol, recording_path FROM sessions WHERE id = ?',
      [sessionId]
    );
    if (rows.length === 0) {
      error(res, '会话不存在', 1, 404);
      return;
    }

    const isPrivileged = req.user!.role === 'admin' || req.user!.role === 'auditor';
    if (!isPrivileged && rows[0].user_id !== req.user!.userId) {
      error(res, '无权访问该会话录像', 1, 403);
      return;
    }

    const recordingPath = rows[0].recording_path;
    if (!recordingPath || !fs.existsSync(recordingPath)) {
      error(res, '录像文件不存在', 1, 404);
      return;
    }

    const isCast = rows[0].protocol === 'ssh' || recordingPath.endsWith('.cast');
    res.setHeader(
      'Content-Type',
      isCast ? 'application/x-ndjson' : 'application/octet-stream'
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="session-${sessionId}${isCast ? '.cast' : '.guac'}"`
    );

    const stream = fs.createReadStream(recordingPath);
    stream.pipe(res);
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
