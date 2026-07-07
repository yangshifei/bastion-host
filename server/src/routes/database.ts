import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { dbQueryService } from '../services/dbQueryService';
import { recordAudit, auditFromReq } from '../middleware/audit';
import logger from '../utils/logger';
import { success, error } from '../utils/response';
import pool from '../database/connection';

const router = Router();
router.use(authenticate);

// POST /api/database/:id/execute
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);
    const { sql } = req.body;
    if (!sql?.trim()) { error(res, 'SQL 语句不能为空', 1, 400); return; }

    const result = await dbQueryService.execute(assetId, sql.trim());

    // Log to audit
    await recordAudit({
      ...auditFromReq(req),
      action: 'db_query',
      targetType: 'database_asset',
      targetId: assetId,
      detail: { sql: sql.substring(0, 500), rowCount: result.rowCount, durationMs: result.durationMs },
    });

    // Save to history
    try {
      await pool.query(
        `INSERT INTO query_history (user_id, asset_id, query_text, status, row_count, duration_ms) VALUES (?, ?, ?, 'success', ?, ?)`,
        [req.user!.userId, assetId, sql, result.rowCount, result.durationMs]
      );
    } catch { /* non-critical */ }

    success(res, result, `查询完成 (${result.rowCount} 行, ${result.durationMs}ms)`);
  } catch (err: any) {
    logger.error({ err: err.message }, 'SQL execution failed');
    try {
      await pool.query(
        `INSERT INTO query_history (user_id, asset_id, query_text, status, error_message) VALUES (?, ?, ?, 'error', ?)`,
        [req.user!.userId, parseInt(req.params.id as string), req.body.sql || '', err.message?.substring(0, 500)]
      );
    } catch { /* non-critical */ }
    error(res, err.message, 1, 500);
  }
});

// POST /api/database/0/test (direct test — no asset ID needed)
router.post('/0/test', async (req: Request, _res: Response) => {
  try {
    const { host, port, db_type, database: dbName, user, password } = req.body;
    if (db_type === 'mysql') {
      const mysql2 = require('mysql2/promise');
      const c = await mysql2.createConnection({ host, port: port || 3306, user, password, database: dbName, connectTimeout: 5000 });
      await c.ping(); c.end();
      _res.json({ code: 0, message: '连接成功', data: { success: true } });
    } else if (db_type === 'postgresql') {
      const pg = require('pg');
      const c = new pg.Client({ host, port: port || 5432, user, password, database: dbName, connectionTimeoutMillis: 5000 });
      await c.connect(); await c.query('SELECT 1'); c.end();
      _res.json({ code: 0, message: '连接成功', data: { success: true } });
    } else if (db_type === 'mssql') {
      const mssql = require('mssql');
      const pool = await mssql.connect({
        server: host,
        port: port || 1433,
        database: dbName,
        user,
        password,
        options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000 },
      });
      try {
        await pool.request().query('SELECT 1 AS ok');
      } finally {
        await pool.close();
      }
      _res.json({ code: 0, message: '连接成功', data: { success: true } });
    } else {
      _res.json({ code: 1, message: '不支持的数据库类型: ' + db_type });
    }
  } catch (err: any) { _res.json({ code: 1, message: err.message || '连接失败' }); }
});

// POST /api/database/:id/test
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const result = await dbQueryService.testConnection(parseInt(req.params.id as string));
    if (result.success) success(res, result);
    else error(res, result.message, 1, 400);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// GET /api/database/:id/databases
router.get('/:id/databases', async (req: Request, res: Response) => {
  try {
    const dbs = await dbQueryService.listDatabases(parseInt(req.params.id as string));
    success(res, dbs);
  } catch (err: any) { logger.error({ err: err.message }, 'listDatabases failed'); error(res, err.message, 1, 500); }
});

// GET /api/database/:id/objects
router.get('/:id/objects', async (req: Request, res: Response) => {
  try {
    const db = req.query.database as string | undefined;
    const objects = await dbQueryService.getObjects(parseInt(req.params.id as string), db);
    success(res, objects);
  } catch (err: any) { logger.error({ err: err.message }, 'getObjects failed'); error(res, err.message, 1, 500); }
});

// GET /api/database/:id/table/:table
router.get('/:id/table/:table', async (req: Request, res: Response) => {
  try {
    const info = await dbQueryService.getTableInfo(parseInt(req.params.id as string), req.params.table as string);
    success(res, info);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// GET /api/database/:id/sessions
router.get('/:id/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await dbQueryService.getSessions(parseInt(req.params.id as string));
    success(res, sessions);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// DELETE /api/database/:id/sessions/:sessionId
router.delete('/:id/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);
    const sessionId = parseInt(req.params.sessionId as string);
    await dbQueryService.killSession(assetId, sessionId);
    await recordAudit({
      ...auditFromReq(req),
      action: 'db_kill_session',
      targetType: 'database_asset',
      targetId: assetId,
      detail: { sessionId },
    });
    success(res, null, '会话已终止');
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// POST /api/database/:id/export
router.post('/:id/export', async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);
    const { table, format, limit } = req.body;
    if (!table?.trim()) { error(res, '请指定表名', 1, 400); return; }
    if (format !== 'csv' && format !== 'sql') { error(res, 'format 须为 csv 或 sql', 1, 400); return; }

    const result = await dbQueryService.exportTable(assetId, table.trim(), format, limit);
    await recordAudit({
      ...auditFromReq(req),
      action: 'db_export',
      targetType: 'database_asset',
      targetId: assetId,
      detail: { table, format, rowCount: result.rowCount },
    });
    success(res, result);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// POST /api/database/:id/import
router.post('/:id/import', async (req: Request, res: Response) => {
  try {
    const assetId = parseInt(req.params.id as string);
    const { table, format, content } = req.body;
    if (!table?.trim()) { error(res, '请指定表名', 1, 400); return; }
    if (format !== 'csv' && format !== 'sql') { error(res, 'format 须为 csv 或 sql', 1, 400); return; }
    if (!content?.trim()) { error(res, '导入内容不能为空', 1, 400); return; }

    const result = await dbQueryService.importData(assetId, table.trim(), format, content);
    await recordAudit({
      ...auditFromReq(req),
      action: 'db_import',
      targetType: 'database_asset',
      targetId: assetId,
      detail: { table, format, affectedRows: result.affectedRows },
    });
    success(res, result, `导入完成，影响 ${result.affectedRows} 行`);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// GET /api/database/history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, asset_id, query_text, db_name, status, row_count, duration_ms, error_message, executed_at
       FROM query_history WHERE user_id = ? ORDER BY executed_at DESC LIMIT 100`,
      [req.user!.userId]
    );
    success(res, rows);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// GET /api/database/saved-queries
router.get('/saved-queries', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, asset_id, name, query_text, created_at FROM saved_queries WHERE user_id = ? ORDER BY updated_at DESC`,
      [req.user!.userId]
    );
    success(res, rows);
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// POST /api/database/saved-queries
router.post('/saved-queries', async (req: Request, res: Response) => {
  try {
    const { name, query_text, asset_id } = req.body;
    if (!name?.trim() || !query_text?.trim()) { error(res, '名称和 SQL 不能为空', 1, 400); return; }
    await pool.query(
      `INSERT INTO saved_queries (user_id, asset_id, name, query_text) VALUES (?, ?, ?, ?)`,
      [req.user!.userId, asset_id || null, name.trim(), query_text.trim()]
    );
    success(res, null, '查询已保存');
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// DELETE /api/database/saved-queries/:id
router.delete('/saved-queries/:id', async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM saved_queries WHERE id = ? AND user_id = ?`, [req.params.id, req.user!.userId]);
    success(res, null, '已删除');
  } catch (err: any) { error(res, err.message, 1, 500); }
});

export default router;
