# API Contracts: Email MFA Verification

**Feature**: 003-email-mfa | **Date**: 2026-06-25

## 1. SMTP Configuration

### GET /api/security/smtp-config

Returns SMTP config (password masked). Admin only.

**Response**: `{ "code": 0, "data": { "host": "smtp.qq.com", "port": 587, "secure": false, "user": "...", "from_address": "...", "configured": true } }`

### PUT /api/security/smtp-config

Update SMTP config. Admin only.

**Request**: `{ "host": "...", "port": 587, "secure": false, "user": "...", "password": "...", "from_address": "..." }`

---

## 2. Email MFA Login Flow

### POST /api/auth/login (enhanced)

Same as current, but when user has email MFA enabled, response changes:

**Response** (email MFA): `{ "code": 0, "data": { "require_email_mfa": true, "session_token": "uuid", "email_hint": "ad***@company.com" } }`

### POST /api/auth/mfa/email/verify

Verify email code.

**Request**: `{ "session_token": "uuid", "code": "128456" }`

**Response (success)**: `{ "code": 0, "data": { "token": "jwt...", "user": {...} } }`

**Response (expired)**: `{ "code": 1, "message": "验证码已过期" }`

**Response (wrong)**: `{ "code": 1, "message": "验证码错误，剩余 2 次尝试" }`

**Response (max attempts)**: `{ "code": 1, "message": "验证码尝试次数过多，请重新获取" }`

### POST /api/auth/mfa/email/resend

Request a new code (if previous expired or maxed out). Rate limited.

**Request**: `{ "session_token": "uuid" }`

**Response**: `{ "code": 0, "message": "验证码已重新发送" }`

---

## 3. MFA Method Selection

### GET /api/auth/mfa/methods

Returns available MFA methods and current selection.

**Response**: `{ "code": 0, "data": { "current": "totp", "available": ["totp", "email"] } }`

### PUT /api/auth/mfa/method

Switch MFA method.

**Request**: `{ "method": "email" }`

**Response**: `{ "code": 0, "message": "MFA 方式已切换为邮箱验证码" }`
