import mysql from 'mysql2/promise';
import config from '../config';
import logger from '../utils/logger';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pool as any).on('error', (err: any) => {
  logger.error({ err }, 'MySQL pool error');
});

export async function initPool(): Promise<void> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    logger.info('MySQL connected successfully');
    await runMigrations();
  } catch (err) {
    logger.error({ err }, 'MySQL connection failed');
    throw err;
  }
}

async function runMigrations(): Promise<void> {
  try {
    await pool.query(
      `ALTER TABLE assets ADD COLUMN recording_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否开启会话录像回放'`
    );
    logger.info('Migration: added assets.recording_enabled');
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME') {
      logger.warn({ err }, 'Migration assets.recording_enabled skipped or failed');
    }
  }
}

export default pool;
