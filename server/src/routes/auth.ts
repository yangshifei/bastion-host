import { Router, Request, Response } from 'express';
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

const router = Router();

// ---- Zod Schemas ----
const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
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

// ---- POST /api/auth/login ----
router.post('/login', loginLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const { ip, userAgent } = auditFromReq(req);

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
      error(res, '用户名或密码错误', 1, 401);
      return;
    }

    const user = rows[0];

    // Check account disabled
    if (user.status === 'disabled') {
      error(res, '账号已被禁用', 1, 401);
      return;
    }

    // Check lock
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await pool.query(
        'INSERT INTO login_logs (user_id, username, ip, user_agent, result) VALUES (?, ?, ?, ?, ?)',
        [user.id, username, ip, userAgent, 'fail_locked']
      );
      error(res, '账号已被锁定，请稍后再试', 1, 401);
      return;
    }

    // Verify password
    const validPwd = await bcrypt.compare(password, user.password_hash);

    if (!validPwd) {
      // Increment login fails
      const fails = user.login_fails + 1;
      const lockedUntil = fails >= config.security.loginMaxFails
        ? new Date(Date.now() + config.security.loginLockMinutes * 60 * 1000)
        : null;

      await pool.query(
        'UPDATE users SET login_fails = ?, locked_until = ? WHERE id = ?',
        [fails, lockedUntil, user.id]
      );

      await pool.query(
        'INSERT INTO login_logs (user_id, username, ip, user_agent, result) VALUES (?, ?, ?, ?, ?)',
        [user.id, username, ip, userAgent, 'fail_wrong_password']
      );

      error(res, '用户名或密码错误', 1, 401);
      return;
    }

    // Password valid — reset fail counter
    await pool.query(
      'UPDATE users SET login_fails = 0, locked_until = NULL, last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // If MFA enabled, return intermediate token
    if (user.mfa_enabled) {
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
      'UPDATE users SET mfa_enabled = 0, totp_secret = NULL, mfa_recovery = NULL WHERE id = ?',
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

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?',
      [newHash, userId]
    );

    await recordAudit({
      ...auditFromReq(req),
      action: 'change_password',
      targetType: 'user',
      targetId: userId,
    });

    success(res, null, '密码修改成功');
  } catch (err: any) {
    error(res, err.message, 1, 500);
  }
});

export default router;
