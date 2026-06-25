# Data Model: Login Security Enhancement

**Feature**: 002-login-security | **Date**: 2026-06-25

## Entity Relationship

```
users (existing, enhanced)
  ├── 1:N → password_history
  ├── 1:1 → user_ip_bindings
  └── 1:N → login_notifications

system_config (new)
  └── 'password_policy' row

ip_whitelist (new, standalone)
```

## Entities

### users (enhanced)

| Column | Type | Description |
|--------|------|-------------|
| `password_changed_at` | DATETIME | When password was last changed. NULL for never-changed users |
| `must_change_password` | TINYINT(1) | Force password change on next login. Default 0 |
| `known_ips` | JSON | Array of previously seen IPs, e.g. `["10.0.1.5","192.168.1.100"]`. Max 20 entries |

### password_history (new)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | — |
| `user_id` | INT FK→users | — |
| `password_hash` | VARCHAR(255) | bcrypt hash of previous password |
| `created_at` | DATETIME | When this password was set |

**Constraints**: Max N rows per user (configurable `history_count`, default 5). Oldest entry deleted when exceeding limit.

### ip_whitelist (new)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | — |
| `network` | VARCHAR(45) | CIDR network, e.g. `10.0.0.0` |
| `mask` | INT | CIDR prefix length, e.g. `8` |
| `description` | VARCHAR(255) | Human-readable label |
| `enabled` | TINYINT(1) | 0=disabled, 1=enabled. Default 1 |

### user_ip_bindings (new)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | — |
| `user_id` | INT FK→users UNIQUE | One binding per user |
| `ip_address` | VARCHAR(45) | IP or CIDR bound to this user |
| `description` | VARCHAR(255) | Label |

### login_notifications (new)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | — |
| `user_id` | INT FK→users | — |
| `type` | ENUM | `new_ip_login`, `failed_login`, `account_locked`, `password_changed` |
| `ip` | VARCHAR(45) | Source IP |
| `detail` | JSON | Event-specific data |
| `read` | TINYINT(1) | 0=unread, 1=read. Default 0 |
| `created_at` | DATETIME | Event timestamp |

### system_config (new)

| Column | Type | Description |
|--------|------|-------------|
| `config_key` | VARCHAR(64) PK | e.g. `password_policy` |
| `config_value` | JSON | Policy object |
| `updated_at` | DATETIME | Last modification |

**password_policy config_value schema**:
```json
{
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
}
```

## State Transitions

### User password lifecycle

```
Create user (must_change_password=true)
  → Login → ForcePasswordChange page
    → Set new password → must_change_password=false, password_changed_at=NOW()
      → Normal access

Normal user (password valid)
  → password_changed_at + expire_days < NOW()
    → Login → ForcePasswordChange page

Password change
  → old hash inserted into password_history
  → if history rows > history_count → delete oldest
```

### Login attempt flow

```
Login request
  → IP check (middleware)
    ├─ Global whitelist exists and IP not in range → 401 "IP 未授权"
    ├─ User IP binding exists and IP mismatch → 401 "IP 不匹配"
    └─ IP allowed → continue
  → Credential check
    ├─ Wrong → increment fail_count
    │   ├─ fail_count < captcha_threshold → 401, return remaining attempts
    │   ├─ fail_count >= captcha_threshold → 401, require CAPTCHA on next attempt
    │   └─ fail_count >= lockout_threshold → lock account, create notification
    └─ Correct
      ├─ Check must_change_password → redirect to ForcePasswordChange
      ├─ Check password expired → redirect to ForcePasswordChange
      ├─ Check known_ips for new IP → create new_ip_login notification
      └─ Success → JWT issued
```
