<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0 (initial constitution)
Modified principles: N/A (first version)
Added sections: All (Core Principles, Security Requirements, Development Workflow, Governance)
Removed sections: None
Templates requiring updates:
  ✅ .specify/templates/constitution-template.md (no changes needed — template)
  ⚠ .specify/templates/plan-template.md (pending — verify alignment with Security Requirements)
  ⚠ .specify/templates/spec-template.md (pending — verify mandatory sections)
  ⚠ .specify/templates/tasks-template.md (pending — verify task categorization)
  ⚠ .specify/templates/checklist-template.md (pending — verify coverage)
Follow-up TODOs: None — all placeholders resolved
-->

# Bastion Host (堡垒机) Constitution

## Core Principles

### I. Security-First (NON-NEGOTIABLE)

All features MUST prioritize security over convenience. This project is a bastion host — a
security-critical gateway between users and production infrastructure. Every design decision
starts from the threat model.

- Credentials MUST be encrypted at rest (AES-256-CBC) with keys injected via environment
  variables, never committed to source control.
- Authentication MUST use bcrypt-hashed passwords + JWT with minimum 32-byte secrets.
- MFA (TOTP) MUST be supported and encouraged for all accounts.
- All login attempts MUST be logged; accounts MUST lock after 5 consecutive failures.
- API endpoints MUST enforce rate limiting, input validation (Zod), and RBAC.
- WebSocket connections MUST authenticate via JWT before any data exchange.
- Audit logs MUST form a tamper-evident chain (SHA-256 hash linking).

**Rationale**: A compromised bastion host grants access to all managed infrastructure.
Security failures are catastrophic and irreversible.

### II. Browser-Native Remote Access

The bastion host MUST provide SSH and RDP access entirely through the browser with zero
client-side installation.

- SSH terminals MUST use xterm.js with WebSocket-proxied ssh2 connections.
- RDP desktops MUST use the Apache Guacamole protocol (guacd + guacamole-lite bridge).
- All terminal sessions MUST be proxied through the server; no direct client-to-target
  connections.
- Session recording (asciicast v2 for SSH, Guacamole native for RDP) MUST be enabled by
  default and retained per data retention policy.

**Rationale**: Browser-native access eliminates client-side attack surface, simplifies
audit compliance, and enables access from restricted environments.

### III. Role-Based Access Control

Every operation MUST be authorized against the user's role and explicit asset authorization.

- Three roles: `admin` (full control), `operator` (connect with authorization), `auditor`
  (read-only audit access).
- Asset access for non-admin users MUST require an active authorization record with
  optional time-bound validity.
- Admin bypasses authorization checks but all actions are audited.
- Role checks MUST happen at the middleware layer, not in individual route handlers.
- The principle of least privilege MUST guide all role capability assignments.

**Rationale**: Defense in depth requires that even authenticated users be constrained to
their authorized scope.

### IV. Audit Integrity

Every operation that affects system state or accesses managed assets MUST produce an
immutable audit record.

- Audit logs MUST capture: who (user), what (action), when (timestamp with ms precision),
  where (IP), and detail (JSON diff of changes).
- Login attempts (success + all failure modes) MUST be logged separately for security
  analysis.
- Command logging MUST detect and flag dangerous commands (rm -rf /, DROP TABLE, etc.)
  in real-time with configurable severity levels.
- Audit logs MUST be retained for ≥365 days; command logs ≥90 days.
- Audit data MUST be exportable (CSV) for external compliance reporting.

**Rationale**: A bastion host is a compliance-critical control point. Complete,
tamper-evident audit trails are required by SOC 2, ISO 27001, and MLPS (等保).

### V. Resilience & Graceful Degradation

The system MUST handle failures gracefully without data loss or security bypass.

- MySQL connection pool MUST use keep-alive and automatic reconnection (max 3 retries).
- WebSocket connections SHOULD support exponential backoff reconnection (1s → 2s → 4s
  → ... → 30s max).
- Graceful shutdown MUST: stop accepting connections, drain active sessions (max 10s),
  close database pool, then exit.
- Health check endpoints (`/health`, `/ready`) MUST report component status.
- Docker-based deployment MUST use health checks with proper dependency ordering
  (depends_on with condition: service_healthy).

**Rationale**: The bastion host is a critical infrastructure component; downtime
directly blocks production access.

## Security Requirements

### Authentication & Session Security

- JWT tokens MUST expire in 2 hours (configurable).
- Password minimum length: 8 characters, MUST contain letters + digits.
- Password expiry: 90 days (configurable).
- Session idle timeout: 15 minutes of inactivity triggers automatic disconnect.
- Maximum session duration: 8 hours (hard limit, configurable).
- Maximum concurrent sessions per user: 5.

### Data Protection

- Asset credentials (passwords, SSH private keys) MUST be AES-256-CBC encrypted before
  database storage.
- Encryption key (ENCRYPTION_SECRET) MUST be ≥32 hex characters and injected via
  environment variable.
- Frontend MUST NOT store sensitive data in localStorage for extended periods; JWT in
  memory preferred when feasible.
- Database connections MUST use prepared statements (mysql2 parameterized queries) to
  prevent SQL injection.

### Network Security

- All external access MUST go through nginx reverse proxy.
- WebSocket Upgrade headers MUST be validated at the proxy layer.
- Rate limiting: login endpoint ≤5 req/min/IP; general API ≤60 req/min/IP.
- Docker containers MUST run on internal networks; only nginx port exposed externally.

## Development Workflow

### Technology Stack (MANDATED)

| Layer      | Technology                                               |
|------------|----------------------------------------------------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, TDesign, Zustand |
| Backend    | Express, TypeScript, ws (WebSocket), ssh2, Zod, Pino     |
| Database   | MySQL 8.0, mysql2 (Promise API, connection pooling)      |
| RDP        | Apache Guacamole (guacd daemon + guacamole-lite bridge)  |
| Auth       | JWT (jsonwebtoken), bcryptjs, speakeasy (TOTP)           |
| Deployment | Docker Compose (MySQL + guacd + bastion + nginx)         |

### Code Quality Gates

- TypeScript strict mode MUST be enabled (`strict: true`).
- All API inputs MUST be validated via Zod schemas before processing.
- New features MUST include audit logging for state-changing operations.
- Frontend components MUST handle loading, empty, and error states.
- Docker builds MUST succeed before merging to main.

### Commit & Branch Conventions

- Feature branches: `feature/<description>` or spec-kit generated (`001-feature-name`).
- Commit messages: conventional commits preferred (`feat:`, `fix:`, `docs:`, `refactor:`).
- Before merging: `docker compose up -d --build` MUST succeed.

## Governance

This constitution defines the non-negotiable principles and constraints for the Bastion
Host project. It supersedes all other development practices and conventions.

**Amendment Process**:
1. Proposed amendments MUST be documented with rationale and impact analysis.
2. Changes to Core Principles require MAJOR version bump.
3. New sections or expanded guidance require MINOR version bump.
4. Clarifications and typo fixes require PATCH version bump.
5. All amendments MUST update dependent templates and the Sync Impact Report.

**Compliance**:
- Every PR/review MUST verify compliance with applicable principles.
- Complexity or deviations MUST be explicitly justified.
- The `CLAUDE.md` file provides runtime agent guidance; conflicts with this constitution
  MUST be resolved in favor of the constitution.
- Security requirements are NON-NEGOTIABLE; violations are blocking.

**Version**: 1.0.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18
