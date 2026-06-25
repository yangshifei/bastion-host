# Tasks: Login Security Enhancement

**Feature**: 002-login-security | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1: Setup (Database & Configuration)

- [ ] T001 Create database migration: add columns `password_changed_at`, `must_change_password`, `known_ips` to `users` table in server/src/database/schema.sql
- [ ] T002 [P] Create database migration: `password_history` table in server/src/database/schema.sql
- [ ] T003 [P] Create database migration: `ip_whitelist` table in server/src/database/schema.sql
- [ ] T004 [P] Create database migration: `user_ip_bindings` table in server/src/database/schema.sql
- [ ] T005 [P] Create database migration: `login_notifications` table in server/src/database/schema.sql
- [ ] T006 [P] Create database migration: `system_config` table with default password_policy row in server/src/database/schema.sql

## Phase 2: Foundational (Shared Middleware & Services)

- [ ] T007 Implement `PasswordPolicyService` — load/validate policy, check complexity, check history in server/src/services/passwordPolicyService.ts
- [ ] T008 [P] Implement `NotificationService` — create/query/mark-read notifications in server/src/services/notificationService.ts
- [ ] T009 [P] Implement `IpFilterMiddleware` — CIDR matching, IP rejection middleware in server/src/middleware/ipFilter.ts
- [ ] T010 [P] Implement `CaptchaService` — generate/verify math CAPTCHA with Redis/memory store in server/src/services/captchaService.ts
- [ ] T011 Implement `securityService` API client for client-side in client/src/services/securityService.ts

## Phase 3: US1 — Password Policy Enforcement (P1)

**Goal**: Admin configures password rules; system enforces complexity, expiration, history, and forced first-change.

**Independent Test**: Admin sets min_length=10 → operator tries weak password → rejected → sets compliant password → accepted.

- [ ] T012 [US1] Implement `GET /api/security/password-policy` endpoint in server/src/routes/security.ts
- [ ] T013 [US1] Implement `PUT /api/security/password-policy` endpoint (admin only) in server/src/routes/security.ts
- [ ] T014 [US1] Enhance `POST /api/auth/change-password` to validate against policy + history in server/src/routes/auth.ts
- [ ] T015 [US1] Enhance `POST /api/auth/login` to set `must_change_password=true` for new users, check `password_changed_at` + `expire_days` in server/src/routes/auth.ts
- [ ] T016 [US1] Create `ForcePasswordChange` page — form with policy display, redirect if already changed in client/src/pages/ForcePasswordChange.tsx
- [ ] T017 [P] [US1] Create `SecuritySettings` page — admin UI for password policy configuration in client/src/pages/SecuritySettings.tsx
- [ ] T018 [P] [US1] Update `Login` page to redirect to ForcePasswordChange when API returns `require_password_change` in client/src/pages/Login.tsx

## Phase 4: US2 — IP Access Control (P1)

**Goal**: Admin defines CIDR whitelist; system rejects logins from unauthorized IPs before credential check.

**Independent Test**: Add whitelist `127.0.0.0/8` → login from localhost works → login from external IP rejected.

- [ ] T019 [US2] Implement `GET /api/security/ip-whitelist` endpoint in server/src/routes/security.ts
- [ ] T020 [US2] Implement `POST /api/security/ip-whitelist` endpoint (admin only) in server/src/routes/security.ts
- [ ] T021 [US2] Implement `DELETE /api/security/ip-whitelist/:id` endpoint in server/src/routes/security.ts
- [ ] T022 [US2] Implement `PATCH /api/security/ip-whitelist/:id` (toggle enabled) in server/src/routes/security.ts
- [ ] T023 [US2] Implement `GET/PUT/DELETE /api/users/:id/ip-binding` endpoints in server/src/routes/users.ts
- [ ] T024 [US2] Integrate `IpFilterMiddleware` into login flow — check global whitelist + per-user binding before credential check in server/src/routes/auth.ts
- [ ] T025 [US2] Add IP whitelist management UI to `SecuritySettings` page in client/src/pages/SecuritySettings.tsx

## Phase 5: US3 — CAPTCHA & Brute Force Protection (P2)

**Goal**: After N failed logins, require CAPTCHA; after M total failures, lock account.

**Independent Test**: Fail login 3 times → CAPTCHA appears on 4th attempt → solve CAPTCHA + correct password → login succeeds.

- [ ] T026 [US3] Implement `GET /api/auth/captcha` — generate math challenge, store answer server-side in server/src/routes/auth.ts
- [ ] T027 [US3] Implement `POST /api/auth/captcha/verify` — validate CAPTCHA answer in server/src/routes/auth.ts
- [ ] T028 [US3] Create `CaptchaChallenge` component — render math question + answer input in client/src/components/CaptchaChallenge.tsx
- [ ] T029 [US3] Enhance login flow: track `fail_count`, require CAPTCHA when `fail_count >= captcha_threshold`, lock when `fail_count >= lockout_threshold` in server/src/routes/auth.ts
- [ ] T030 [US3] Update `Login` page to show CAPTCHA when required (based on API response) in client/src/pages/Login.tsx

## Phase 6: US4 — Security Event Notifications (P3)

**Goal**: Users see in-app notifications for new-IP logins, failed attempts, lockouts, and password changes.

**Independent Test**: Login from new IP → check notification bell → see "新 IP 登录" alert.

- [ ] T031 [US4] Implement `GET /api/notifications` endpoint — list user's notifications in server/src/routes/security.ts
- [ ] T032 [US4] Implement `GET /api/notifications/unread-count` endpoint in server/src/routes/security.ts
- [ ] T033 [US4] Implement `POST /api/notifications/mark-read` endpoint in server/src/routes/security.ts
- [ ] T034 [US4] Hook login flow to create `new_ip_login` notification when IP not in `known_ips` in server/src/routes/auth.ts
- [ ] T035 [US4] Hook login flow to create `account_locked` notification on lockout in server/src/routes/auth.ts
- [ ] T036 [US4] Create `NotificationCenter` panel component — dropdown in header with bell icon + unread badge in client/src/components/NotificationCenter.tsx
- [ ] T037 [US4] Integrate `NotificationCenter` into `Layout` header in client/src/components/Layout.tsx

## Phase 7: Polish & Cross-Cutting

- [ ] T038 Add audit logging for all security events: password change, policy update, IP whitelist change, lockout, CAPTCHA events in server/src/routes/security.ts and server/src/routes/auth.ts
- [ ] T039 [P] Add CAPTCHA threshold + lockout threshold fields to SecuritySettings page UI in client/src/pages/SecuritySettings.tsx
- [ ] T040 [P] Backward compat: ensure empty IP whitelist = no restriction, existing users without `known_ips` treated as empty array in server/src/middleware/ipFilter.ts

## Dependencies

```
Setup (Phase 1)
  └── Foundational (Phase 2)
        ├── US1 Password Policy (Phase 3) ── independent
        ├── US2 IP Access Control (Phase 4) ── independent
        ├── US3 CAPTCHA (Phase 5) ── depends on US1 (login flow)
        └── US4 Notifications (Phase 6) ── depends on US1 (login flow)
              └── Polish (Phase 7)
```

**US1 and US2 are fully independent** and can be developed in parallel.

## Parallel Opportunities

- Within Setup: T002-T006 (all DB table creation) can run in parallel
- Within Foundational: T008, T009, T010 (independent services/middleware) can run in parallel
- US1 + US2: Entire phases can run in parallel (different files, no shared dependencies)
- Within US4: T031-T033 (notification API endpoints) can run in parallel

## Implementation Strategy

**MVP (Phase 1-3)**: Password policy enforcement alone delivers immediate value — stronger passwords, forced rotation, first-login change. Deployable independently.

**Incremental delivery**:
1. Password Policy (US1) → deploy
2. IP Access Control (US2) → deploy
3. CAPTCHA (US3) → deploy
4. Notifications (US4) → deploy
