# Feature Specification: Login Security Enhancement

**Feature Branch**: `002-login-security`

**Created**: 2026-06-25

**Status**: Draft

**Input**: User description: "系统登录安全方案"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Password Policy Enforcement (Priority: P1)

Administrators configure password policies (minimum length, complexity, expiration period, history count), and the system enforces these policies for all users during login and password changes.

**Why this priority**: Password-based attacks are the most common threat vector. Strong password policies are the first line of defense and are required by most security compliance frameworks (ISO 27001, SOC 2, etc.).

**Independent Test**: Admin configures password policy → operator tries to set a weak password → rejected with clear guidance → operator sets compliant password → accepted.

**Acceptance Scenarios**:

1. **Given** admin has configured password policy (min 8 chars, require upper+lower+digit, expire after 90 days), **When** a user sets a password that does not meet the policy, **Then** the system rejects it with a specific message indicating which rule was violated.
2. **Given** a user's password has expired (90 days since last change), **When** the user logs in with correct credentials, **Then** they are redirected to a forced password change page before accessing the system.
3. **Given** a user has used password "Abc@12345", **When** they try to reuse the same password, **Then** the system rejects it with message "不能使用最近使用过的密码".
4. **Given** a new user is created by admin, **When** the user logs in for the first time, **Then** they must change their temporary password before accessing any other page.

---

### User Story 2 - IP Access Control (Priority: P1)

Administrators define IP whitelist rules (CIDR ranges or specific IPs). Login attempts from unauthorized IP ranges are rejected with a clear message, regardless of credential correctness. Each user can optionally have a per-user IP binding.

**Why this priority**: For a bastion host, network-level access control is critical. Restricting login to known office networks or VPN ranges dramatically reduces the attack surface from internet-based brute force attacks.

**Independent Test**: Admin adds whitelist IP range → user from whitelisted IP logs in successfully → attacker from non-whitelisted IP tries to log in → rejected with "IP 未授权" message → event logged.

**Acceptance Scenarios**:

1. **Given** admin has configured global IP whitelist `10.0.0.0/8`, **When** a user attempts login from IP `10.1.2.3`, **Then** login proceeds to credential check.
2. **Given** admin has configured global IP whitelist `10.0.0.0/8`, **When** a user attempts login from IP `203.0.113.5`, **Then** login is immediately rejected with "此 IP 地址不在允许范围内", without checking credentials.
3. **Given** a specific user is bound to IP `192.168.1.100`, **When** that user attempts login from `192.168.1.200`, **Then** login is rejected even if the global whitelist allows it.
4. **Given** no IP whitelist is configured, **When** any user attempts login from any IP, **Then** the system behaves as before (no IP restriction).

---

### User Story 3 - Brute Force Protection Enhancement (Priority: P2)

When multiple failed login attempts occur from the same IP or against the same account, the system progressively increases the lockout delay and presents a CAPTCHA challenge after a configurable threshold. Users receive optional email notifications about suspicious login activity.

**Why this priority**: Current lockout after 5 failures is a blunt instrument. Progressive delay + CAPTCHA provides smarter protection against automated attacks without completely locking legitimate users who may have forgotten their password.

**Independent Test**: Simulate 3 failed logins → 4th attempt shows CAPTCHA → solve CAPTCHA → login proceeds → simulate 5 more failures → account locks with CAPTCHA bypass disabled.

**Acceptance Scenarios**:

1. **Given** a user enters wrong password 3 times, **When** they attempt a 4th time, **Then** a CAPTCHA challenge is presented alongside the password field.
2. **Given** CAPTCHA is correctly solved, **When** the user enters the correct password, **Then** login succeeds and the failure counter resets.
3. **Given** 5 consecutive failures with CAPTCHA solved each time, **When** the 6th attempt occurs, **Then** the account is locked for 15 minutes; CAPTCHA bypass is disabled.
4. **Given** account lockout occurs, **When** the lockout period expires, **Then** the user can attempt login again, starting fresh with a clean failure counter.

---

### User Story 4 - Security Event Notification (Priority: P3)

Users receive notifications (in-app and optionally email) when security-significant events occur on their account: successful login from new IP/location, failed login attempt, password change, MFA change, account lockout.

**Why this priority**: Timely awareness of account activity allows users to detect and report unauthorized access quickly. This is a detective control that complements the preventive controls above.

**Independent Test**: User logs in from a new IP → receives in-app notification "新设备登录提醒" → checks notification center → sees details (IP, time, location).

**Acceptance Scenarios**:

1. **Given** a user has logged in from IP `A` multiple times before, **When** they log in from IP `B` for the first time, **Then** an in-app notification appears: "检测到来自新 IP 地址 (B) 的登录" with timestamp.
2. **Given** a failed login attempt occurs on an account, **When** the user next logs in successfully, **Then** they see a notification: "上次登录失败 X 次" with timestamps.
3. **Given** admin is viewing the dashboard, **When** a security event (account lockout, multiple failed logins) occurs, **Then** the admin sees a highlighted alert on the dashboard.

---

### Edge Cases

- What happens when IP whitelist is empty? System defaults to no IP restriction (backward compatible).
- What happens when a user's password expires while they have an active session? Active session continues; force change on next login.
- What happens when CAPTCHA service is unavailable? Fall back to standard lockout after 5 failures (current behavior).
- What happens when a password history table grows too large? Keep only last N entries per user (configurable, default 5).
- What happens when forced password change page is accessed directly via URL? Redirect to login.
- What happens when concurrent CAPTCHA challenges are requested? Each challenge is single-use with a 5-minute expiry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce configurable password complexity: minimum length (default 8), require uppercase, lowercase, digit, and special character options.
- **FR-002**: System MUST support configurable password expiration (default 90 days) with forced change on next login after expiry.
- **FR-003**: System MUST retain the last N passwords per user (configurable, default 5) and prevent reuse.
- **FR-004**: System MUST force newly created users to change their password on first login.
- **FR-005**: System MUST support IP whitelist configuration at global level (applies to all users) using CIDR notation.
- **FR-006**: System MUST support per-user IP binding as an optional additional restriction on top of global whitelist.
- **FR-007**: System MUST present a CAPTCHA challenge after M consecutive failed login attempts (configurable, default 3).
- **FR-008**: System MUST lock the account after N total failed attempts (configurable, default 10) for a configurable duration (default 15 minutes).
- **FR-009**: System MUST create an in-app notification when a login occurs from a previously unseen IP address for that user.
- **FR-010**: System MUST create an in-app notification when an account is locked due to failed attempts.
- **FR-011**: System MUST log all security-related events (password change, lockout, CAPTCHA challenge, IP rejection) to the audit trail.
- **FR-012**: System MUST display a notification center accessible from the header, showing unread security alerts with a badge count.

### Key Entities

- **PasswordPolicy**: System-wide configuration for password rules — min_length, require_upper, require_lower, require_digit, require_special, expire_days, history_count, force_change_on_create.
- **PasswordHistory**: Per-user record of previously used password hashes. Limited to N entries. Used to prevent reuse.
- **IpWhitelist**: System-wide list of allowed CIDR ranges for login. Stored as configuration.
- **UserIpBinding**: Per-user optional IP restriction. Overrides/intersects with global whitelist.
- **LoginNotification**: Record of a security event for a user — type (new_ip, failed_login, lockout, password_changed), IP, timestamp, read_status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users attempting to set a weak password receive specific, actionable feedback within 1 second of submission.
- **SC-002**: Login from a non-whitelisted IP is rejected in under 500ms (no credential check overhead).
- **SC-003**: CAPTCHA challenge adds no more than 3 seconds to a legitimate login flow.
- **SC-004**: 100% of security events (lockout, IP rejection, password change) are recorded in the audit log.
- **SC-005**: New IP login notifications appear in the notification center within 5 seconds of successful login.
- **SC-006**: Password history enforcement prevents reuse with 100% accuracy (no false accepts).

## Assumptions

- CAPTCHA service will use an established third-party provider (e.g., hCaptcha, reCAPTCHA) or a simple self-hosted math/text challenge.
- IP whitelist supports IPv4 CIDR notation. IPv6 is out of scope for v1.
- Email notifications for security events are out of scope for v1; in-app notifications only.
- Password expiration is based on absolute calendar days, not active usage days.
- The notification center is accessible from the header and shows unread count badge.
- Existing users created before this feature will not be forced to change passwords retroactively; only new users and password-expired users are affected.
- IP geolocation for "new location" detection uses a simple IP-to-geo mapping (city-level accuracy is sufficient).
