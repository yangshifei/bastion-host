import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import pool from '../database/connection';
import { decrypt } from '../utils/crypto';
import logger from '../utils/logger';
import { SessionManager } from './sessionManager';
import { RdpRecorder } from './rdpRecorder';
import { JwtPayload } from '../middleware/auth';
import { recordAudit } from '../middleware/audit';

const GUAC_CLIENT_OPTIONS = {
  connectionDefaultSettings: {
    rdp: {
      port: '3389',
      width: 1024,
      height: 768,
      dpi: 96,
      audio: ['audio/L16'],
      video: null,
      image: ['image/png', 'image/jpeg'],
      timezone: null,
      'resize-method': 'display-update',
      'color-depth': 32,
    },
  },
  allowedUnencryptedConnectionSettings: {
    rdp: [
      'width', 'height', 'dpi', 'audio', 'video', 'image', 'timezone',
      'GUAC_AUDIO', 'GUAC_VIDEO',
    ],
    join: ['width', 'height', 'dpi', 'audio', 'video', 'image', 'timezone', 'GUAC_AUDIO', 'GUAC_VIDEO'],
  },
};

function buildRdpSettings(asset: any, password: string) {
  return {
    hostname: asset.host,
    port: String(asset.port),
    username: asset.username || 'Administrator',
    password: password,
    'ignore-cert': 'true',
    security: 'any',
    'enable-wallpaper': 'false',
    'enable-font-smoothing': 'true',
    'resize-method': 'display-update',
    'color-depth': 32,
    width: 1024,
    height: 768,
  };
}

async function finalizeSession(
  dbSessionId: number,
  durationSec: number,
  recordingEnabled: boolean,
  recordingFilePath: string | null,
  recorder: RdpRecorder
): Promise<void> {
  recorder.close();

  let recordingPath: string | null = null;
  if (recordingEnabled && recordingFilePath) {
    const ready = await RdpRecorder.waitForFile(recordingFilePath);
    if (ready) {
      recordingPath = recordingFilePath;
    } else {
      logger.warn({ recordingFilePath }, 'RDP recording file missing or empty');
    }
  }

  if (recordingPath) {
    await pool.query(
      `UPDATE sessions SET
        end_time = COALESCE(end_time, NOW(3)),
        duration_sec = COALESCE(duration_sec, ?),
        recording_path = ?,
        status = CASE WHEN status = 'active' THEN 'closed' ELSE status END,
        termination_by = COALESCE(termination_by, 'user')
       WHERE id = ? AND status IN ('active', 'closed', 'terminated', 'timeout')`,
      [durationSec, recordingPath, dbSessionId]
    ).catch((err) => {
      logger.error({ err, dbSessionId }, 'Failed to finalize RDP session with recording');
    });
  } else {
    await pool.query(
      `UPDATE sessions SET
        end_time = COALESCE(end_time, NOW(3)),
        duration_sec = COALESCE(duration_sec, ?),
        status = CASE WHEN status = 'active' THEN 'closed' ELSE status END,
        termination_by = COALESCE(termination_by, 'user')
       WHERE id = ? AND status IN ('active', 'closed', 'terminated', 'timeout')`,
      [durationSec, dbSessionId]
    ).catch((err) => {
      logger.error({ err, dbSessionId }, 'Failed to finalize RDP session');
    });
  }
}

export async function handleRDPConnection(
  ws: WebSocket,
  request: IncomingMessage,
  sessionManager: SessionManager
): Promise<void> {
  let connection: any = null;
  let sessionId: string | null = uuidv4();
  let dbSessionId: number | null = null;
  let userId: number | null = null;
  let assetId: number | null = null;
  let logged = false;
  let recordingEnabled = false;
  let recordingFilePath: string | null = null;
  // Create recorder + hook WebSocket immediately so the initial Guacamole
  // handshake (including the "size" display instruction) is captured.
  // If the asset has recording disabled, we discard it in setup().
  const recorder = new RdpRecorder(sessionId);
  RdpRecorder.hookWebSocket(ws, recorder);

  const url = new URL(request.url || '', `http://${request.headers.host}`);
  let token = url.searchParams.get('token');
  let assetIdParam = url.searchParams.get('assetId');

  if (!assetIdParam && token && token.includes('assetId=')) {
    const inner = new URLSearchParams(token);
    assetIdParam = inner.get('assetId');
    token = inner.get('token');
  }

  if (!token) { ws.close(4008, '缺少认证令牌'); return; }
  if (!assetIdParam) { ws.close(4008, '缺少资产ID'); return; }

  assetId = parseInt(assetIdParam, 10);
  if (isNaN(assetId)) { ws.close(4008, '无效的资产ID'); return; }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    ws.close(4008, '认证令牌无效或已过期');
    return;
  }

  userId = decoded.userId;

  async function setup(): Promise<void> {
    try {
      if (sessionManager.getActiveCountForUser(userId!) >= config.session.maxPerUser) {
        ws.close(4008, '已达到最大并发会话数');
        return;
      }

      // RDP: only one active session per asset
      for (const s of sessionManager.getAllActive()) {
        if (s.assetId === assetId && s.protocol === 'rdp') {
          ws.close(4008, '该资产正在被其他用户使用中，暂不可连接');
          return;
        }
      }

      const [assets] = await pool.query<any[]>(
        'SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', [assetId]
      );
      if (assets.length === 0) { ws.close(4008, '资产不存在'); return; }

      const asset = assets[0];
      if (asset.protocol !== 'rdp') { ws.close(4008, '不是 RDP 协议'); return; }

      if (decoded.role !== 'admin') {
        const [authz] = await pool.query<any[]>(
          `SELECT * FROM authorizations WHERE user_id = ? AND asset_id = ?
           AND (start_time IS NULL OR start_time <= NOW())
           AND (end_time IS NULL OR end_time >= NOW())`,
          [userId, assetId]
        );
        if (authz.length === 0) { ws.close(4008, '无访问权限'); return; }
      }

      const password = asset.password_encrypted ? decrypt(asset.password_encrypted) : '';

      recordingEnabled = asset.recording_enabled !== 0 && asset.recording_enabled !== false;

      if (recordingEnabled) {
        recordingFilePath = recorder.getPath();
      } else {
        recorder.discard();
      }

      const [result] = await pool.query<any>(
        `INSERT INTO sessions (user_id, asset_id, protocol, start_time, status, client_ip)
         VALUES (?, ?, 'rdp', NOW(3), 'active', ?)`,
        [userId, assetId, request.socket.remoteAddress || null]
      );
      dbSessionId = result.insertId;

      sessionManager.create({
        id: sessionId!, dbSessionId: dbSessionId!, userId: userId!,
        assetId: assetId!, protocol: 'rdp', ws,
        startTime: new Date(), lastActivity: new Date(),
        clientIp: request.socket.remoteAddress,
      });

      const ClientConnection = require('guacamole-lite/lib/ClientConnection');
      const Crypt = require('guacamole-lite/lib/Crypt');

      const cryptKey = config.encryption.secret.slice(0, 32);
      const crypt = new Crypt('aes-256-cbc', cryptKey);
      const rdpSettings = buildRdpSettings(asset, password);
      const encToken = crypt.encrypt({
        connection: {
          type: 'rdp',
          settings: rdpSettings,
        },
      });

      connection = new ClientConnection(
        {
          ...GUAC_CLIENT_OPTIONS,
          connection: {
            type: 'rdp',
            settings: rdpSettings,
          },
          crypt: { cypher: 'aes-256-cbc', key: cryptKey },
          log: { level: 'ERRORS', stdLog: () => {}, errorLog: (msg: string) => logger.error(msg) },
        },
        sessionId,
        ws,
        { token: encToken },
        {
          processConnectionSettings: (settings: any, cb: Function) => {
            cb(null, settings);
          },
        }
      );

      connection.connect({ host: config.guacd.host, port: config.guacd.port });

      const managed = sessionManager.get(sessionId!);
      if (managed) managed.guacClient = connection;

      const activityInterval = setInterval(() => {
        if (connection && connection.lastActivity) {
          sessionManager.updateActivity(sessionId!);
        }
      }, 30000);

      connection.on('close', () => {
        clearInterval(activityInterval);
        cleanup();
      });

      connection.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'ClientConnection error');
        clearInterval(activityInterval);
        cleanup();
      });

      recordAudit({
        userId, username: decoded.username, action: 'connect',
        targetType: 'asset', targetId: assetId, ip: request.socket.remoteAddress,
      });

      logger.info({ sessionId, userId, recordingEnabled, protocol: 'rdp' }, 'RDP session created');
    } catch (err: any) {
      logger.error({ err: err.message }, 'RDP setup failed');
      recorder.discard();
      ws.close(4000, '连接失败');
    }
  }

  setup();

  ws.on('close', () => cleanup());
  ws.on('error', (err) => { logger.error({ err }, 'WS error'); cleanup(); });

  function cleanup(): void {
    if (logged) return;
    logged = true;

    if (connection) {
      try { connection.close(); } catch { /* ignore */ }
    }

    if (dbSessionId) {
      const dur =
        sessionId && sessionManager.get(sessionId)
          ? Math.round((Date.now() - sessionManager.get(sessionId)!.startTime.getTime()) / 1000)
          : 0;

      finalizeSession(dbSessionId, dur, recordingEnabled, recordingFilePath, recorder).catch((err) => {
        logger.error({ err, dbSessionId }, 'RDP session finalize failed');
      });
    } else {
      recorder.discard();
    }

    if (sessionId) sessionManager.remove(sessionId);
  }
}
