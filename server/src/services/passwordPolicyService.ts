import pool from '../database/connection';
import logger from '../utils/logger';
import bcrypt from 'bcryptjs';

export interface PasswordPolicy {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_digit: boolean;
  require_special: boolean;
  expire_days: number;
  history_count: number;
  force_change_on_create: boolean;
  captcha_threshold: number;
  lockout_threshold: number;
  lockout_minutes: number;
  require_mfa: boolean;
}

const DEFAULT_POLICY: PasswordPolicy = {
  min_length: 8,
  require_upper: true,
  require_lower: true,
  require_digit: true,
  require_special: false,
  expire_days: 90,
  history_count: 5,
  force_change_on_create: true,
  captcha_threshold: 3,
  lockout_threshold: 10,
  lockout_minutes: 15,
  require_mfa: false,
};

function parseConfigValue(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizePolicy(raw: Record<string, unknown>): PasswordPolicy {
  return {
    min_length: Number(raw.min_length ?? DEFAULT_POLICY.min_length),
    require_upper: Boolean(raw.require_upper ?? DEFAULT_POLICY.require_upper),
    require_lower: Boolean(raw.require_lower ?? DEFAULT_POLICY.require_lower),
    require_digit: Boolean(raw.require_digit ?? DEFAULT_POLICY.require_digit),
    require_special: Boolean(raw.require_special ?? DEFAULT_POLICY.require_special),
    expire_days: Number(raw.expire_days ?? DEFAULT_POLICY.expire_days),
    history_count: Number(raw.history_count ?? DEFAULT_POLICY.history_count),
    force_change_on_create: Boolean(raw.force_change_on_create ?? DEFAULT_POLICY.force_change_on_create),
    captcha_threshold: Number(raw.captcha_threshold ?? DEFAULT_POLICY.captcha_threshold),
    lockout_threshold: Number(raw.lockout_threshold ?? DEFAULT_POLICY.lockout_threshold),
    lockout_minutes: Number(raw.lockout_minutes ?? DEFAULT_POLICY.lockout_minutes),
    require_mfa: Boolean(raw.require_mfa ?? DEFAULT_POLICY.require_mfa),
  };
}

export const passwordPolicyService = {
  async getPolicy(): Promise<PasswordPolicy> {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT config_value FROM system_config WHERE config_key = 'password_policy'`
      );
      if (rows.length > 0 && rows[0].config_value != null) {
        return normalizePolicy({ ...DEFAULT_POLICY, ...parseConfigValue(rows[0].config_value) });
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load password policy, using defaults');
    }
    return DEFAULT_POLICY;
  },

  async updatePolicy(updates: Partial<PasswordPolicy>): Promise<PasswordPolicy> {
    const current = await this.getPolicy();
    const merged = { ...current, ...updates };
    await pool.query(
      `INSERT INTO system_config (config_key, config_value) VALUES ('password_policy', ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [JSON.stringify(merged)]
    );
    return merged;
  },

  /**
   * Validate password against complexity policy.
   * Returns null if valid, or an error message string if invalid.
   */
  validateComplexity(password: string, policy: PasswordPolicy): string | null {
    if (password.length < policy.min_length) {
      return `密码长度至少 ${policy.min_length} 位`;
    }
    if (policy.require_upper && !/[A-Z]/.test(password)) {
      return '密码必须包含大写字母';
    }
    if (policy.require_lower && !/[a-z]/.test(password)) {
      return '密码必须包含小写字母';
    }
    if (policy.require_digit && !/\d/.test(password)) {
      return '密码必须包含数字';
    }
    if (policy.require_special && !/[!@#$%^&*()_+\-=\[\]{}|;:'",.<>\/?\\`~]/.test(password)) {
      return '密码必须包含特殊字符';
    }
    return null;
  },

  /**
   * Check if new password is in user's history.
   * Returns true if password was used before.
   */
  async isInHistory(userId: number, newPassword: string, historyCount: number): Promise<boolean> {
    if (historyCount <= 0) return false;
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT password_hash FROM password_history
         WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [userId, historyCount]
      );
      for (const row of rows) {
        if (await bcrypt.compare(newPassword, row.password_hash)) {
          return true;
        }
      }
    } catch (err) {
      logger.error({ err, userId }, 'Failed to check password history');
    }
    return false;
  },

  /**
   * Save password to history and prune old entries.
   */
  async addToHistory(userId: number, passwordHash: string, historyCount: number): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)`,
        [userId, passwordHash]
      );
      // Prune old entries
      await pool.query(
        `DELETE FROM password_history WHERE user_id = ? AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
           ) AS t
         )`,
        [userId, userId, historyCount]
      );
    } catch (err) {
      logger.error({ err, userId }, 'Failed to save password history');
    }
  },
};
