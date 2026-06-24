import fs from 'fs';
import path from 'path';
import { RawData } from 'ws';
import logger from '../utils/logger';

/**
 * Record Guacamole display stream (server→client) via ClientConnection.send.
 * Compatible with Guacamole.SessionRecording playback.
 */
export class RdpRecorder {
  private stream: fs.WriteStream | null = null;
  private readonly filePath: string;
  private closed = false;

  constructor(sessionId: string) {
    const dir = path.resolve(process.cwd(), 'recordings');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, sessionId);
    this.stream = fs.createWriteStream(this.filePath, { flags: 'w' });
    logger.info({ filePath: this.filePath }, 'RDP recording started');
  }

  /** Hook ClientConnection.send so only Guacamole display data is recorded. */
  static hookConnectionSend(connection: { send: (message: string) => void }, recorder: RdpRecorder): void {
    const originalSend = connection.send.bind(connection);
    connection.send = (message: string) => {
      recorder.write(message);
      originalSend(message);
    };
  }

  write(data: RawData | string): void {
    if (!this.stream || this.closed) return;
    try {
      const text = toText(data);
      if (!text || text.startsWith('{')) return;
      if (!/^\d+\./.test(text.trimStart())) return;
      this.stream.write(text, 'utf8');
    } catch (err) {
      logger.warn({ err }, 'RDP recorder write failed');
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.stream) {
      this.stream.end();
      this.stream = null;
      logger.info({ filePath: this.filePath }, 'RDP recording saved');
    }
  }

  /** Stop recording and remove the file (asset has recording disabled). */
  discard(): void {
    const filePath = this.filePath;
    this.close();
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      logger.warn({ err, filePath }, 'Failed to discard RDP recording');
    }
  }

  getPath(): string {
    return this.filePath;
  }

  /** Wait until recording file exists and has content (guacd flush / stream close). */
  static async waitForFile(filePath: string, maxMs = 3000): Promise<boolean> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.size > 0) return true;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  }
}

function toText(data: RawData | string): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return String(data);
}
