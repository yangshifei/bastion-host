import { WebSocket } from 'ws';
import { Client } from 'ssh2';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import pool from '../database/connection';
import { decrypt } from '../utils/crypto';
import logger from '../utils/logger';
import { SessionManager } from './sessionManager';
import { checkDangerousCommand } from './dangerousCommands';
import { CommandLineBuffer } from './commandLineBuffer';
import { ScreenRecorder } from './screenRecorder';
import { JwtPayload } from '../middleware/auth';
import { recordAudit } from '../middleware/audit';

export function handleSSHConnection(ws: WebSocket, request: IncomingMessage, sessionManager: SessionManager): void {
  let sshClient: Client | null = null;
  let stream: any = null;
  let recorder: ScreenRecorder | null = null;
  let sessionId: string | null = null;
  let dbSessionId: number | null = null;
  let userId: number | null = null;
  let username: string | null = null;
  let assetId: number | null = null;
  let logged = false;
  const commandLineBuffer = new CommandLineBuffer();

  async function logCommand(line: string, check: ReturnType<typeof checkDangerousCommand>): Promise<void> {
    if (!dbSessionId) return;

    await pool.query(
      `INSERT INTO command_logs (session_id, timestamp, command, is_dangerous, is_blocked, risk_level)
       VALUES (?, NOW(3), ?, ?, ?, ?)`,
      [
        dbSessionId,
        line,
        check.isDangerous ? 1 : 0,
        check.blocked ? 1 : 0,
        check.level ?? null,
      ]
    ).catch(() => {});

    await pool.query(
      'UPDATE sessions SET command_count = command_count + 1 WHERE id = ?',
      [dbSessionId]
    ).catch(() => {});
  }

  function send(data: Record<string, any>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  ws.on('message', async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send({ type: 'error', message: '无效的消息格式' });
      return;
    }

    const { type } = msg;

    // ---- PING ----
    if (type === 'ping') {
      send({ type: 'pong' });
      if (sessionId) sessionManager.updateActivity(sessionId);
      return;
    }

    // ---- CONNECT ----
    if (type === 'connect') {
      // Verify JWT from query string
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        send({ type: 'error', message: '缺少认证令牌' });
        ws.close();
        return;
      }

      let decoded: JwtPayload;
      try {
        decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      } catch {
        send({ type: 'error', message: '认证令牌无效或已过期' });
        ws.close();
        return;
      }

      userId = decoded.userId;
      username = decoded.username;
      assetId = msg.assetId;

      if (!assetId) {
        send({ type: 'error', message: '缺少资产 ID' });
        return;
      }

      // Check concurrent session limit
      const activeCount = sessionManager.getActiveCountForUser(userId);
      if (activeCount >= config.session.maxPerUser) {
        send({ type: 'error', message: `已达到最大并发会话数 (${config.session.maxPerUser})` });
        return;
      }

      // Query asset
      try {
        const [assets] = await pool.query<any[]>(
          'SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL',
          [assetId]
        );

        if (assets.length === 0) {
          send({ type: 'error', message: '资产不存在' });
          return;
        }

        const asset = assets[0];

        if (asset.protocol !== 'ssh') {
          send({ type: 'error', message: '该资产不是 SSH 协议' });
          return;
        }

        // Check authorization (admin bypasses)
        if (decoded.role !== 'admin') {
          const [authz] = await pool.query<any[]>(
            `SELECT * FROM authorizations WHERE user_id = ? AND asset_id = ?
             AND (start_time IS NULL OR start_time <= NOW())
             AND (end_time IS NULL OR end_time >= NOW())`,
            [userId, assetId]
          );
          if (authz.length === 0) {
            send({ type: 'error', message: '您没有该资产的访问权限' });
            return;
          }
        }

        // Decrypt credentials
        let password: string | undefined;
        let privateKey: string | undefined;

        if (asset.password_encrypted) {
          password = decrypt(asset.password_encrypted);
        }
        if (asset.private_key_encrypted) {
          privateKey = decrypt(asset.private_key_encrypted);
        }

        // Create SSH client
        sshClient = new Client();
        sessionId = uuidv4();

        // Create DB session record
        const [result] = await pool.query<any>(
          `INSERT INTO sessions (user_id, asset_id, protocol, start_time, status, client_ip)
           VALUES (?, ?, 'ssh', NOW(3), 'active', ?)`,
          [userId, assetId, request.socket.remoteAddress || null]
        );
        dbSessionId = result.insertId;

        // Create recorder when asset has recording enabled
        const recordingEnabled = asset.recording_enabled !== 0 && asset.recording_enabled !== false;
        if (recordingEnabled) {
          recorder = new ScreenRecorder(sessionId);
        }

        // Register in session manager
        sessionManager.create({
          id: sessionId,
          dbSessionId: dbSessionId!,
          userId: userId!,
          assetId: assetId!,
          protocol: 'ssh',
          ws,
          sshClient,
          startTime: new Date(),
          lastActivity: new Date(),
          clientIp: request.socket.remoteAddress,
        });

        // SSH connection options
        const sshConfig: any = {
          host: asset.host,
          port: asset.port,
          username: asset.username || 'root',
          readyTimeout: 10000,
          keepaliveInterval: 30000,
        };

        if (privateKey) {
          sshConfig.privateKey = privateKey;
          if (password) sshConfig.passphrase = password;
        } else if (password) {
          sshConfig.password = password;
        }

        sshClient.on('ready', () => {
          sshClient!.shell(
            {
              term: 'xterm-256color',
              cols: msg.cols || 80,
              rows: msg.rows || 24,
            },
            (err, s) => {
              if (err) {
                send({ type: 'error', message: '打开 Shell 失败: ' + err.message });
                return;
              }

              stream = s;
              send({
                type: 'connected',
                sessionId,
                cols: msg.cols || 80,
                rows: msg.rows || 24,
              });

              // Stream output -> client
              stream.on('data', (data: Buffer) => {
                const output = data.toString('utf8');
                send({ type: 'output', data: output });
                if (recorder) recorder.write(output, 'o');
                if (sessionId) sessionManager.updateActivity(sessionId);
              });

              // Stream close
              stream.on('close', () => {
                send({ type: 'disconnected', reason: 'ssh_stream_closed' });
                cleanup();
              });

              // Record audit
              recordAudit({
                userId,
                username,
                action: 'connect',
                targetType: 'asset',
                targetId: assetId,
                ip: request.socket.remoteAddress,
              });
            }
          );
        });

        sshClient.on('error', (err) => {
          send({ type: 'error', message: 'SSH 连接错误: ' + err.message });
        });

        sshClient.on('close', () => {
          send({ type: 'disconnected', reason: 'ssh_closed' });
          cleanup();
        });

        sshClient.connect(sshConfig);
      } catch (err: any) {
        send({ type: 'error', message: '连接失败: ' + err.message });
      }

      return;
    }

    // ---- INPUT ----
    if (type === 'input' && stream) {
      const input = msg.data as string;
      const lineOnEnter =
        typeof msg.lineOnEnter === 'string' ? msg.lineOnEnter : undefined;
      const { forward, completed } = commandLineBuffer.process(input, { lineOnEnter });

      if (forward) {
        stream.write(forward);
        if (recorder) recorder.write(forward, 'i');
      }
      if (sessionId) sessionManager.updateActivity(sessionId);

      for (const item of completed) {
        if (item.blockedEnter) {
          send({
            type: 'alert',
            level: 'error',
            message: item.check.message || '危险命令已拦截',
          });
          if (recorder) recorder.write(' [BLOCKED]\r\n', 'i');
        } else if (item.check.warning) {
          send({
            type: 'alert',
            level: 'warning',
            message: item.check.message || '请确认执行该命令',
          });
        }

        logCommand(item.line, item.check).catch(() => {});
      }

      return;
    }

    // ---- RESIZE ----
    if (type === 'resize' && stream) {
      const { cols, rows } = msg;
      if (cols && rows) {
        stream.setWindow(rows, cols);
      }
      if (sessionId) sessionManager.updateActivity(sessionId);
      return;
    }

    // ---- DISCONNECT ----
    if (type === 'disconnect') {
      cleanup();
      return;
    }
  });

  ws.on('close', () => {
    cleanup();
  });

  ws.on('error', (err) => {
    logger.error({ err }, 'WebSocket error');
    cleanup();
  });

  function cleanup(): void {
    if (logged) return;
    logged = true;
    commandLineBuffer.reset();

    // Close SSH
    if (sshClient) {
      try { sshClient.end(); } catch { /* ignore */ }
    }

    // Close recorder
    if (recorder) {
      const path = recorder.getPath();
      recorder.close();

      // Update DB with recording path (skip if already terminated by admin)
      if (dbSessionId) {
        pool.query(
          `UPDATE sessions SET status = 'closed', end_time = NOW(3), duration_sec = ?,
           recording_path = ?, termination_by = 'user'
           WHERE id = ? AND status = 'active'`,
          [
            sessionId ? Math.round((Date.now() - sessionManager.get(sessionId)!.startTime.getTime()) / 1000) : 0,
            path,
            dbSessionId,
          ]
        ).catch((err) => logger.error({ err }, 'Failed to update session'));
      }
    } else if (dbSessionId) {
      pool.query(
        `UPDATE sessions SET status = 'closed', end_time = NOW(3), termination_by = 'user'
         WHERE id = ? AND status = 'active'`,
        [dbSessionId]
      ).catch(() => {});
    }

    // Remove from manager
    if (sessionId) {
      sessionManager.remove(sessionId);
    }
  }
}
