# Implementation Plan: Email MFA Verification

**Branch**: `003-email-mfa` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

## Summary

Add email-based MFA as an alternative to TOTP. After password auth, send a 6-digit code to the user's registered email. Includes SMTP configuration in Security Settings, MFA method selection UI, and email code verification during login.

## Technical Context

**Language/Version**: TypeScript 5.x (server), React 18 + TypeScript (client)

**Primary Dependencies**: nodemailer (SMTP client), speakeasy (existing TOTP, unchanged), MySQL (code storage), bcrypt (code hashing)

**Storage**: MySQL — new table `email_mfa_codes`. SMTP config stored in `system_config`.

**Testing**: Manual integration testing with Mailpit or real SMTP server

**Project Type**: Web application (React SPA + Express API)

**Performance Goals**: Email sent within 2s of password verification; code verification < 200ms

**Constraints**: Must coexist with existing TOTP MFA. SMTP config managed by admin.

**Scale/Scope**: ~4 new API endpoints, 1 new DB table, 1 new npm dependency (nodemailer), ~5 modified files

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| **Simplicity First** | ✅ PASS | nodemailer is standard, well-understood pattern |
| **Surgical Changes** | ✅ PASS | New MFA method alongside existing TOTP |
| **Goal-Driven** | ✅ PASS | 4 measurable success criteria |

## Project Structure

```text
server/src/
├── routes/
│   ├── auth.ts           # Enhanced: email code flow
│   └── security.ts       # Enhanced: SMTP config endpoints
├── services/
│   ├── emailService.ts   # NEW: send verification codes
│   └── mfaService.ts     # NEW: unified MFA code verification
└── database/
    └── connection.ts     # Enhanced: email_mfa_codes migration

client/src/
├── pages/
│   ├── Login.tsx              # Enhanced: email code input step
│   └── SecuritySettings.tsx   # Enhanced: SMTP config section
├── components/
│   └── MfaSetup.tsx           # Enhanced: method selection UI
```

## Complexity Tracking

No violations.
