-- Migration 002: Login Security Enhancement
-- Run against existing database: mysql -u root -p bastion_host < migrate-002.sql

-- Add new columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT '下次登录强制修改密码',
  ADD COLUMN IF NOT EXISTS known_ips JSON DEFAULT NULL COMMENT '已登录过的IP列表';

-- Update password_changed_at for existing users (set to now so they don't expire immediately)
UPDATE users SET password_changed_at = NOW() WHERE password_changed_at IS NULL;

-- New tables
CREATE TABLE IF NOT EXISTS password_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ip_whitelist (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  network     VARCHAR(45)  NOT NULL,
  mask        INT          NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_ip_bindings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL UNIQUE,
  ip_address  VARCHAR(45)  NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
