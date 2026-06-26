# Feature Specification: Email MFA Verification

**Feature Branch**: `003-email-mfa`

**Created**: 2026-06-25

**Status**: Draft

**Input**: User description: "多因素认证还有那些方式 → 加个邮件验证码"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email MFA Setup (Priority: P1)

A user enables email-based MFA as a simpler alternative to TOTP. After entering their email address, the system sends a test verification code to confirm the email works. The user then chooses email MFA as their default second factor.

**Why this priority**: Email MFA is the simplest second factor — no app installation required, works on any device with email access. It's the most requested MFA option for teams without a TOTP mandate.

**Independent Test**: User opens MFA settings → selects "邮箱验证码" → enters email → receives test code → confirms → email MFA enabled → on next login, receives code via email.

**Acceptance Scenarios**:

1. **Given** a user has an email set in their profile, **When** they enable email MFA, **Then** the system sends a verification code to their email and prompts them to enter it.
2. **Given** a user enters the correct verification code, **When** they confirm, **Then** email MFA is enabled and displayed as the active MFA method.
3. **Given** a user has no email set, **When** they try to enable email MFA, **Then** they are prompted to set an email address first.

---

### User Story 2 - Email Code Login (Priority: P1)

During login, after entering the correct password, the system sends a 6-digit verification code to the user's email. The user enters this code to complete authentication.

**Why this priority**: This is the core login flow. Without it, email MFA has no purpose.

**Independent Test**: Login with credentials → system sends email with code → user enters code → authenticated.

**Acceptance Scenarios**:

1. **Given** a user with email MFA enabled, **When** they enter the correct password, **Then** the system sends a 6-digit code to their registered email and shows the code input screen.
2. **Given** the user enters the correct code within 5 minutes, **When** they submit, **Then** they are authenticated and redirected to the dashboard.
3. **Given** the user enters an incorrect code, **When** they submit, **Then** the system shows an error and allows retry (up to 3 attempts).
4. **Given** the code has expired (5 minutes), **When** the user submits, **Then** they see "验证码已过期" and can request a new one.

---

### User Story 3 - MFA Method Selection (Priority: P2)

Users can choose between TOTP and email MFA as their preferred second factor. The MFA setup UI clearly explains the tradeoffs of each method.

**Why this priority**: Users need to understand their options and make an informed choice. This is lower priority than the core setup/login flows.

**Independent Test**: Open MFA settings → see both TOTP and Email options → select one → setup flow begins.

**Acceptance Scenarios**:

1. **Given** a user with no MFA enabled, **When** they open MFA settings, **Then** they see two options: "TOTP 验证器应用" and "邮箱验证码", each with a brief description.
2. **Given** a user with TOTP already enabled, **When** they switch to email MFA, **Then** the system disables TOTP, enables email MFA, and invalidates old recovery codes.

---

### Edge Cases

- What happens when the SMTP service is down? Login proceeds to step 1, but the code email fails to send. The system shows "邮件发送失败，请稍后重试或联系管理员" and logs the failure.
- What happens when a user's email bounces? The system logs the bounce; after 3 consecutive bounces, email MFA is auto-disabled and the user is notified on next login.
- What happens when a user requests too many codes? Rate limit: max 3 codes per 15 minutes. Exceeding this shows "验证码请求过于频繁，请 15 分钟后重试".
- What happens when a code is entered incorrectly 3 times? The code is invalidated; user must request a new one.
- What happens for users without an email address? They cannot enable email MFA until they add an email to their profile.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST send a 6-digit numeric verification code to the user's registered email after successful password authentication.
- **FR-002**: System MUST accept only the most recent code for each login session; previous codes are invalidated.
- **FR-003**: Verification codes MUST expire after 5 minutes from issuance.
- **FR-004**: System MUST limit email MFA code requests to 3 per 15 minutes per user.
- **FR-005**: System MUST limit code entry attempts to 3 per code before requiring a new code.
- **FR-006**: Admin MUST be able to configure SMTP settings (host, port, username, password, from address) via the Security Settings page.
- **FR-007**: Users MUST be able to select their preferred MFA method (TOTP or email) from the MFA setup page.
- **FR-008**: Switching MFA methods MUST invalidate existing recovery codes and generate new ones.
- **FR-009**: System MUST log all email MFA events (code sent, code verified, code expired, code failed) to the audit trail.
- **FR-010**: System MUST display the partially masked email address (e.g., `ad***@company.com`) on the code entry screen so users know where the code was sent.

### Key Entities

- **SmtpConfig**: SMTP server settings — host, port, secure (TLS), username, password, from_address, from_name. Stored in system_config table.
- **EmailMfaCode**: Transient record — user_id, code_hash (bcrypt), email, expires_at, attempts, session_token. Auto-deleted after expiry or successful use.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Email verification code arrives in the user's inbox within 10 seconds of password authentication (under normal SMTP conditions).
- **SC-002**: Users can complete email MFA setup (from opening MFA settings to enabled) in under 2 minutes.
- **SC-003**: 100% of email MFA events are recorded in the audit log.
- **SC-004**: Code rate limiting prevents abuse: users cannot request more than 3 codes in 15 minutes.

## Assumptions

- The deployment environment has access to an SMTP server (self-hosted or third-party like QQ/163/Gmail SMTP).
- Email delivery time depends on the SMTP provider and is not controlled by the bastion host.
- Users have access to their registered email inbox during login (same device or nearby device).
- SMTP configuration is managed by the admin, not individual users.
- Email MFA and TOTP MFA are mutually exclusive — only one can be active at a time.
- HTML email formatting is out of scope for v1; plain-text emails are sufficient.
