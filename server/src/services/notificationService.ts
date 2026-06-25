import pool from '../database/connection';
import logger from '../utils/logger';

export type NotificationType = 'new_ip_login' | 'failed_login' | 'account_locked' | 'password_changed';

export interface LoginNotification {
  id: number;
  user_id: number;
  type: NotificationType;
  ip: string | null;
  detail: any;
  read: boolean;
  created_at: string;
}

export const notificationService = {
  async create(
    userId: number,
    type: NotificationType,
    ip?: string,
    detail?: any
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO login_notifications (user_id, type, ip, detail) VALUES (?, ?, ?, ?)`,
        [userId, type, ip || null, detail ? JSON.stringify(detail) : null]
      );
    } catch (err) {
      logger.error({ err, userId, type }, 'Failed to create notification');
    }
  },

  async getNotifications(
    userId: number,
    unreadOnly: boolean = false,
    limit: number = 20
  ): Promise<LoginNotification[]> {
    try {
      let sql = `SELECT id, user_id, type, ip, detail, \`read\`, created_at
                 FROM login_notifications WHERE user_id = ?`;
      if (unreadOnly) sql += ` AND \`read\` = 0`;
      sql += ` ORDER BY created_at DESC LIMIT ?`;
      const [rows] = await pool.query<any[]>(sql, [userId, limit]);
      return rows.map(r => ({ ...r, read: !!r.read }));
    } catch (err) {
      logger.error({ err, userId }, 'Failed to fetch notifications');
      return [];
    }
  },

  async getUnreadCount(userId: number): Promise<number> {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT COUNT(*) as cnt FROM login_notifications WHERE user_id = ? AND \`read\` = 0`,
        [userId]
      );
      return rows[0]?.cnt || 0;
    } catch {
      return 0;
    }
  },

  async markRead(userId: number, ids?: number[], markAll: boolean = false): Promise<void> {
    try {
      if (markAll) {
        await pool.query(
          `UPDATE login_notifications SET \`read\` = 1 WHERE user_id = ? AND \`read\` = 0`,
          [userId]
        );
      } else if (ids && ids.length > 0) {
        await pool.query(
          `UPDATE login_notifications SET \`read\` = 1 WHERE user_id = ? AND id IN (?)`,
          [userId, ids]
        );
      }
    } catch (err) {
      logger.error({ err, userId }, 'Failed to mark notifications read');
    }
  },
};
