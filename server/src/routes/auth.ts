import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { z } from 'zod';
import pool from '../database/connection';
import config from '../config';
import { authenticate } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validator';
import { recordAudit, auditFromReq } from '../middleware/audit';
import { success, error } from '../utils/response';
import { passwordPolicyService } from '../services/passwordPolicyService';
import { notificationService } from '../services/notificationService';
import { emailService } from '../services/emailService';
import { captchaService } from '../services/captchaService';

const router = Router();

// ---- Zod Schemas ----
const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  captcha_id: z.string().optional(),
  captcha_answer: z.string().optional(),
});

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().length(6),
});

const mfaEnableSchema = z.object({
  code: z.string().length(6),
});

const mfaRecoverySchema = z.object({
  username: z.string().min(1).max(64),
  recoveryCode: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(/^(?=.*[a-zA-Z])(?=.*\d)/, '密码必须包含字母和数字'),
});

// ---- Helpers ----
function generateToken(userId: number, username: string, role: string): string {
  return jwt.sign(
    { userId, username, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

function generateMfaToken(userId: number): string {
  return jwt.sign(
    { userId, type: 'mfa' },
    config.jwt.secret,
    { expiresIn: '5m' } as jwt.SignOptions
  );
}

function sanitizeUser(user: any) {
  const { password_hash, totp_secret, mfa_recovery, ...safe } = user;
  return {
    ...safe,
    mfa_enabled: !!user.mfa_enabled,
  };
}

function loginError(
  res: Response,
  message: string,
  extra?: { requireCaptcha?: boolean; loginFails?: number; locked?: boolean }
) {
  error(res, message, 1, 401, extra);
}

// ---- GET /api/auth/captcha ----
router.get('/captcha', async (_req: Request, res: Response) => {
  try {
    const { id, question, expiresIn } = captchaService.generate();
    success(res, { challenge_id: id, question, expires_in: expiresIn });
  } catch (err: any) {
    error(res, '验证码生成失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/login ----
router.post('/login', loginLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, captcha_id, captcha_answer } = req.body;
    const { ip, userAgent } = auditFromReq(req);
    const policy = await passwordPolicyService.getPolicy();

    // Find user
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL',
      [username]
    );

    if (rows.length === 0) {
      // Record failed login (no user)
      await pool.query(
        'INSERT INTO login_logs (user_id, username, ip, user_agent, result) VALUES (NULL, ?, ?, ?, ?)',
        [username, ip, userAgent, 'fail_no_user']
      );
      loginError(res, '用户名或密码错误');
      return;
    }

    const user = rows[0];

    // Check account disabled
    if (user.status === 'disabled') {
      loginError(res, '账号已被禁用');
      return;
    }

    // Check lock
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await pool.query(
        'INSERT INTO login_logs (user_id, username, ip, user_agent, result) VALUES (?, ?, ?, ?, ?)',
        [user.id, username, ip, userAgent, 'fail_locked']
      );
      loginError(res, '账号已被锁定，请稍后再试', { locked: true, loginFails: user.login_fails });
      return;
    }

    const needsCaptcha = user.login_fails >= policy.captcha_threshold;
    if (needsCaptcha) {
      if (!captcha_id || captcha_answer === undefined || captcha_answer === '') {
        loginError(res, '请输入验证码', { requireCaptcha: true, loginFails: user.login_fails });
        return;
      }
      if (!captchaService.verify(captcha_id, captcha_answer)) {
        loginError(res, '验证码错误或已过期', { requireCaptcha: true, loginFails: user.login_fails });
        return;
      }
    }

    // Verify password
    const validPwd = await bcrypt.compare(password, user.password_hash);

    if (!validPwd) {
      // Increment login fails
      const fails = user.login_fails + 1;
      const lockedUntil = fails >= policy.lockout_threshold
        ? new Date(Date.now() + policy.lockout_minutes * 60 * 1000)
        : null;

      await pool.query(
        'UPDATE users SET login_fails = ?, locked_until = ? WHERE id = ?',
        [fails, lockedUntil, user.id]
      );

      await pool.query(
        'INSERT INTO login_logs (user_id, username, ip, user_agent, result) VALUES (?, ?, ?, ?, ?)',
        [user.id, username, ip, userAgent, 'fail_wrong_password']
      );

      if (lockedUntil) {
        await notificationService.create(user.id, 'account_locked', ip || undefined);
        loginError(res, '登录失败次数过多，账号已被锁定', {
          locked: true,
          loginFails: fails,
          requireCaptcha: fails >= policy.captcha_threshold,
        });
        return;
      }

      loginError(res, '用户名或密码错误', {
        requireCaptcha: fails >= policy.captcha_threshold,
        loginFails: fails,
      });
      return;
    }

    // Password valid — reset fail counter
    const knownIps: string[] = user.known_ips ? (typeof user.known_ips === 'string' ? JSON.parse(user.known_ips) : user.known_ips) : [];
    const clientIp = ip || '0.0.0.0';
    const isNewIp = knownIps.length > 0 && !knownIps.includes(clientIp);

    const updatedIps = knownIps.includes(clientIp) ? knownIps : [...knownIps.slice(-19), clientIp];
    await pool.query(
      'UPDATE users SET login_fails = 0, locked_until = NULL, last_login = NOW(), known_ips = ? WHERE id = ?',
      [JSON.stringify(updatedIps), user.id]
    );

    // Check password policy (must change / expired)
    if (user.must_change_password) {
      const token = generateToken(user.id, user.username, user.role);
      success(res, { token, user: sanitizeUser(user), require_password_change: true }, '请修改初始密码');
      return;
    }
    if (policy.expire_days > 0 && user.password_changed_at) {
      const changedAt = new Date(user.password_changed_at);
      const expireAt = new Date(changedAt.getTime() + policy.expire_days * 24 * 60 * 60 * 1000);
      if (new Date() > expireAt) {
        await pool.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
        const token = generateToken(user.id, user.username, user.role);
        success(res, { token, user: sanitizeUser(user), require_password_change: true }, '密码已过期，请修改密码');
        return;
      }
    }

    // Create notification for new IP login
    if (isNewIp) {
      await notificationService.create(user.id, 'new_ip_login', clientIp);
    }

    // Global MFA policy: must enable MFA before full access
    if (policy.require_mfa && !user.mfa_enabled) {
      const token = generateToken(user.id, user.username, user.role);
      success(res, { token, user: sanitizeUser(user), require_mfa_setup: true }, '请先启用 MFA');
      return;
    }

    // If MFA enabled, check method
    if (user.mfa_enabled) {
      if (user.mfa_method === 'email' && user.email) {
        // Email MFA: send code and return session token
        const { code, error: sendError } = await emailService.sendCode(user.email);
        if (sendError || !code) {
          error(res, '验证码邮件发送失败，请稍后重试或联系管理员', 1, 500);
          return;
        }
        const sessionToken = crypto.randomUUID();
        const codeHash = await bcrypt.hash(code, 10);
        await pool.query(
          `INSERT INTO email_mfa_codes (user_id, code_hash, email, expires_at, session_token) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
          [user.id, codeHash, user.email, sessionToken]
        );
        const maskedEmail = user.email.replace(/(.{2}).*(@.*)/, '$1***$2');
        success(res, { require_email_mfa: true, session_token: sessionToken, email_hint: maskedEmail }, '验证码已发送至邮箱');
        return;
      }
      // TOTP MFA (default)
      const mfaToken = generateMfaToken(user.id);
      success(res, { requireMfa: true, mfaToken }, '需要 MFA 验证');
      return;
    }

    // Full login success
    const token = generateToken(user.id, user.username, user.role);

    await pool.query(
      'INSERT INTO login_logs (user_id, username, ip, user_agent, result, mfa_used) VALUES (?, ?, ?, ?, ?, 0)',
      [user.id, username, ip, userAgent, 'success']
    );

    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'login',
      ip,
      userAgent,
    });

    success(res, { token, user: sanitizeUser(user) }, '登录成功');
  } catch (err: any) {
    error(res, '登录失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/mfa/verify ----
router.post('/mfa/verify', loginLimiter, validate(mfaVerifySchema), async (req: Request, res: Response) => {
  try {
    const { mfaToken, code } = req.body;
    const { ip, userAgent } = auditFromReq(req);

    // Verify mfaToken
    let decoded: any;
    try {
      decoded = jwt.verify(mfaToken, config.jwt.secret);
    } catch {
      error(res, 'MFA 令牌无效或已过期', 1, 401);
      return;
    }

    if (decoded.type !== 'mfa' || !decoded.userId) {
      error(res, '无效的 MFA 令牌', 1, 401);
      return;
    }

    // Find user
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (rows.length === 0) {
      error(res, '用户不存在', 1, 401);
      return;
    }

    const user = rows[0];

    if (!user.totp_secret) {
      error(res, 'MFA 未配置', 1, 400);
      return;
    }

    // Verify TOTP
    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: code,
      window: 1, // ±1 interval = 90s total window
    });

    if (!verified) {
      await pool.query(
        'INSERT INTO login_logs (user_id, username, ip, user_agent, result, mfa_used) VALUES (?, ?, ?, ?, ?, 1)',
        [user.id, user.username, ip, userAgent, 'fail_mfa']
      );
      error(res, 'MFA 验证码错误', 1, 401);
      return;
    }

    // MFA success — issue full JWT
    const token = generateToken(user.id, user.username, user.role);

    await pool.query(
      'INSERT INTO login_logs (user_id, username, ip, user_agent, result, mfa_used) VALUES (?, ?, ?, ?, ?, 1)',
      [user.id, user.username, ip, userAgent, 'success']
    );

    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'login',
      ip,
      userAgent,
    });

    success(res, { token, user: sanitizeUser(user) }, 'MFA 验证成功');
  } catch (err: any) {
    error(res, 'MFA 验证失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/mfa/setup ----
router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [rows] = await pool.query<any[]>(
      'SELECT username, mfa_enabled FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );

    if (rows.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    if (rows[0].mfa_enabled) {
      error(res, 'MFA 已启用，请先禁用在重新设置', 1, 400);
      return;
    }

    const secret = speakeasy.generateSecret({
      name: `${rows[0].username}@Bastion`,
      issuer: 'Bastion',
    });

    // Store secret but don't enable yet
    await pool.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret.base32, userId]);

    success(res, {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
    }, 'MFA 设置已生成，请使用 Google Authenticator 扫码');
  } catch (err: any) {
    error(res, 'MFA 设置失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/mfa/enable ----
router.post('/mfa/enable', authenticate, validate(mfaEnableSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.body;

    const [rows] = await pool.query<any[]>(
      'SELECT totp_secret, mfa_enabled FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );

    if (rows.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    const user = rows[0];

    if (!user.totp_secret) {
      error(res, '请先执行 MFA 设置', 1, 400);
      return;
    }

    if (user.mfa_enabled) {
      error(res, 'MFA 已启用', 1, 400);
      return;
    }

    // Verify the code before enabling
    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!verified) {
      error(res, '验证码错误，MFA 未启用', 1, 400);
      return;
    }

    // Generate recovery codes (8 codes, 10 chars each)
    const recoveryCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const code = Array.from({ length: 10 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
          Math.floor(Math.random() * 62)
        ]
      ).join('');
      recoveryCodes.push(code);
    }

    // Hash recovery codes
    const hashedCodes = await Promise.all(
      recoveryCodes.map(c => bcrypt.hash(c, 8))
    );

    await pool.query(
      'UPDATE users SET mfa_enabled = 1, mfa_recovery = ? WHERE id = ?',
      [JSON.stringify(hashedCodes), userId]
    );

    await recordAudit({
      userId,
      username: req.user!.username,
      action: 'mfa_enable',
      targetType: 'user',
      targetId: userId,
    });

    success(res, { recoveryCodes }, 'MFA 已启用，请妥善保管恢复码');
  } catch (err: any) {
    error(res, 'MFA 启用失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/mfa/disable ----
router.post('/mfa/disable', authenticate, validate(z.object({ password: z.string().min(1) })), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    const [rows] = await pool.query<any[]>(
      'SELECT password_hash, mfa_enabled FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );

    if (rows.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    if (!rows[0].mfa_enabled) {
      error(res, 'MFA 未启用', 1, 400);
      return;
    }

    const validPwd = await bcrypt.compare(password, rows[0].password_hash);
    if (!validPwd) {
      error(res, '密码错误', 1, 401);
      return;
    }

    await pool.query(
      'UPDATE users SET mfa_enabled = 0, mfa_method = NULL, totp_secret = NULL, mfa_recovery = NULL WHERE id = ?',
      [userId]
    );

    await recordAudit({
      userId,
      username: req.user!.username,
      action: 'mfa_disable',
      targetType: 'user',
      targetId: userId,
    });

    success(res, null, 'MFA 已禁用');
  } catch (err: any) {
    error(res, 'MFA 禁用失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/mfa/recovery ----
router.post('/mfa/recovery', loginLimiter, validate(mfaRecoverySchema), async (req: Request, res: Response) => {
  try {
    const { username, recoveryCode } = req.body;
    const { ip, userAgent } = auditFromReq(req);

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL AND mfa_enabled = 1',
      [username]
    );

    if (rows.length === 0) {
      error(res, '用户不存在或未启用 MFA', 1, 401);
      return;
    }

    const user = rows[0];

    if (!user.mfa_recovery) {
      error(res, '没有可用的恢复码', 1, 400);
      return;
    }

    let hashedCodes: string[];
    try {
      hashedCodes = typeof user.mfa_recovery === 'string'
        ? JSON.parse(user.mfa_recovery)
        : user.mfa_recovery;
    } catch {
      error(res, '恢复码数据异常', 1, 500);
      return;
    }

    // Try to match the recovery code against hashed codes
    let matchedIndex = -1;
    for (let i = 0; i < hashedCodes.length; i++) {
      const match = await bcrypt.compare(recoveryCode, hashedCodes[i]);
      if (match) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      error(res, '恢复码无效', 1, 401);
      return;
    }

    // Remove used recovery code
    hashedCodes.splice(matchedIndex, 1);
    await pool.query(
      'UPDATE users SET mfa_recovery = ? WHERE id = ?',
      [JSON.stringify(hashedCodes), user.id]
    );

    // Issue full JWT (bypass MFA)
    const token = generateToken(user.id, user.username, user.role);

    await pool.query(
      'INSERT INTO login_logs (user_id, username, ip, user_agent, result, mfa_used) VALUES (?, ?, ?, ?, ?, 2)',
      [user.id, username, ip, userAgent, 'success']
    );

    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'login_recovery',
      ip,
      userAgent,
    });

    success(res, { token, user: sanitizeUser(user) }, '恢复登录成功，剩余恢复码: ' + hashedCodes.length);
  } catch (err: any) {
    error(res, '恢复登录失败: ' + err.message, 1, 500);
  }
});

// ---- POST /api/auth/logout ----
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await recordAudit({
    ...auditFromReq(req),
    action: 'logout',
  });
  success(res, null, '已登出');
});

// ---- GET /api/auth/me ----
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.user!.userId]
    );

    if (rows.length === 0) {
      error(res, '用户不存在', 1, 404);
      return;
    }

    success(res, sanitizeUser(rows[0]));
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ---- POST /api/auth/change-password ----
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { oldPassword, newPassword } = req.body;

    const [rows] = await pool.query<any[]>(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!valid) {
      error(res, '原密码错误', 1, 401);
      return;
    }

    // Validate against password policy
    const policy = await passwordPolicyService.getPolicy();
    const policyError = passwordPolicyService.validateComplexity(newPassword, policy);
    if (policyError) {
      error(res, policyError, 1, 400);
      return;
    }

    // Check password history
    const reused = await passwordPolicyService.isInHistory(userId, newPassword, policy.history_count);
    if (reused) {
      error(res, '不能使用最近使用过的密码', 1, 400);
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    // Save to history and update user
    await passwordPolicyService.addToHistory(userId, newHash, policy.history_count);
    await pool.query(
      'UPDATE users SET password_hash = ?, password_changed_at = NOW(), must_change_password = 0 WHERE id = ?',
      [newHash, userId]
    );

    await recordAudit({
      ...auditFromReq(req),
      action: 'change_password',
      targetType: 'user',
      targetId: userId,
    });

    await notificationService.create(userId, 'password_changed', (req as any).ip);

    success(res, null, '密码修改成功');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// ═══════════════════ Email MFA ═══════════════════

const emailMfaSchema = z.object({
  session_token: z.string().min(1),
  code: z.string().length(6),
});

// POST /api/auth/mfa/email/verify
router.post('/mfa/email/verify', loginLimiter, validate(emailMfaSchema), async (req: Request, res: Response) => {
  try {
    const { session_token, code } = req.body;
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM email_mfa_codes WHERE session_token = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [session_token]
    );
    if (rows.length === 0) { error(res, '验证码已过期或无效', 1, 401); return; }
    const record = rows[0];

    if (record.attempts >= 3) {
      await pool.query('DELETE FROM email_mfa_codes WHERE id = ?', [record.id]);
      error(res, '验证码尝试次数过多，请重新获取', 1, 401);
      return;
    }

    const valid = await bcrypt.compare(code, record.code_hash);
    if (!valid) {
      await pool.query('UPDATE email_mfa_codes SET attempts = attempts + 1 WHERE id = ?', [record.id]);
      const remaining = 2 - record.attempts;
      error(res, `验证码错误，剩余 ${remaining} 次尝试`, 1, 401);
      return;
    }

    // Code verified — clean up and issue JWT
    await pool.query('DELETE FROM email_mfa_codes WHERE id = ?', [record.id]);
    const [users] = await pool.query<any[]>('SELECT * FROM users WHERE id = ?', [record.user_id]);
    const user = users[0];
    await pool.query('UPDATE users SET login_fails = 0, locked_until = NULL, last_login = NOW() WHERE id = ?', [user.id]);
    const token = generateToken(user.id, user.username, user.role);

    await pool.query('INSERT INTO login_logs (user_id, username, ip, user_agent, result, mfa_used) VALUES (?, ?, ?, ?, ?, 1)',
      [user.id, user.username, auditFromReq(req).ip, auditFromReq(req).userAgent, 'success']);
    await recordAudit({ userId: user.id, username: user.username, action: 'login', ip: auditFromReq(req).ip || undefined, userAgent: auditFromReq(req).userAgent || undefined });

    success(res, { token, user: sanitizeUser(user) }, '邮件验证码确认成功');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

// POST /api/auth/mfa/email/enable — start email MFA setup (send code)
router.post('/mfa/email/enable', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [rows] = await pool.query<any[]>('SELECT email, mfa_enabled FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) { error(res, '用户不存在', 1, 404); return; }
    if (rows[0].mfa_enabled) { error(res, 'MFA 已启用，请先禁用再重新设置', 1, 400); return; }
    const email = rows[0].email;
    if (!email) { error(res, '请先在个人设置中绑定邮箱', 1, 400); return; }

    const { code, error: sendError } = await emailService.sendCode(email);
    if (sendError || !code) { error(res, '验证码发送失败: ' + (sendError || 'unknown'), 1, 500); return; }

    const codeHash = await bcrypt.hash(code, 10);
    // Store temp code for verification
    await pool.query('DELETE FROM email_mfa_codes WHERE user_id = ?', [userId]);
    await pool.query(
      `INSERT INTO email_mfa_codes (user_id, code_hash, email, expires_at, session_token) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
      [userId, codeHash, email, 'mfa_setup_' + userId]
    );

    success(res, { email_hint: email.replace(/(.{2}).*(@.*)/, '$1***$2') }, '验证码已发送');
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// POST /api/auth/mfa/email/enable/verify — verify email code and enable
router.post('/mfa/email/enable/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.body;
    if (!code || code.length !== 6) { error(res, '请输入 6 位验证码', 1, 400); return; }

    const [rows] = await pool.query<any[]>(
      `SELECT * FROM email_mfa_codes WHERE user_id = ? AND session_token = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [userId, 'mfa_setup_' + userId]
    );
    if (rows.length === 0) { error(res, '验证码已过期或未发送', 1, 400); return; }

    const valid = await bcrypt.compare(code, rows[0].code_hash);
    if (!valid) { error(res, '验证码错误', 1, 400); return; }

    await pool.query('DELETE FROM email_mfa_codes WHERE user_id = ?', [userId]);

    // Generate recovery codes
    const codes = Array.from({ length: 6 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    const hashedCodes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));

    await pool.query(
      'UPDATE users SET mfa_enabled = 1, mfa_method = ?, mfa_recovery = ? WHERE id = ?',
      ['email', JSON.stringify(hashedCodes), userId]
    );

    success(res, { recoveryCodes: codes }, '邮箱 MFA 已启用');
  } catch (err: any) { error(res, err.message, 1, 500); }
});

// POST /api/auth/mfa/email/resend
router.post('/mfa/email/resend', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { session_token } = req.body;
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM email_mfa_codes WHERE session_token = ? ORDER BY created_at DESC LIMIT 1`,
      [session_token]
    );
    if (rows.length === 0) { error(res, '会话无效', 1, 400); return; }
    const record = rows[0];

    // Rate limit: 3 codes per 15 min
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as cnt FROM email_mfa_codes WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
      [record.user_id]
    );
    if (countRows[0].cnt >= 3) {
      error(res, '验证码请求过于频繁，请 15 分钟后重试', 1, 429);
      return;
    }

    await pool.query('DELETE FROM email_mfa_codes WHERE session_token = ?', [session_token]);
    const { code, error: sendError } = await emailService.sendCode(record.email);
    if (sendError || !code) { error(res, '邮件发送失败: ' + (sendError || 'unknown'), 1, 500); return; }

    const codeHash = await bcrypt.hash(code, 10);
    await pool.query(
      `INSERT INTO email_mfa_codes (user_id, code_hash, email, expires_at, session_token) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
      [record.user_id, codeHash, record.email, session_token]
    );

    success(res, null, '验证码已重新发送');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
