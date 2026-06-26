# Quickstart: Email MFA Validation Guide

**Feature**: 003-email-mfa | **Date**: 2026-06-25

## Prerequisites

- Docker Compose deployment running
- Admin account for SMTP configuration
- Test SMTP server (Mailpit recommended: `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`)
- Test operator account with email set

## Validation Scenarios

### Scenario 1: Admin Configures SMTP

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin → Security Settings → SMTP 配置 | See SMTP form |
| 2 | Fill in host: `host.docker.internal`, port: `1025`, user/pass empty | — |
| 3 | Click "保存并测试" | "测试邮件已发送" |
| 4 | Check Mailpit UI (localhost:8025) | Test email received |

### Scenario 2: User Enables Email MFA

| Step | Action | Expected |
|------|--------|----------|
| 1 | Operator → Profile → MFA Settings | See two options: TOTP / Email |
| 2 | Click "邮箱验证码" → setup | System sends verification code |
| 3 | Check Mailpit → copy code | — |
| 4 | Enter code | "邮箱验证码已启用" |
| 5 | Check MFA status | Shows "邮箱验证码 · 已启用" |

### Scenario 3: Email MFA Login

| Step | Action | Expected |
|------|--------|----------|
| 1 | Logout → Login with operator credentials | — |
| 2 | Enter correct password | Redirected to "输入邮箱验证码" page |
| 3 | Screen shows masked email `op***@test.com` | — |
| 4 | Check Mailpit → copy code → enter | Login success → Dashboard |
| 5 | Enter wrong code | "验证码错误，剩余 2 次尝试" |

### Scenario 4: Rate Limiting

| Step | Action | Expected |
|------|--------|----------|
| 1 | Request code 3 times in 15 min | Success each time |
| 2 | Request 4th time | "验证码请求过于频繁，请 15 分钟后重试" |

### Scenario 5: Code Expiry

| Step | Action | Expected |
|------|--------|----------|
| 1 | Request code, wait 6 minutes | — |
| 2 | Enter code | "验证码已过期" |
| 3 | Click "重新发送" | New code sent, old code invalid |

## Success Criteria Verification

| SC | How to verify |
|----|---------------|
| SC-001 | Code email arrives within 10s (check Mailpit timestamp) |
| SC-002 | Complete setup in < 2 min (timer from opening MFA settings) |
| SC-003 | All events in Audit Log (check /audit page) |
| SC-004 | 4th code request in 15 min rejected |
