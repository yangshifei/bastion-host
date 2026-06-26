# Research: Email MFA Verification

**Feature**: 003-email-mfa | **Date**: 2026-06-25

## 1. SMTP Library

### Decision: nodemailer

**Rationale**: nodemailer is the de-facto standard for sending email in Node.js. Zero dependencies, well-maintained, supports all major SMTP providers. Used by millions of projects including many enterprise applications.

**Alternatives considered**:
- *sendgrid/mailgun SDKs*: Rejected — vendor lock-in; bastion host should work with any SMTP server
- *Node.js built-in net.SMTP*: Rejected — too low-level, would require implementing MIME encoding manually

## 2. Code Storage

### Decision: MySQL table with bcrypt-hashed codes

**Rationale**: Codes should be stored securely, not in plaintext. Use bcrypt (already in project) to hash codes before storage. Compare using bcrypt.compare().

```sql
CREATE TABLE email_mfa_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  email VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  session_token VARCHAR(128) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session (session_token)
);
```

**Cleanup**: Cron job (or on-query cleanup) deletes expired codes. Keep for max 10 minutes after expiry for audit.

**Alternatives considered**:
- *Redis/memory store*: Faster but adds infrastructure dependency; bastion host uses MySQL only
- *JWT-based codes*: Stateless but can't invalidate individual codes; stored approach lets us track attempts

## 3. SMTP Configuration Storage

### Decision: system_config table (same as password_policy)

Store as JSON under key `smtp_config`:

```json
{
  "host": "smtp.qq.com",
  "port": 587,
  "secure": false,
  "user": "bastion@qq.com",
  "password": "encrypted_or_plain",
  "from_address": "bastion@company.com",
  "from_name": "堡垒机安全验证"
}
```

**Rationale**: Same pattern as password_policy. Admin configures via Security Settings page. SMTP password stored encrypted (AES-256, same as asset credentials).

## 4. Rate Limiting

### Decision: 3 codes per 15 minutes per user, 3 attempts per code

Track in `email_mfa_codes` table + existing `login_fails` counter.

**Implementation**:
- Count codes issued to user in last 15 minutes → reject if >= 3
- Count attempts on current code → reject if >= 3, invalidate code

## 5. Email Template

### Decision: Plain-text email with Chinese content

```
主题: 堡垒机登录验证码

您的登录验证码是: 128456

此验证码 5 分钟内有效，请勿转发给他人。

如非本人操作，请忽略此邮件并联系管理员。
```

**Alternatives considered**:
- *HTML email*: Nicer but unnecessary for a 6-digit code; plain text works everywhere
- *i18n*: Out of scope for v1; Chinese-only

## Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SMTP library | nodemailer | Standard, zero-deps |
| Code storage | MySQL + bcrypt | Secure, no new infra |
| SMTP config | system_config JSON | Same pattern as password_policy |
| Rate limit | 3/15min per user | Prevents abuse |
| Email format | Plain text | Simplest, works everywhere |
