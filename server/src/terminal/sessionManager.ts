import { WebSocket } from 'ws';
import { Client as SSHClient } from 'ssh2';
import pool from '../database/connection';
import config from '../config';
import logger from '../utils/logger';

export interface ActiveSession {
  id: string; // uuid
  dbSessionId?: number;
  userId: number;
  assetId: number;
  protocol: 'ssh' | 'rdp';
  ws: WebSocket;
  sshClient?: SSHClient;
  guacClient?: { close?: () => void };
  startTime: Date;
  lastActivity: Date;
  idleTimer?: ReturnType<typeof setTimeout>;
  maxTimer?: ReturnType<typeof setTimeout>;
  clientIp?: string;
  terminating?: boolean;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  create(session: ActiveSession): void {
    this.sessions.set(session.id, session);
    this.startIdleTimer(session.id);
    this.startMaxTimer(session.id);
    logger.info({ sessionId: session.id, userId: session.userId, protocol: session.protocol }, 'Session created');
  }

  remove(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    this.clearTimers(session);
    this.sessions.delete(id);
    logger.info({ sessionId: id }, 'Session removed');
  }

  get(id: string): ActiveSession | undefined {
    return this.sessions.get(id);
  }

  getActiveCountForUser(userId: number): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId) count++;
    }
    return count;
  }

  getAllActive(): Array<{
    id: string;
    dbSessionId?: number;
    userId: number;
    assetId: number;
    protocol: string;
    startTime: Date;
    lastActivity: Date;
    clientIp?: string;
  }> {
    const result: any[] = [];
    for (const s of this.sessions.values()) {
      result.push({
        id: s.id,
        dbSessionId: s.dbSessionId,
        userId: s.userId,
        assetId: s.assetId,
        protocol: s.protocol,
        startTime: s.startTime,
        lastActivity: s.lastActivity,
        clientIp: s.clientIp,
      });
    }
    return result;
  }

  updateActivity(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.lastActivity = new Date();

    // Reset idle timer
    if (session.idleTimer) clearTimeout(session.idleTimer);
    this.startIdleTimer(id);
  }

  /**
   * Terminate a session by manager ID or database session ID.
   * Sends a disconnect message and cleans up.
   */
  async terminate(idOrDbId: string | number, terminatedBy: string): Promise<void> {
    let session: ActiveSession | undefined;

    if (typeof idOrDbId === 'string') {
      session = this.sessions.get(idOrDbId);
    } else {
      // Find by DB session ID
      for (const s of this.sessions.values()) {
        if (s.dbSessionId === idOrDbId) {
          session = s;
          break;
        }
      }
    }

    if (!session) {
      logger.warn({ idOrDbId }, 'Session not found for termination');
      return;
    }

    if (session.terminating) return;
    session.terminating = true;

    const { id, ws, sshClient, guacClient, dbSessionId } = session;

    // Send disconnect message to client
    try {
      ws.send(JSON.stringify({
        type: 'disconnected',
        reason: terminatedBy,
        message: `会话已被${terminatedBy === 'admin' ? '管理员' : terminatedBy === 'timeout' ? '超时' : '系统'}断开`,
      }));
    } catch {
      // ws may already be closed
    }

    // Close SSH/Guac connection
    if (sshClient) {
      try { sshClient.end(); } catch { /* ignore */ }
    }
    if (guacClient) {
      try { guacClient.close?.(); } catch { /* ignore */ }
    }

    // Close WS
    try { ws.close(); } catch { /* ignore */ }

    // Update database
    if (dbSessionId) {
      try {
        const durationSec = Math.round((Date.now() - session.startTime.getTime()) / 1000);
        await pool.query(
          `UPDATE sessions SET status = ?, end_time = NOW(3), duration_sec = ?, termination_by = ? WHERE id = ?`,
          [terminatedBy === 'timeout' ? 'timeout' : 'terminated', durationSec, terminatedBy, dbSessionId]
        );
      } catch (err) {
        logger.error({ err, dbSessionId }, 'Failed to update session on termination');
      }
    }

    this.remove(id);
  }

  /**
   * Wait for all active sessions to close (with timeout).
   * Used during graceful shutdown.
   */
  async drain(timeoutMs: number): Promise<void> {
    if (this.sessions.size === 0) return;

    logger.info({ count: this.sessions.size }, 'Draining active sessions...');

    // Notify all connected clients
    for (const [id, session] of this.sessions) {
      try {
        session.ws.send(JSON.stringify({
          type: 'alert',
          level: 'warning',
          message: '服务器正在关闭，会话即将断开...',
        }));
      } catch { /* ignore */ }
    }

    // Wait up to timeoutMs
    const deadline = Date.now() + timeoutMs;
    while (this.sessions.size > 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Force-terminate remaining sessions
    for (const [id] of this.sessions) {
      logger.warn({ sessionId: id }, 'Force-terminating session during drain');
      this.remove(id);
    }
  }

  /**
   * Broadcast a message to all connected sessions.
   */
  broadcast(message: Record<string, any>): void {
    const data = JSON.stringify(message);
    for (const [, session] of this.sessions) {
      try {
        session.ws.send(data);
      } catch { /* ignore */ }
    }
  }

  // ---- Private helpers ----

  private clearTimers(session: ActiveSession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.maxTimer) clearTimeout(session.maxTimer);
  }

  private startIdleTimer(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.idleTimer = setTimeout(() => {
      logger.info({ sessionId: id }, 'Session idle timeout, terminating');
      this.terminate(id, 'timeout');
    }, config.session.idleTimeout * 1000);
  }

  private startMaxTimer(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.maxTimer = setTimeout(() => {
      logger.info({ sessionId: id }, 'Session max duration reached, terminating');
      this.terminate(id, 'timeout');
    }, config.session.maxDuration * 1000);
  }
}

export const sessionManager = new SessionManager();
export default SessionManager;
