# API Contracts: Login Security Enhancement

**Feature**: 002-login-security | **Date**: 2026-06-25

## 1. Password Policy API

### GET /api/security/password-policy

Returns current password policy configuration. Admin only.

**Response**:
```json
{
  "code": 0,
  "data": {
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
}
```

### PUT /api/security/password-policy

Update password policy. Admin only.

**Request**:
```json
{
  "min_length": 10,
  "require_special": true
}
```

**Validation**: `min_length` 8-64, `expire_days` 0-365, `history_count` 0-20, `captcha_threshold` 1-10, `lockout_threshold` 5-20, `lockout_minutes` 5-1440

---

## 2. IP Whitelist API

### GET /api/security/ip-whitelist

List all whitelist entries. Admin only.

**Response**:
```json
{
  "code": 0,
  "data": [
    { "id": 1, "network": "10.0.0.0", "mask": 8, "description": "内网", "enabled": true },
    { "id": 2, "network": "172.16.0.0", "mask": 12, "description": "VPN", "enabled": true }
  ]
}
```

### POST /api/security/ip-whitelist

Add whitelist entry. Admin only.

**Request**:
```json
{ "network": "192.168.0.0", "mask": 16, "description": "办公网" }
```

### DELETE /api/security/ip-whitelist/:id

Delete entry. Admin only.

### PATCH /api/security/ip-whitelist/:id

Toggle enabled/disabled. Admin only.

**Request**: `{ "enabled": false }`

---

## 3. User IP Binding API

### GET /api/users/:id/ip-binding

Get per-user IP binding. Admin only.

**Response**: `{ "code": 0, "data": { "ip_address": "192.168.1.100", "description": "办公室" } }` or `null`

### PUT /api/users/:id/ip-binding

Set per-user IP binding. Admin only.

**Request**: `{ "ip_address": "192.168.1.100", "description": "办公室" }`

### DELETE /api/users/:id/ip-binding

Remove binding. Admin only.

---

## 4. CAPTCHA API

### GET /api/auth/captcha

Generate CAPTCHA challenge. No auth required.

**Response**:
```json
{
  "code": 0,
  "data": {
    "challenge_id": "uuid-v4",
    "question": "3 + 7 = ?",
    "expires_in": 300
  }
}
```

### POST /api/auth/captcha/verify

Verify CAPTCHA answer. No auth required.

**Request**: `{ "challenge_id": "uuid", "answer": "10" }`

**Response**: `{ "code": 0, "data": { "valid": true } }`

---

## 5. Notification API

### GET /api/notifications

List user's notifications. Authenticated user (own notifications only).

**Query**: `?unread_only=true&limit=20`

**Response**:
```json
{
  "code": 0,
  "data": {
    "list": [
      { "id": 1, "type": "new_ip_login", "ip": "203.0.113.5", "detail": {}, "read": false, "created_at": "2026-06-25 10:30:00" }
    ],
    "unread_count": 3
  }
}
```

### GET /api/notifications/unread-count

Return unread count only. Used for header badge.

**Response**: `{ "code": 0, "data": { "count": 3 } }`

### POST /api/notifications/mark-read

Mark notifications as read.

**Request**: `{ "ids": [1, 2, 3] }` or `{ "all": true }`

---

## 6. Enhanced Login

### POST /api/auth/login (enhanced)

Existing endpoint with new capabilities:

**New request fields**: `{ "username": "...", "password": "...", "captcha_id": "...", "captcha_answer": "..." }` (CAPTCHA fields optional)

**New response fields on password-expired**: `{ "code": 1, "message": "密码已过期，请修改密码", "data": { "require_password_change": true } }`

**New response on IP rejected**: `{ "code": 1, "message": "此 IP 地址不在允许范围内" }` — returns 401, no credential check performed.

### POST /api/auth/change-password (enhanced)

Existing endpoint. Now validates against password policy and checks history.

**New error responses**:
- `{ "code": 1, "message": "密码不满足复杂度要求: 需要包含大写字母" }`
- `{ "code": 1, "message": "不能使用最近使用过的密码" }`
