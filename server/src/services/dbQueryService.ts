import pool from '../database/connection';
import { decrypt } from '../utils/crypto';
import logger from '../utils/logger';

interface DbConnection {
  host: string; port: number; dbType: string; database: string; user: string; password: string;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  durationMs: number;
  affectedRows?: number;
}

export interface DbSession {
  id: number;
  user: string;
  host: string;
  database: string;
  command: string;
  time: number;
  state: string;
  query: string;
}

function escapeMysqlId(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

function escapeMssqlId(name: string): string {
  return '[' + name.replace(/]/g, ']]') + ']';
}

function mssqlConfig(conn: DbConnection) {
  return {
    server: conn.host,
    port: conn.port || 1433,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 10000,
      requestTimeout: 60000,
    },
  };
}

async function withMssql<T>(conn: DbConnection, fn: (pool: any, sql: any) => Promise<T>): Promise<T> {
  if (!mssqlModule) mssqlModule = require('mssql');
  const pool = new mssqlModule.ConnectionPool(mssqlConfig(conn));
  await pool.connect();
  try {
    return await fn(pool, mssqlModule);
  } finally {
    await pool.close();
  }
}

function mssqlRowsToResult(recordset: any[], rowsAffected?: number[], durationMs = 0): QueryResult {
  const arrRows = Array.isArray(recordset) ? recordset : [];
  const columns = arrRows.length > 0 ? Object.keys(arrRows[0]) : [];
  const affected = rowsAffected?.[0];
  return {
    columns,
    rows: arrRows.slice(0, 200).map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    }),
    rowCount: affected !== undefined ? affected : arrRows.length,
    durationMs,
    affectedRows: affected,
  };
}

function escapeSqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

let mssqlModule: any = null;
let mysqlModule: any = null;
let pgModule: any = null;

async function getConnection(assetId: number): Promise<DbConnection> {
  const [rows] = await pool.query<any[]>(
    `SELECT host, port, db_type, database_name, username, password_encrypted FROM assets WHERE id = ? AND asset_type = 'database' AND deleted_at IS NULL`,
    [assetId]
  );
  if (rows.length === 0) throw new Error('数据库资产不存在或已删除');
  const a = rows[0];
  if (!a.database_name) throw new Error('该资产未设置数据库名，请编辑资产填写数据库名字段');
  return {
    host: a.host, port: a.port, dbType: a.db_type,
    database: a.database_name,
    user: a.username,
    password: a.password_encrypted ? decrypt(a.password_encrypted) : '',
  };
}

async function queryMssql(conn: DbConnection, sql: string): Promise<QueryResult> {
  return withMssql(conn, async (pool) => {
    const start = Date.now();
    const result = await pool.request().query(sql);
    return mssqlRowsToResult(
      result.recordset || [],
      result.rowsAffected,
      Date.now() - start
    );
  });
}

async function testMssqlConnection(conn: DbConnection): Promise<void> {
  await withMssql(conn, async (pool) => {
    await pool.request().query('SELECT 1 AS ok');
  });
}

async function queryMysql(conn: DbConnection, sql: string): Promise<QueryResult> {
  if (!mysqlModule) mysqlModule = require('mysql2/promise');
  const connection = await mysqlModule.createConnection({
    host: conn.host, port: conn.port, database: conn.database,
    user: conn.user, password: conn.password, connectTimeout: 10000,
  });
  try {
    const start = Date.now();
    const [rows, fields] = await connection.query(sql);
    const duration = Date.now() - start;
    const columns = fields?.map((f: any) => f.name) || [];
    const arrRows = Array.isArray(rows) ? rows : [];
    const affected = (rows as any)?.affectedRows;
    return {
      columns, rows: arrRows.slice(0, 200),
      rowCount: affected !== undefined ? affected : arrRows.length,
      durationMs: duration, affectedRows: affected,
    };
  } finally { connection.end(); }
}

async function queryPostgres(conn: DbConnection, sql: string): Promise<QueryResult> {
  if (!pgModule) pgModule = require('pg');
  const client = new pgModule.Client({
    host: conn.host, port: conn.port, database: conn.database,
    user: conn.user, password: conn.password, connectionTimeoutMillis: 10000, statement_timeout: 30000,
  });
  try {
    await client.connect();
    const start = Date.now();
    const result = await client.query(sql);
    const duration = Date.now() - start;
    return {
      columns: result.fields?.map((f: any) => f.name) || [],
      rows: result.rows?.slice(0, 200) || [],
      rowCount: result.rowCount || 0,
      durationMs: duration,
    };
  } finally { client.end(); }
}

export const dbQueryService = {
  async execute(assetId: number, sql: string): Promise<QueryResult> {
    const conn = await getConnection(assetId);
    const trimmed = sql.trim();
    if (!trimmed) throw new Error('SQL 语句不能为空');

    // Detect multiple statements
    if (/;\s*\S/.test(trimmed.replace(/;\s*$/, ''))) {
      throw new Error('一次只能执行一条语句');
    }

    logger.info({ assetId, dbType: conn.dbType, sqlLen: trimmed.length }, 'Executing SQL query');

    switch (conn.dbType) {
      case 'mssql': return queryMssql(conn, trimmed);
      case 'mysql': return queryMysql(conn, trimmed);
      case 'postgresql': return queryPostgres(conn, trimmed);
      default: throw new Error(`不支持的数据库类型: ${conn.dbType}`);
    }
  },

  async testConnection(assetId: number): Promise<{ success: boolean; message: string }> {
    try {
      const conn = await getConnection(assetId);
      switch (conn.dbType) {
        case 'mysql': {
          const mysql2 = require('mysql2/promise');
          const c = await mysql2.createConnection({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database, connectTimeout: 5000 });
          await c.ping(); c.end();
          return { success: true, message: '连接成功' };
        }
        case 'postgresql': {
          const pg = require('pg');
          const c = new pg.Client({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database, connectionTimeoutMillis: 5000 });
          await c.connect(); await c.query('SELECT 1'); c.end();
          return { success: true, message: '连接成功' };
        }
        case 'mssql': {
          await testMssqlConnection(conn);
          return { success: true, message: '连接成功' };
        }
        default:
          return { success: false, message: `暂不支持该数据库类型的连接测试: ${conn.dbType}` };
      }
    } catch (err: any) {
      return { success: false, message: err.message || '连接失败' };
    }
  },

  async getObjects(assetId: number): Promise<{ tables: string[]; views: string[]; procedures: string[] }> {
    const conn = await getConnection(assetId);
    switch (conn.dbType) {
      case 'mysql': {
        const mysql2 = require('mysql2/promise');
        const c = await mysql2.createConnection({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database, connectTimeout: 5000 });
        try {
          const [tables] = await c.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`, [conn.database]);
          const [views] = await c.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`, [conn.database]);
          const [procs] = await c.query(`SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ?`, [conn.database]);
          return {
            tables: (tables as any[]).map(r => r.TABLE_NAME),
            views: (views as any[]).map(r => r.TABLE_NAME),
            procedures: (procs as any[]).map(r => r.ROUTINE_NAME),
          };
        } finally { c.end(); }
      }
      case 'postgresql': {
        const pg = require('pg');
        const c = new pg.Client({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database, connectionTimeoutMillis: 5000 });
        try {
          await c.connect();
          const tables = await c.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`);
          const views = await c.query(`SELECT viewname FROM pg_catalog.pg_views WHERE schemaname = 'public'`);
          const procs = await c.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public'`);
          return {
            tables: tables.rows.map((r: any) => r.tablename),
            views: views.rows.map((r: any) => r.viewname),
            procedures: procs.rows.map((r: any) => r.proname),
          };
        } finally { c.end(); }
      }
      case 'mssql': {
        return withMssql(conn, async (pool, sql) => {
          const db = conn.database;
          const tables = await pool.request()
            .input('db', sql.NVarChar, db)
            .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = @db ORDER BY TABLE_NAME`);
          const views = await pool.request()
            .input('db', sql.NVarChar, db)
            .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_CATALOG = @db ORDER BY TABLE_NAME`);
          const procs = await pool.request()
            .input('db', sql.NVarChar, db)
            .query(`SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_CATALOG = @db ORDER BY ROUTINE_NAME`);
          return {
            tables: tables.recordset.map((r: any) => r.TABLE_NAME),
            views: views.recordset.map((r: any) => r.TABLE_NAME),
            procedures: procs.recordset.map((r: any) => r.ROUTINE_NAME),
          };
        });
      }
      default:
        return { tables: [], views: [], procedures: [] };
    }
  },

  async getTableInfo(assetId: number, tableName: string): Promise<{ columns: any[]; ddl: string }> {
    const conn = await getConnection(assetId);
    switch (conn.dbType) {
      case 'mysql': {
        const mysql2 = require('mysql2/promise');
        const c = await mysql2.createConnection({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database, connectTimeout: 5000 });
        try {
          const [cols] = await c.query(`SELECT COLUMN_NAME as name, COLUMN_TYPE as type, IS_NULLABLE as nullable, COLUMN_DEFAULT as default_val, COLUMN_KEY as key_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`, [conn.database, tableName]);
          const [ddl] = await c.query(`SHOW CREATE TABLE \`${tableName}\``);
          return { columns: cols as any[], ddl: (ddl as any[])[0]?.['Create Table'] || '' };
        } finally { c.end(); }
      }
      case 'postgresql': {
        const pg = require('pg');
        const c = new pg.Client({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database, connectionTimeoutMillis: 5000 });
        try {
          await c.connect();
          const cols = await c.query(
            `SELECT column_name as name, data_type as type, is_nullable as nullable, column_default as default_val
             FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
            [tableName]
          );
          return { columns: cols.rows, ddl: `-- PostgreSQL table: ${tableName}` };
        } finally { c.end(); }
      }
      case 'mssql': {
        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        if (!safeName) return { columns: [], ddl: '' };
        return withMssql(conn, async (pool, sql) => {
          const cols = await pool.request()
            .input('table', sql.NVarChar, safeName)
            .query(`
              SELECT c.COLUMN_NAME AS name,
                c.DATA_TYPE +
                  CASE WHEN c.CHARACTER_MAXIMUM_LENGTH IS NOT NULL
                    THEN '(' + CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR(10)) + ')'
                    WHEN c.NUMERIC_PRECISION IS NOT NULL
                    THEN '(' + CAST(c.NUMERIC_PRECISION AS VARCHAR(10)) +
                      CASE WHEN c.NUMERIC_SCALE IS NOT NULL THEN ',' + CAST(c.NUMERIC_SCALE AS VARCHAR(10)) ELSE '' END + ')'
                    ELSE '' END AS type,
                c.IS_NULLABLE AS nullable,
                c.COLUMN_DEFAULT AS default_val,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRI' ELSE '' END AS key_type
              FROM INFORMATION_SCHEMA.COLUMNS c
              LEFT JOIN (
                SELECT ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND ku.TABLE_NAME = @table
              ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
              WHERE c.TABLE_NAME = @table
              ORDER BY c.ORDINAL_POSITION
            `);
          const columns = cols.recordset as any[];
          const ddlLines = columns.map((col) => {
            const nullable = col.nullable === 'YES' ? 'NULL' : 'NOT NULL';
            const def = col.default_val != null ? ` DEFAULT ${col.default_val}` : '';
            return `  ${escapeMssqlId(col.name)} ${col.type} ${nullable}${def}`;
          });
          const ddl = ddlLines.length
            ? `CREATE TABLE ${escapeMssqlId(safeName)} (\n${ddlLines.join(',\n')}\n);`
            : '';
          return { columns, ddl };
        });
      }
      default:
        return { columns: [], ddl: '' };
    }
  },

  async getSessions(assetId: number): Promise<DbSession[]> {
    const conn = await getConnection(assetId);
    switch (conn.dbType) {
      case 'mysql': {
        const mysql2 = require('mysql2/promise');
        const c = await mysql2.createConnection({
          host: conn.host, port: conn.port, user: conn.user, password: conn.password,
          database: conn.database, connectTimeout: 5000,
        });
        try {
          const [rows] = await c.query('SHOW FULL PROCESSLIST');
          return (rows as any[]).map((r) => ({
            id: r.Id,
            user: r.User || '',
            host: r.Host || '',
            database: r.db || '',
            command: r.Command || '',
            time: r.Time || 0,
            state: r.State || '',
            query: r.Info || '',
          }));
        } finally { c.end(); }
      }
      case 'postgresql': {
        const pg = require('pg');
        const c = new pg.Client({
          host: conn.host, port: conn.port, user: conn.user, password: conn.password,
          database: conn.database, connectionTimeoutMillis: 5000,
        });
        try {
          await c.connect();
          const result = await c.query(`
            SELECT pid as id, usename as user, COALESCE(host(client_addr)::text, '') as host,
                   datname as database, state as command,
                   EXTRACT(EPOCH FROM (now() - query_start))::int as time,
                   state, LEFT(query, 500) as query
            FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()
            ORDER BY query_start DESC NULLS LAST
          `);
          return result.rows.map((r: any) => ({
            id: r.id,
            user: r.user || '',
            host: r.host || '',
            database: r.database || '',
            command: r.command || '',
            time: r.time || 0,
            state: r.state || '',
            query: r.query || '',
          }));
        } finally { c.end(); }
      }
      case 'mssql': {
        return withMssql(conn, async (pool) => {
          const result = await pool.request().query(`
            SELECT s.session_id AS id,
              s.login_name AS [user],
              COALESCE(c.client_net_address, '') AS host,
              DB_NAME(s.database_id) AS [database],
              COALESCE(r.status, s.status) AS command,
              COALESCE(r.total_elapsed_time, 0) / 1000 AS time,
              COALESCE(r.status, s.status) AS state,
              LEFT(COALESCE(t.text, ''), 500) AS query
            FROM sys.dm_exec_sessions s
            LEFT JOIN sys.dm_exec_connections c ON s.session_id = c.session_id
            LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
            OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
            WHERE s.is_user_process = 1 AND s.session_id <> @@SPID
            ORDER BY time DESC
          `);
          return result.recordset.map((r: any) => ({
            id: r.id,
            user: r.user || '',
            host: r.host || '',
            database: r.database || '',
            command: r.command || '',
            time: r.time || 0,
            state: r.state || '',
            query: r.query || '',
          }));
        });
      }
      default:
        return [];
    }
  },

  async killSession(assetId: number, sessionId: number): Promise<void> {
    const conn = await getConnection(assetId);
    switch (conn.dbType) {
      case 'mysql': {
        const mysql2 = require('mysql2/promise');
        const c = await mysql2.createConnection({
          host: conn.host, port: conn.port, user: conn.user, password: conn.password,
          database: conn.database, connectTimeout: 5000,
        });
        try {
          await c.query('KILL ?', [sessionId]);
        } finally { c.end(); }
        return;
      }
      case 'postgresql': {
        const pg = require('pg');
        const c = new pg.Client({
          host: conn.host, port: conn.port, user: conn.user, password: conn.password,
          database: conn.database, connectionTimeoutMillis: 5000,
        });
        try {
          await c.connect();
          await c.query('SELECT pg_terminate_backend($1)', [sessionId]);
        } finally { c.end(); }
        return;
      }
      case 'mssql': {
        await withMssql(conn, async (pool) => {
          await pool.request().query(`KILL ${sessionId}`);
        });
        return;
      }
      default:
        throw new Error(`不支持的数据库类型: ${conn.dbType}`);
    }
  },

  async exportTable(
    assetId: number,
    table: string,
    format: 'csv' | 'sql',
    limit = 10000
  ): Promise<{ content: string; filename: string; mimeType: string; rowCount: number }> {
    const conn = await getConnection(assetId);
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeTable) throw new Error('无效的表名');

    const cappedLimit = Math.min(Math.max(limit, 1), 50000);

    if (conn.dbType === 'mysql') {
      const mysql2 = require('mysql2/promise');
      const c = await mysql2.createConnection({
        host: conn.host, port: conn.port, user: conn.user, password: conn.password,
        database: conn.database, connectTimeout: 10000,
      });
      try {
        const [rows, fields] = await c.query(
          `SELECT * FROM ${escapeMysqlId(safeTable)} LIMIT ?`,
          [cappedLimit]
        );
        const arrRows = rows as Record<string, unknown>[];
        const columns = (fields as any[])?.map((f) => f.name) || Object.keys(arrRows[0] || {});

        if (format === 'csv') {
          const header = columns.join(',');
          const body = arrRows
            .map((r) =>
              columns
                .map((col) => {
                  const v = r[col] ?? '';
                  return /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
                })
                .join(',')
            )
            .join('\n');
          return {
            content: '\uFEFF' + header + '\n' + body,
            filename: `${safeTable}.csv`,
            mimeType: 'text/csv;charset=utf-8',
            rowCount: arrRows.length,
          };
        }

        const tbl = escapeMysqlId(safeTable);
        const colList = columns.map(escapeMysqlId).join(', ');
        const sqlLines = arrRows.map((r) => {
          const vals = columns.map((col) => escapeSqlValue(r[col])).join(', ');
          return `INSERT INTO ${tbl} (${colList}) VALUES (${vals});`;
        });
        return {
          content: sqlLines.join('\n'),
          filename: `${safeTable}.sql`,
          mimeType: 'text/plain;charset=utf-8',
          rowCount: arrRows.length,
        };
      } finally { c.end(); }
    }

    if (conn.dbType === 'postgresql') {
      const pg = require('pg');
      const c = new pg.Client({
        host: conn.host, port: conn.port, user: conn.user, password: conn.password,
        database: conn.database, connectionTimeoutMillis: 10000,
      });
      try {
        await c.connect();
        const result = await c.query(`SELECT * FROM "${safeTable}" LIMIT $1`, [cappedLimit]);
        const columns = result.fields.map((f: any) => f.name);
        const arrRows = result.rows;

        if (format === 'csv') {
          const header = columns.join(',');
          const body = arrRows
            .map((r: Record<string, unknown>) =>
              columns
                .map((col: string) => {
                  const v = r[col] ?? '';
                  return /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
                })
                .join(',')
            )
            .join('\n');
          return {
            content: '\uFEFF' + header + '\n' + body,
            filename: `${safeTable}.csv`,
            mimeType: 'text/csv;charset=utf-8',
            rowCount: arrRows.length,
          };
        }

        const colList = columns.map((c: string) => `"${c}"`).join(', ');
        const sqlLines = arrRows.map((r: Record<string, unknown>) => {
          const vals = columns.map((col: string) => escapeSqlValue(r[col])).join(', ');
          return `INSERT INTO "${safeTable}" (${colList}) VALUES (${vals});`;
        });
        return {
          content: sqlLines.join('\n'),
          filename: `${safeTable}.sql`,
          mimeType: 'text/plain;charset=utf-8',
          rowCount: arrRows.length,
        };
      } finally { c.end(); }
    }

    if (conn.dbType === 'mssql') {
      return withMssql(conn, async (pool) => {
        const tbl = escapeMssqlId(safeTable);
        const result = await pool.request()
          .query(`SELECT TOP ${cappedLimit} * FROM ${tbl}`);
        const arrRows = (result.recordset || []).map((row: Record<string, unknown>) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(row)) {
            out[k] = v instanceof Date ? v.toISOString() : v;
          }
          return out;
        });
        const columns = arrRows.length > 0 ? Object.keys(arrRows[0]) : [];

        if (format === 'csv') {
          const header = columns.join(',');
          const body = arrRows
            .map((r: Record<string, unknown>) =>
              columns
                .map((col: string) => {
                  const v = r[col] ?? '';
                  return /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
                })
                .join(',')
            )
            .join('\n');
          return {
            content: '\uFEFF' + header + '\n' + body,
            filename: `${safeTable}.csv`,
            mimeType: 'text/csv;charset=utf-8',
            rowCount: arrRows.length,
          };
        }

        const colList = columns.map(escapeMssqlId).join(', ');
        const sqlLines = arrRows.map((r: Record<string, unknown>) => {
          const vals = columns.map((col: string) => escapeSqlValue(r[col])).join(', ');
          return `INSERT INTO ${tbl} (${colList}) VALUES (${vals});`;
        });
        return {
          content: sqlLines.join('\n'),
          filename: `${safeTable}.sql`,
          mimeType: 'text/plain;charset=utf-8',
          rowCount: arrRows.length,
        };
      });
    }

    throw new Error(`暂不支持 ${conn.dbType} 的数据导出`);
  },

  async importData(
    assetId: number,
    table: string,
    format: 'csv' | 'sql',
    content: string
  ): Promise<{ affectedRows: number }> {
    const conn = await getConnection(assetId);
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeTable) throw new Error('无效的表名');
    if (!content?.trim()) throw new Error('导入内容不能为空');

    if (format === 'sql') {
      const stmts = content
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (stmts.length === 0) throw new Error('未找到有效 SQL 语句');
      if (stmts.length > 200) throw new Error('单次最多导入 200 条 SQL 语句');

      let total = 0;
      for (const stmt of stmts) {
        if (!/^(INSERT|REPLACE)\b/i.test(stmt)) {
          throw new Error('SQL 导入仅支持 INSERT / REPLACE 语句');
        }
        const result = await this.execute(assetId, stmt);
        total += result.affectedRows ?? result.rowCount ?? 0;
      }
      return { affectedRows: total };
    }

    const { headers, rows } = parseCsv(content);
    if (headers.length === 0 || rows.length === 0) throw new Error('CSV 文件为空或格式无效');
    if (rows.length > 5000) throw new Error('单次最多导入 5000 行 CSV 数据');

    let total = 0;
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      if (conn.dbType === 'mysql') {
        const cols = headers.map(escapeMysqlId).join(', ');
        const values = batch
          .map((row) => `(${headers.map((_, idx) => escapeSqlValue(row[idx] ?? null)).join(', ')})`)
          .join(', ');
        const sql = `INSERT INTO ${escapeMysqlId(safeTable)} (${cols}) VALUES ${values}`;
        const result = await this.execute(assetId, sql);
        total += result.affectedRows ?? batch.length;
      } else if (conn.dbType === 'mssql') {
        const tbl = escapeMssqlId(safeTable);
        const cols = headers.map(escapeMssqlId).join(', ');
        const values = batch
          .map((row) => `(${headers.map((_, idx) => escapeSqlValue(row[idx] ?? null)).join(', ')})`)
          .join(', ');
        const sql = `INSERT INTO ${tbl} (${cols}) VALUES ${values}`;
        const result = await this.execute(assetId, sql);
        total += result.affectedRows ?? batch.length;
      } else if (conn.dbType === 'postgresql') {
        const cols = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(', ');
        for (const row of batch) {
          const placeholders = headers.map((_, idx) => `$${idx + 1}`).join(', ');
          const sql = `INSERT INTO "${safeTable}" (${cols}) VALUES (${placeholders})`;
          const pg = require('pg');
          const client = new pg.Client({
            host: conn.host, port: conn.port, user: conn.user, password: conn.password,
            database: conn.database, connectionTimeoutMillis: 10000,
          });
          try {
            await client.connect();
            const result = await client.query(sql, headers.map((_, idx) => row[idx] ?? null));
            total += result.rowCount || 1;
          } finally { client.end(); }
        }
      } else {
        throw new Error(`暂不支持 ${conn.dbType} 的 CSV 导入`);
      }
    }
    return { affectedRows: total };
  },
};
