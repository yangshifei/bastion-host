# Feature Specification: Bastion Host Platform

**Feature Branch**: `001-bastion-host-platform`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "企业级堡垒机 Web 应用：通过浏览器进行 SSH 终端和 RDP 远程桌面的安全访问，包含资产管理、用户管理（admin/operator/auditor 三种角色）、RBAC 权限控制、授权管理（用户-资产绑定+时效控制）、MFA 多因素认证（TOTP + 恢复码）、SSH 命令审计与危险命令拦截、会话录像与回放、审计日志防篡改（哈希链）、MySQL 数据持久化、Docker Compose 部署"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Onboarding & System Setup (Priority: P1)

An IT administrator deploys the bastion host via Docker Compose, logs in with the default admin account, creates an organizational structure of users and assets, and grants access permissions.

**Why this priority**: Without initial setup, no other functionality is accessible. This is the foundation.

**Independent Test**: Deploy fresh instance → log in as admin → create user → create asset → grant authorization → verify user can connect.

**Acceptance Scenarios**:

1. **Given** a fresh Docker deployment, **When** admin navigates to the login page and enters default credentials, **Then** admin is authenticated and redirected to the dashboard.
2. **Given** admin is logged in, **When** admin creates a new user with username, password, and role, **Then** the user appears in the user list and can log in.
3. **Given** admin is logged in, **When** admin adds an SSH asset with host, port, and credentials, **Then** the asset is stored with encrypted credentials and appears in the asset list.
4. **Given** admin is logged in and both a user and asset exist, **When** admin creates an authorization linking user to asset with optional time window, **Then** that user can connect to that asset within the authorized period.

---

### User Story 2 - Operator Remote Access via Browser (Priority: P1)

An operator opens a browser, logs in (with optional MFA), selects an authorized asset, and establishes an SSH terminal session or RDP desktop session entirely within the browser — no client software required.

**Why this priority**: This is the core value proposition. Operators must be able to do their jobs.

**Independent Test**: Log in as operator → navigate to SSH terminal → select authorized asset → run commands → session recorded → disconnect.

**Acceptance Scenarios**:

1. **Given** an operator with MFA disabled, **When** they enter valid credentials, **Then** they receive a JWT and are redirected to the dashboard.
2. **Given** an operator with MFA enabled, **When** they complete password login, **Then** they are prompted for TOTP code; upon correct code, they receive a JWT.
3. **Given** an authenticated operator with active authorization, **When** they select an SSH asset and click connect, **Then** a WebSocket-based terminal opens in the browser with full input/output.
4. **Given** an authenticated operator with active authorization, **When** they select an RDP asset and click connect, **Then** the remote Windows desktop renders in the browser via the Guacamole protocol.
5. **Given** an active SSH session, **When** the operator types commands, **Then** all commands are logged with timestamps for audit purposes.
6. **Given** an active session, **When** the operator closes the browser or clicks disconnect, **Then** the session is properly terminated, duration recorded, and any session recording saved.

---

### User Story 3 - Auditor Compliance Review (Priority: P2)

A security auditor logs in, browses audit logs with filtering by user/action/date, views session recordings, and exports audit data for external compliance reporting.

**Why this priority**: Compliance is a key value of a bastion host; without audit trails the system fails its security purpose.

**Independent Test**: Log in as auditor → navigate to audit log → filter by date range and action type → expand a record to view detail → export CSV → view session recording.

**Acceptance Scenarios**:

1. **Given** an auditor is logged in, **When** they navigate to the audit log page, **Then** they see a paginated list of all system operations with user, action, target, IP, and timestamp.
2. **Given** the audit log page, **When** auditor filters by date range and action type, **Then** results update to show only matching records.
3. **Given** an audit log entry with detail data, **When** auditor expands the row, **Then** they see a JSON diff showing what changed.
4. **Given** auditor selects the export option, **When** they click export, **Then** a CSV file downloads with the filtered audit data.
5. **Given** a recorded SSH session exists, **When** auditor navigates to session replay, **Then** they can play back the terminal session with speed controls (1x/2x/4x/8x).

---

### User Story 4 - Account Security & MFA Management (Priority: P2)

Any user can view their profile, change their password, and optionally set up TOTP-based MFA. The system enforces password complexity and account lockout policies.

**Why this priority**: Account security is essential for a security gateway; MFA and password policies protect against credential compromise.

**Independent Test**: Log in as any user → navigate to profile → change password → log out → verify old password fails and new password works → set up MFA → verify MFA challenge on next login.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they navigate to profile settings and change their password (providing current + new), **Then** the password is updated and they must use the new password on next login.
2. **Given** a user with MFA disabled, **When** they initiate MFA setup, **Then** they see a QR code to scan with their authenticator app, and upon entering a valid TOTP code, MFA is enabled with recovery codes displayed.
3. **Given** a user with MFA enabled, **When** they enter an incorrect TOTP code during login, **Then** access is denied and the failed attempt is logged.
4. **Given** a user with MFA enabled who lost their device, **When** they use a recovery code during login, **Then** they gain access and the used recovery code is invalidated.
5. **Given** 5 consecutive failed login attempts, **When** the user tries again, **Then** the account is locked for 15 minutes and the lockout is logged.

---

### User Story 5 - Dangerous Command Detection & Session Monitoring (Priority: P3)

The system detects dangerous commands (e.g., `rm -rf /`, `DROP TABLE`) in real-time during SSH sessions, blocks or warns based on severity, and administrators can view and terminate active sessions.

**Why this priority**: This adds proactive protection beyond passive auditing, reducing the risk of accidental or malicious damage.

**Independent Test**: Connect via SSH → type `rm -rf /` → verify command is blocked → check audit log for dangerous command record → admin views active sessions and can terminate one.

**Acceptance Scenarios**:

1. **Given** an active SSH session, **When** the user types a critical-level dangerous command, **Then** the command is blocked, a warning is displayed, and the event is logged.
2. **Given** an admin viewing active sessions, **When** they click terminate on a session, **Then** the session is forcibly closed and the termination is logged.
3. **Given** a medium-risk command, **When** the user types it, **Then** a confirmation prompt appears before execution proceeds.

---

### User Story 6 - Dark/Light Theme Toggle (Priority: P3)

Any user can switch between dark and light visual themes for comfortable viewing in different lighting environments, with their preference persisted across sessions.

**Why this priority**: Quality-of-life feature that improves user experience but does not affect core functionality.

**Independent Test**: Click theme toggle button → verify UI switches color scheme → refresh page → verify preference persists.

**Acceptance Scenarios**:

1. **Given** the default dark theme, **When** user clicks the theme toggle button, **Then** the entire interface switches to light mode with appropriate colors.
2. **Given** the user has selected light theme, **When** they close and reopen the browser, **Then** the light theme is restored from saved preferences.

---

### Edge Cases

- What happens when an SSH/RDP target is unreachable? The system must display a clear error message and log the failure.
- What happens when a user's authorization expires mid-session? The system must allow the current session to continue but prevent new connections.
- What happens when the database connection is lost? The system must retry with exponential backoff and return 503 during outage.
- What happens when an MFA recovery code is used? It must be consumed (one-time use) and the user alerted.
- What happens when guacd (RDP daemon) is unreachable? RDP connections must fail gracefully with a clear message.
- What happens with concurrent sessions exceeding the 5-per-user limit? The sixth attempt must be rejected with a clear message.
- What happens when a session exceeds the 8-hour maximum duration? It must be automatically terminated with a timeout reason logged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users via username + password with bcrypt-hashed credentials.
- **FR-002**: System MUST support optional TOTP-based MFA with recovery codes for all users.
- **FR-003**: System MUST provide three role types: admin (full control), operator (connect with authorization), and auditor (read-only audit access).
- **FR-004**: System MUST allow admin users to create, read, update, and delete (soft-delete) assets with SSH or RDP protocol types.
- **FR-005**: System MUST encrypt asset credentials (passwords, SSH private keys) at rest using AES-256-CBC with a configurable encryption key.
- **FR-006**: System MUST allow admin users to create, read, update, and delete (soft-delete) users with role assignment.
- **FR-007**: System MUST allow admin users to create and delete authorizations linking users to assets with optional time-bound validity (start/end time).
- **FR-008**: Non-admin users MUST only see assets for which they have an active authorization.
- **FR-009**: System MUST provide browser-based SSH terminal access via WebSocket proxy that forwards user input to the target server and streams output back.
- **FR-010**: System MUST provide browser-based RDP desktop access via the Apache Guacamole protocol (guacd daemon + guacamole-lite bridge).
- **FR-011**: System MUST log every login attempt (success and all failure modes) with username, IP, user agent, and timestamp.
- **FR-012**: System MUST log every state-changing operation (create/update/delete) with the user, action, target type/ID, detail JSON diff, IP, and timestamp.
- **FR-013**: System MUST detect dangerous SSH commands in real-time using configurable regex patterns and block or warn based on severity level (critical/high/medium/low).
- **FR-014**: System MUST record SSH terminal sessions in asciicast v2 format for playback.
- **FR-015**: System MUST provide session replay with play/pause and speed controls (1x/2x/4x/8x).
- **FR-016**: System MUST lock accounts after 5 consecutive failed login attempts for a configurable duration (default 15 minutes).
- **FR-017**: System MUST enforce session limits: 15-minute idle timeout, 8-hour maximum duration, 5 concurrent sessions per user.
- **FR-018**: System MUST provide a dashboard with summary statistics (total assets, users, active sessions, today's sessions, dangerous command count) and recent session list.
- **FR-019**: System MUST support Docker Compose deployment with MySQL, guacd, application server, and nginx reverse proxy.
- **FR-020**: System MUST provide health check endpoints (/health and /ready) reporting component status.
- **FR-021**: System MUST support graceful shutdown: stop accepting connections → drain active sessions → close database pool → exit.
- **FR-022**: System MUST export audit logs to CSV format for compliance reporting.
- **FR-023**: System MUST support light and dark visual themes with user preference persistence.
- **FR-024**: System MUST enforce rate limiting on login endpoint (max 5 req/min/IP) and general API (max 60 req/min/IP).
- **FR-025**: System MUST validate all API inputs and return structured error responses for invalid requests.

### Key Entities

- **User**: Represents a person with credentials (username, bcrypt-hashed password, optional TOTP secret, MFA state) and a role (admin/operator/auditor). Has login tracking (fail count, lockout state, last login).
- **Asset**: Represents a remote server accessible via SSH or RDP. Has host, port, protocol, optional credentials (AES-encrypted), group name, description, and status.
- **Authorization**: Links a user to an asset with optional validity window (start_time, end_time). Records who granted the authorization.
- **Session**: Represents an active or closed remote connection. Tracks user, asset, protocol, start/end time with millisecond precision, duration, status, client IP, termination cause, and optional recording path.
- **AuditLog**: Immutable record of an operation. Contains user, action (login/create/update/delete/connect/disconnect), target type/ID, detail JSON with before/after values, IP, and timestamp.
- **CommandLog**: Record of a command executed in an SSH session. Contains session reference, timestamp for replay, command text, dangerous flag, blocked flag, and risk level.
- **LoginLog**: Record of a login attempt. Contains username, IP, user agent, result (success/fail modes), MFA usage flag, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can complete initial deployment and setup (create first user + asset + authorization) in under 10 minutes.
- **SC-002**: An operator can establish an SSH terminal session in under 5 seconds from clicking "connect" to seeing the shell prompt.
- **SC-003**: An operator can establish an RDP desktop session and see the remote desktop in under 15 seconds.
- **SC-004**: 100% of login attempts (success and failure) are logged with complete metadata.
- **SC-005**: 100% of state-changing operations produce an audit log entry with full detail.
- **SC-006**: Critical-level dangerous commands are blocked with 100% detection rate (no false negatives for configured patterns).
- **SC-007**: The system supports at least 5 concurrent SSH sessions and 2 concurrent RDP sessions on a standard 4GB RAM server.
- **SC-008**: Session recordings are playable with no more than 2 seconds of seek latency.
- **SC-009**: Account lockout triggers after exactly 5 consecutive failures and unlocks after the configured duration.
- **SC-010**: Theme preference persists across browser sessions (survives page refresh and re-login).

## Assumptions

- Target users are IT operations staff and security auditors with basic computer literacy.
- Browser requirements: modern Chrome, Firefox, Edge (last 2 versions). Mobile browsers are out of scope for v1.
- The deployment environment has Docker and Docker Compose available.
- The bastion host server has network connectivity to managed assets (SSH port 22 and RDP port 3389).
- Users will use Google Authenticator, Authy, or compatible TOTP apps for MFA.
- AES encryption keys and JWT secrets are provided via environment variables at deployment time and rotated manually.
- Session recording files are stored on local disk; cloud storage/archiving is out of scope for v1.
- GUI-based command execution (e.g., via RDP) is not subject to dangerous command detection — only text-based SSH commands are scanned.
- Concurrent session limits apply globally per user, not per asset.
- English and Chinese (简体中文) are the supported UI languages.
