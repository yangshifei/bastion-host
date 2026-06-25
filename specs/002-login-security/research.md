# Research: Login Security Enhancement

**Feature**: 002-login-security | **Date**: 2026-06-25

## 1. Password Policy Design

### Decision: Configurable policy with per-field toggles

**Rationale**: Different organizations have different compliance requirements. Making each rule independently toggleable allows maximum flexibility without complexity.

**Rules** (each independently configurable):
- `min_length`: 8–64 (default 8)
- `require_upper`: boolean (default true)
- `require_lower`: boolean (default true)
- `require_digit`: boolean (default true)
- `require_special`: boolean (default false)
- `expire_days`: 0 = never, 1–365 (default 90)
- `history_count`: 0–20 (default 5)
- `force_change_on_create`: boolean (default true)

**Alternatives considered**:
- *OWASP passfilt*: Too opinionated; enterprise customers want configurable rules
- *zxcvbn (Dropbox)*: Good for strength estimation but doesn't enforce specific rules; use as complementary UI indicator only

### Password history storage

**Decision**: Store bcrypt hashes of previous passwords in `password_history` table

**Rationale**: Bcrypt hashes are one-way. Even if the history table is compromised, plaintext passwords are not exposed. Comparing a new password against history requires bcrypt.compare() against each stored hash.

**Note**: This is O(N) per password change where N = history_count, but N ≤ 20 makes this negligible (< 100ms).

---

## 2. IP Whitelist Implementation

### Decision: CIDR-based check as Express middleware, executed before credential verification

**Rationale**: Rejecting at the network layer means attackers never reach the bcrypt step, saving CPU and preventing timing side-channels.

**Implementation approach**:
- Store CIDR ranges in `ip_whitelist` table as `network` (e.g., `10.0.0.0`) and `mask` (e.g., `8`)
- Use `ipaddr.js` or `netmask` library for CIDR matching (lightweight, pure JS)
- Global whitelist applies to all users; per-user binding intersects with global
- If global whitelist is empty → no restriction (backward compatible)

**Alternatives considered**:
- *nginx-level IP restriction*: More performant but harder to manage dynamically; requires nginx reload
- *iptables/nftables*: OS-level but not portable across Docker deployments

### Empty whitelist = no restriction

**Decision**: If no entries in `ip_whitelist`, all IPs are allowed

**Rationale**: Backward compatibility with existing deployments that have no IP restrictions.

---

## 3. CAPTCHA Integration

### Decision: Self-hosted simple math CAPTCHA as primary; hCaptcha as optional upgrade

**Rationale**: 
- Self-hosted math CAPTCHA (e.g., "3 + 7 = ?") requires no external service, no API keys, works in air-gapped environments
- Completely prevents automated scripts (which can't parse the question without OCR)
- HCaptcha can be added later as a configurable option for higher-security deployments

**Failure threshold**: Default 3 failed attempts before CAPTCHA appears. Configurable via `captcha_threshold` in password policy.

**Alternatives considered**:
- *Google reCAPTCHA v3*: Invisible but requires Google services; privacy concern for some enterprises
- *hCaptcha*: Good privacy posture but requires external API; add as optional upgrade path

### CAPTCHA fallback

**Decision**: If CAPTCHA generation fails, fall back to standard lockout after 5 failures (current behavior)

**Rationale**: Never block legitimate users due to CAPTCHA infrastructure issues.

---

## 4. Notification System

### Decision: In-app notification center with badge count in header

**Rationale**: Email notifications require SMTP configuration which many self-hosted deployments lack. In-app notifications work immediately.

**Event types**:
- `new_ip_login`: User logged in from an IP not seen before
- `failed_login`: One or more failed login attempts since last successful login
- `account_locked`: Account locked due to failed attempts
- `password_changed`: Password was changed (from different IP than current)

**Storage**: `login_notifications` table with `user_id`, `type`, `ip`, `detail` (JSON), `read` (boolean), `created_at`

**Display**: Header icon with unread badge count. Click opens dropdown listing recent notifications. "Mark all read" button.

---

## 5. Database Schema Impact

### New tables

```sql
CREATE TABLE password_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at DESC)
);

CREATE TABLE ip_whitelist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  network VARCHAR(45) NOT NULL,  -- e.g., '10.0.0.0'
  mask INT NOT NULL,              -- e.g., 8
  description VARCHAR(255),
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_ip_bindings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ip_address VARCHAR(45) NOT NULL,  -- single IP or CIDR
  description VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user (user_id)
);

CREATE TABLE login_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('new_ip_login', 'failed_login', 'account_locked', 'password_changed') NOT NULL,
  ip VARCHAR(45),
  detail JSON,
  `read` TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, `read`, created_at DESC)
);
```

### Columns added to `users`

```sql
ALTER TABLE users ADD COLUMN password_changed_at DATETIME;
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN known_ips JSON;  -- ['1.2.3.4', '5.6.7.8']
```

### System configuration

Password policy stored as a single-row table or JSON config:

```sql
CREATE TABLE system_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- Initial row: ('password_policy', '{...}', NOW())
```

---

## Summary

| Decision | Choice | Key Rationale |
|----------|--------|---------------|
| IP check | CIDR middleware | Reject before bcrypt, no CPU waste |
| CAPTCHA | Self-hosted math | No external dependency, works offline |
| Password history | bcrypt hashes | One-way, safe if table compromised |
| Notifications | In-app only | No SMTP dependency |
| Policy storage | Single-row config table | Simple, no UI complexity for per-user policies |
| Empty whitelist | Allow all | Backward compatible |
