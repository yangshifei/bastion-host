# Tasks: Email MFA Verification

**Feature**: 003-email-mfa | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1: Setup

- [ ] T001 Install nodemailer in server/package.json
- [ ] T002 [P] Add `mfa_method` ENUM('totp','email') column to users table in server/src/database/connection.ts
- [ ] T003 [P] Create `email_mfa_codes` migration in server/src/database/connection.ts

## Phase 2: SMTP Service & Config

- [ ] T004 Implement emailService — sendVerificationCode, sendTestEmail in server/src/services/emailService.ts
- [ ] T005 Implement GET/PUT /api/security/smtp-config in server/src/routes/security.ts
- [ ] T006 Add SMTP config section to SecuritySettings page in client/src/pages/SecuritySettings.tsx

## Phase 3: Email MFA Login Flow

- [ ] T007 Implement POST /api/auth/mfa/email/verify in server/src/routes/auth.ts
- [ ] T008 Implement POST /api/auth/mfa/email/resend in server/src/routes/auth.ts
- [ ] T009 Enhance login flow to send email code when user has email MFA in server/src/routes/auth.ts
- [ ] T010 Add email code input step to Login page in client/src/pages/Login.tsx

## Phase 4: MFA Method Selection

- [ ] T011 Implement PUT /api/auth/mfa/method in server/src/routes/auth.ts
- [ ] T012 Update MfaSetup component with method selection UI in client/src/components/MfaSetup.tsx

## Phase 5: Polish

- [ ] T013 Add rate limiting for email code requests (3 per 15 min) in server/src/routes/auth.ts
- [ ] T014 Add audit logging for email MFA events in server/src/routes/auth.ts
