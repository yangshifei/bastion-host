# Data Model: Email MFA Verification

**Feature**: 003-email-mfa | **Date**: 2026-06-25

## New Entity: EmailMfaCode

Transient record for email verification codes. Auto-cleaned after use or expiry.

| Field | Type | Description |
|-------|------|-------------|
| id | INT PK | Auto-increment |
| user_id | INT FK → users.id | The user this code was issued to |
| code_hash | VARCHAR(255) | bcrypt hash of the 6-digit code |
| email | VARCHAR(128) | Email address the code was sent to |
| expires_at | DATETIME | Code validity deadline (created_at + 5 min) |
| attempts | INT (default 0) | Number of incorrect attempts (max 3) |
| session_token | VARCHAR(128) UNIQUE | UUID linking code to login session |
| created_at | DATETIME | When the code was issued |

## New Entity: SmtpConfig

Stored as JSON in `system_config` table under key `smtp_config`.

| Field | Type | Description |
|-------|------|-------------|
| host | string | SMTP server hostname |
| port | number | SMTP port (25, 465, 587) |
| secure | boolean | Use TLS (true for 465, false for 587) |
| user | string | SMTP auth username |
| password | string | SMTP auth password (AES-encrypted at rest) |
| from_address | string | Sender email address |
| from_name | string | Sender display name |

## Modified Entity: User

Add `mfa_method` column to track preferred MFA type.

| Field | Type | Description |
|-------|------|-------------|
| mfa_method | ENUM('totp','email') DEFAULT NULL | Active MFA method; NULL = no MFA |

## State Transitions

```
MFA Method Selection:
  totp → (user switches) → email
  email → (user switches) → totp
  Switching invalidates recovery codes → regenerates

Email Code Lifecycle:
  Created → (correct code) → Consumed
  Created → (3 wrong attempts) → Invalidated
  Created → (5 min elapsed) → Expired
  Created → (new code requested) → Invalidated (replaced)
```

## Relationships

```
User (1) ──→ (N) EmailMfaCode   (one user can have multiple codes over time)
User (1) ──→ (1) SmtpConfig     (global config, not per-user)
```
