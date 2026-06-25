CREATE DATABASE IF NOT EXISTS bastion_host
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE bastion_host;

-- ========== 用户表 ==========
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('admin','operator','auditor') NOT NULL DEFAULT 'operator',
  email           VARCHAR(128) DEFAULT NULL,
  phone           VARCHAR(20)  DEFAULT NULL,
  totp_secret     VARCHAR(64)  DEFAULT NULL COMMENT 'TOTP 密钥（base32）',
  mfa_enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  mfa_recovery    JSON         DEFAULT NULL COMMENT 'MFA 备用恢复码（bcrypt hash 存储）',
  status          ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login      DATETIME     DEFAULT NULL,
  login_fails     TINYINT      NOT NULL DEFAULT 0,
  locked_until    DATETIME     DEFAULT NULL COMMENT '登录锁定到期时间',
  password_changed_at DATETIME DEFAULT NULL COMMENT '密码最后修改时间（用于密码过期策略）',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT '下次登录强制修改密码',
  known_ips        JSON         DEFAULT NULL COMMENT '已登录过的IP列表（用于异常登录检测）',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     DEFAULT NULL COMMENT '软删除',
  INDEX idx_role (role),
  INDEX idx_status (status),
  INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 资产表 ==========
CREATE TABLE IF NOT EXISTS assets (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(128) NOT NULL,
  host                  VARCHAR(255) NOT NULL,
  port                  INT          NOT NULL,
  protocol              ENUM('ssh','rdp') NOT NULL,
  username              VARCHAR(64)  DEFAULT NULL,
  password_encrypted    TEXT         DEFAULT NULL COMMENT 'AES-256-CBC 加密',
  private_key_encrypted TEXT         DEFAULT NULL COMMENT 'SSH 私钥（AES 加密）',
  group_name            VARCHAR(64)  NOT NULL DEFAULT 'default',
  description           VARCHAR(512) DEFAULT NULL,
  recording_enabled     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否开启会话录像回放',
  status                ENUM('online','offline','unknown') NOT NULL DEFAULT 'unknown',
  last_checked_at       DATETIME     DEFAULT NULL COMMENT '最后连接测试时间',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            DATETIME     DEFAULT NULL,
  INDEX idx_protocol (protocol),
  INDEX idx_group (group_name),
  INDEX idx_status (status),
  INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 授权表 ==========
CREATE TABLE IF NOT EXISTS authorizations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT       NOT NULL,
  asset_id    INT       NOT NULL,
  start_time  DATETIME  DEFAULT NULL COMMENT '授权生效时间（NULL=永久有效）',
  end_time    DATETIME  DEFAULT NULL COMMENT '授权过期时间（NULL=永不过期）',
  granted_by  INT       DEFAULT NULL COMMENT '授权人 user_id',
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_asset (user_id, asset_id),
  INDEX idx_user (user_id),
  INDEX idx_asset (asset_id),
  INDEX idx_end_time (end_time),
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 会话表 ==========
CREATE TABLE IF NOT EXISTS sessions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  asset_id        INT          NOT NULL,
  protocol        ENUM('ssh','rdp') NOT NULL,
  start_time      DATETIME(3)  NOT NULL COMMENT '毫秒精度',
  end_time        DATETIME(3)  DEFAULT NULL,
  duration_sec    INT          DEFAULT NULL COMMENT '会话时长（秒）',
  status          ENUM('active','closed','terminated','timeout') NOT NULL DEFAULT 'active',
  command_count   INT          NOT NULL DEFAULT 0,
  recording_path  VARCHAR(512) DEFAULT NULL COMMENT '录像文件路径',
  client_ip       VARCHAR(45)  DEFAULT NULL,
  termination_by  VARCHAR(32)  DEFAULT NULL COMMENT '断开方: user/system/admin',
  INDEX idx_user (user_id),
  INDEX idx_asset (asset_id),
  INDEX idx_status (status),
  INDEX idx_start_time (start_time),
  INDEX idx_end_time (end_time),
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 命令日志表 ==========
CREATE TABLE IF NOT EXISTS command_logs (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id    INT          NOT NULL,
  timestamp     DATETIME(3)  NOT NULL COMMENT '毫秒精度，用于回放时间轴',
  command       TEXT         NOT NULL,
  is_dangerous  TINYINT(1)   NOT NULL DEFAULT 0,
  is_blocked    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已被阻断',
  risk_level    ENUM('low','medium','high','critical') DEFAULT NULL,
  INDEX idx_session (session_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_dangerous (is_dangerous),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 审计日志表（通用操作审计）==========
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          DEFAULT NULL,
  username    VARCHAR(64)  DEFAULT NULL COMMENT '冗余用户名，方便查询',
  action      VARCHAR(64)  NOT NULL COMMENT 'login/logout/create/update/delete/connect/disconnect',
  target_type VARCHAR(32)  DEFAULT NULL COMMENT 'user/asset/authorization/session',
  target_id   INT          DEFAULT NULL,
  detail      JSON         DEFAULT NULL COMMENT '操作详情（变更前后对比）',
  ip          VARCHAR(45)  DEFAULT NULL,
  user_agent  VARCHAR(512) DEFAULT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_target (target_type, target_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 登录日志表 ==========
CREATE TABLE IF NOT EXISTS login_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          DEFAULT NULL,
  username    VARCHAR(64)  NOT NULL,
  ip          VARCHAR(45)  DEFAULT NULL,
  user_agent  VARCHAR(512) DEFAULT NULL,
  result      ENUM('success','fail_wrong_password','fail_no_user','fail_locked','fail_mfa') NOT NULL,
  mfa_used    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_result (result),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 密码历史表 ==========
CREATE TABLE IF NOT EXISTS password_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== IP 白名单表 ==========
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  network     VARCHAR(45)  NOT NULL COMMENT 'CIDR网络地址，如 10.0.0.0',
  mask        INT          NOT NULL COMMENT 'CIDR前缀长度，如 8',
  description VARCHAR(255) DEFAULT NULL,
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 用户 IP 绑定表 ==========
CREATE TABLE IF NOT EXISTS user_ip_bindings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL UNIQUE,
  ip_address  VARCHAR(45)  NOT NULL COMMENT '单个IP或CIDR',
  description VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 登录通知表 ==========
CREATE TABLE IF NOT EXISTS login_notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  type       ENUM('new_ip_login','failed_login','account_locked','password_changed') NOT NULL,
  ip         VARCHAR(45)  DEFAULT NULL,
  detail     JSON         DEFAULT NULL,
  `read`     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_id, `read`, created_at DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 系统配置表 ==========
CREATE TABLE IF NOT EXISTS system_config (
  config_key   VARCHAR(64) PRIMARY KEY,
  config_value JSON        NOT NULL,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO system_config (config_key, config_value) VALUES ('password_policy', '{
  "min_length": 8,
  "require_upper": true,
  "require_lower": true,
  "require_digit": true,
  "require_special": false,
  "expire_days": 90,
  "history_count": 5,
  "force_change_on_create": true,
  "captcha_threshold": 3,
  "lockout_threshold": 10,
  "lockout_minutes": 15
}');

-- ========== 插入默认 admin 用户（密码: admin123）==========
INSERT IGNORE INTO users (username, password_hash, role, email, status)
VALUES ('admin', '$2a$10$XGtbV7ay3sdMXlK8g7kdYeFwSx2E9i27KNKc0w.HmQ7ktqEdq5t7S', 'admin', 'admin@bastion.local', 'active');
