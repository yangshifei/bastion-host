# Quickstart: Login Security Validation Guide

**Feature**: 002-login-security | **Date**: 2026-06-25

## Prerequisites

- Docker Compose deployment running
- Admin account for policy configuration
- Test operator account for login testing
- Two different IPs (or ability to simulate via VPN/proxy)

## Validation Scenarios

### Scenario 1: Password Policy Enforcement

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin → Security Settings → set min_length=10, require_special=true | Policy saved |
| 2 | Operator → Profile → Change Password → enter `abc12345` | Rejected: "至少 10 位" |
| 3 | Operator → enter `Abcdef1234` | Rejected: "需要包含特殊字符" |
| 4 | Operator → enter `Abcdef1234!` | Accepted |

### Scenario 2: Password History

| Step | Action | Expected |
|------|--------|----------|
| 1 | Change password to `Pass1!word` | Accepted |
| 2 | Change password to `NewP@ss2` | Accepted |
| 3 | Change password back to `Pass1!word` | Rejected: "不能使用最近使用过的密码" |

### Scenario 3: Password Expiration

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin sets `expire_days=1` for testing | Policy saved |
| 2 | Wait / manually set `password_changed_at` to 2 days ago | — |
| 3 | User logs in with correct credentials | Redirected to force-change page, not dashboard |

### Scenario 4: First Login Force Change

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin creates new user with temp password | `must_change_password=true` |
| 2 | New user logs in with temp password | Redirected to "修改初始密码" page |
| 3 | Enters new password matching policy | Accepted → dashboard |

### Scenario 5: IP Whitelist

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin adds whitelist: `127.0.0.0/8` | Saved |
| 2 | Login from `127.0.0.1` | Proceeds to credential check |
| 3 | Login from external IP | Immediately rejected: "此 IP 地址不在允许范围内" |
| 4 | Admin deletes all whitelist entries | All IPs allowed again |

### Scenario 6: CAPTCHA Challenge

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login with wrong password × 3 | 3 failures |
| 2 | 4th attempt | CAPTCHA appears with question like "5 + 8 = ?" |
| 3 | Enter correct CAPTCHA + correct password | Login succeeds |
| 4 | Test wrong CAPTCHA | Rejected: "验证码错误" |

### Scenario 7: Account Lockout

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login fails × 9 (with CAPTCHA each time after 3) | 9 failures |
| 2 | 10th attempt (with correct CAPTCHA) | Account locked: "账号已锁定 15 分钟" |
| 3 | Try login during lockout | Rejected regardless of password |
| 4 | Wait 15 min + retry with correct password | Login succeeds |

### Scenario 8: Security Notifications

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login from new IP (different from known_ips) | Success |
| 2 | Check header notification bell | Badge shows "1" |
| 3 | Click bell | Dropdown shows "检测到来自新 IP (x.x.x.x) 的登录" |
| 4 | Click "Mark all read" | Badge disappears |

## Success Criteria Verification

| SC | How to verify |
|----|---------------|
| SC-001 | Password rejection message appears within 1s of form submission |
| SC-002 | IP-rejected login returns instantly (no loading spinner for credential check) |
| SC-003 | CAPTCHA generation + verification adds < 3s to login flow |
| SC-004 | All events appear in Audit Log (check /audit page) |
| SC-005 | New IP notification appears within 5s of login (refresh page) |
| SC-006 | Password reuse check: verify 0 false accepts across 10 attempts |
