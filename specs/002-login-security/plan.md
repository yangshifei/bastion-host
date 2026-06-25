# Implementation Plan: Login Security Enhancement

**Branch**: `002-login-security` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-login-security/spec.md`

## Summary

Enhance bastion host login security with four capabilities: configurable password policy enforcement (complexity, expiration, history, forced first-change), IP-based access control (CIDR whitelist + per-user binding), progressive brute force protection (CAPTCHA after N failures), and in-app security event notifications.

## Technical Context

**Language/Version**: TypeScript 5.x (server), React 18 + TypeScript (client)

**Primary Dependencies**: Express + Zod (API validation), TDesign React (UI), bcrypt (password hashing), MySQL (persistence), express-rate-limit (existing)

**Storage**: MySQL — new tables (`password_history`, `ip_whitelist`, `user_ip_bindings`, `login_notifications`, `system_config`) plus additions to `users` (`password_changed_at`, `must_change_password`, `known_ips`)

**Testing**: Manual integration testing

**Target Platform**: Modern browsers (Chrome, Firefox, Edge); Node.js server

**Project Type**: Web application (React SPA + Express API)

**Performance Goals**: IP rejection < 500ms; CAPTCHA < 3s latency; password validation < 100ms

**Constraints**: Backward-compatible with existing users. CAPTCHA must have fallback mode.

**Scale/Scope**: ~6 new API endpoints, ~4 new DB tables, ~8 modified server files, ~4 new/modified client pages

## Constitution Check

*GATE: Must pass before Phase 0 research.*

| Gate | Status | Notes |
|------|--------|-------|
| **Simplicity First** | ✅ PASS | Each sub-feature independently testable |
| **Surgical Changes** | ✅ PASS | Additive; existing login flow enhanced, not replaced |
| **Goal-Driven** | ✅ PASS | 6 measurable success criteria in spec |
| **No Unnecessary Abstraction** | ✅ PASS | Middleware pattern for IP/password checks |

## Project Structure

```text
specs/002-login-security/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md              # /speckit-tasks

server/src/
├── routes/
│   ├── auth.ts           # Enhanced
│   ├── users.ts          # Enhanced
│   └── security.ts       # NEW
├── middleware/
│   ├── ipFilter.ts       # NEW
│   └── passwordPolicy.ts # NEW
└── services/
    └── notificationService.ts # NEW

client/src/
├── pages/
│   ├── Login.tsx              # Enhanced
│   ├── ForcePasswordChange.tsx # NEW
│   ├── SecuritySettings.tsx   # NEW
│   └── NotificationCenter.tsx # NEW
├── components/
│   └── CaptchaChallenge.tsx   # NEW
└── services/
    └── securityService.ts     # NEW
```

## Complexity Tracking

No violations. Each capability is a straightforward enhancement.
