import fs from 'fs';
import pool from '../database/connection';
import config from '../config';
import logger from '../utils/logger';

/**
 * Periodic data retention cleanup service.
 * Deletes expired records according to configured retention periods.
 */
export function startCleanupService(): ReturnType<typeof setInterval> {
  logger.info(
    {
      commandLogDays: config.retention.commandLogDays,
      auditLogDays: config.retention.auditLogDays,
      sessionDays: config.retention.sessionDays,
    },
    'Starting cleanup service'
  );

  return setInterval(async () => {
    try {
      // Clean command_logs (90 days)
      const [cmdResult] = await pool.query<any>(
        `DELETE FROM command_logs WHERE timestamp < NOW() - INTERVAL ? DAY LIMIT 5000`,
        [config.retention.commandLogDays]
      );
      if (cmdResult.affectedRows > 0) {
        logger.info({ deleted: cmdResult.affectedRows }, 'Cleaned old command_logs');
      }

      // Clean sessions + recordings (90 days)
      const [sessions] = await pool.query<any[]>(
        `SELECT id, recording_path FROM sessions
         WHERE status IN ('closed', 'terminated', 'timeout')
         AND end_time < NOW() - INTERVAL ? DAY
         LIMIT 500`,
        [config.retention.sessionDays]
      );

      for (const session of sessions) {
        // Delete recording file
        if (session.recording_path && fs.existsSync(session.recording_path)) {
          try {
            fs.unlinkSync(session.recording_path);
          } catch (err) {
            logger.warn({ err, path: session.recording_path }, 'Failed to delete recording file');
          }
        }

        // Delete from DB (cascades to command_logs via FK)
        await pool.query('DELETE FROM sessions WHERE id = ?', [session.id]);
      }

      if (sessions.length > 0) {
        logger.info({ deleted: sessions.length }, 'Cleaned old sessions and recordings');
      }

      // Clean audit_logs (365 days)
      const [auditResult] = await pool.query<any>(
        `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 5000`,
        [config.retention.auditLogDays]
      );
      if (auditResult.affectedRows > 0) {
        logger.info({ deleted: auditResult.affectedRows }, 'Cleaned old audit_logs');
      }

      // Clean login_logs (180 days)
      const [loginResult] = await pool.query<any>(
        `DELETE FROM login_logs WHERE created_at < NOW() - INTERVAL 180 DAY LIMIT 5000`
      );
      if (loginResult.affectedRows > 0) {
        logger.info({ deleted: loginResult.affectedRows }, 'Cleaned old login_logs');
      }
    } catch (err) {
      logger.error({ err }, 'Cleanup service error');
    }
  }, 60 * 60 * 1000); // Run every hour
}
