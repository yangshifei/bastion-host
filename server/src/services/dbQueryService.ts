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
  return {
    host: a.host, port: a.port, dbType: a.db_type,
    database: a.database_name, user: a.username,
    password: a.password_encrypted ? decrypt(a.password_encrypted) : '',
  };
}

async function queryMssql(conn: DbConnection, sql: string): Promise<QueryResult> {
  if (!mssqlModule) mssqlModule = require('mssql');
  const config = {
    server: conn.host, port: conn.port, database: conn.database,
    user: conn.user, password: conn.password,
    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000, requestTimeout: 30000 },
  };
  await mssqlModule.connect(config);
  const result = await mssqlModule.query(sql);
  return { columns: [], rows: result.recordset, rowCount: result.rowsAffected?.[0] || result.recordset?.length || 0, durationMs: 0 };
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
      default:
        return { columns: [], ddl: '' };
    }
  },
};
