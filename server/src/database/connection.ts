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
  // Helper: run ALTER TABLE, ignore if column already exists
  const safeAlter = async (sql: string, label: string) => {
    try {
      await pool.query(sql);
      logger.info(`Migration: ${label}`);
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        logger.warn({ err, code: err?.code }, `Migration ${label} skipped`);
      }
    }
  };

  // Helper: create table if not exists
  const safeCreate = async (sql: string, label: string) => {
    try {
      await pool.query(sql);
      logger.info(`Migration: ${label}`);
    } catch (err: any) {
      logger.warn({ err, code: err?.code }, `Migration ${label} skipped`);
    }
  };

  await safeAlter(
    `ALTER TABLE assets ADD COLUMN recording_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否开启会话录像回放'`,
    'assets.recording_enabled'
  );

  // ── 002-login-security ──
  await safeAlter(
    `ALTER TABLE users ADD COLUMN password_changed_at DATETIME DEFAULT NULL COMMENT '密码最后修改时间'`,
    'users.password_changed_at'
  );
  await safeAlter(
    `ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT '下次登录强制修改密码'`,
    'users.must_change_password'
  );
  await safeAlter(
    `ALTER TABLE users ADD COLUMN known_ips JSON DEFAULT NULL COMMENT '已登录过的IP列表'`,
    'users.known_ips'
  );

  await safeCreate(
    `CREATE TABLE IF NOT EXISTS password_history (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL, password_hash VARCHAR(255) NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_user_created (user_id, created_at DESC),
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    'table password_history'
  );

  await safeCreate(
    `CREATE TABLE IF NOT EXISTS ip_whitelist (
       id INT AUTO_INCREMENT PRIMARY KEY,
       network VARCHAR(45) NOT NULL, mask INT NOT NULL,
       description VARCHAR(255) DEFAULT NULL,
       enabled TINYINT(1) NOT NULL DEFAULT 1,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    'table ip_whitelist'
  );

  await safeCreate(
    `CREATE TABLE IF NOT EXISTS user_ip_bindings (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL UNIQUE, ip_address VARCHAR(45) NOT NULL,
       description VARCHAR(255) DEFAULT NULL,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    'table user_ip_bindings'
  );

  await safeCreate(
    `CREATE TABLE IF NOT EXISTS login_notifications (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL,
       type ENUM('new_ip_login','failed_login','account_locked','password_changed') NOT NULL,
       ip VARCHAR(45) DEFAULT NULL, detail JSON DEFAULT NULL,
       \`read\` TINYINT(1) NOT NULL DEFAULT 0,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_user_read (user_id, \`read\`, created_at DESC),
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    'table login_notifications'
  );

  await safeCreate(
    `CREATE TABLE IF NOT EXISTS system_config (
       config_key VARCHAR(64) PRIMARY KEY,
       config_value JSON NOT NULL,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    'table system_config'
  );

  // Insert default password policy if not exists
  try {
    await pool.query(
      `INSERT IGNORE INTO system_config (config_key, config_value) VALUES ('password_policy', ?)`,
      [JSON.stringify({
        min_length: 8, require_upper: true, require_lower: true, require_digit: true,
        require_special: false, expire_days: 90, history_count: 5,
        force_change_on_create: true, captcha_threshold: 3,
        lockout_threshold: 10, lockout_minutes: 15,
      })]
    );
  } catch (err: any) {
    logger.warn({ err }, 'Migration default password_policy skipped');
  }
}

export default pool;
