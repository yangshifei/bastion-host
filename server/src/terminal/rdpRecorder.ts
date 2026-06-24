import fs from 'fs';
import path from 'path';
import { WebSocket, RawData } from 'ws';
import logger from '../utils/logger';

/**
 * Record Guacamole display stream (server→client) by tapping ws.send.
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

  /** Wrap a WebSocket to capture server→client Guacamole protocol (display stream). */
  static attach(ws: WebSocket, sessionId: string): RdpRecorder {
    const recorder = new RdpRecorder(sessionId);

    const originalSend = ws.send.bind(ws);
    ws.send = function sendWithRecord(
      data: any,
      optionsOrCb?: any,
      cb?: any
    ): void {
      recorder.write(data);
      if (typeof optionsOrCb === 'function') {
        originalSend(data, optionsOrCb);
      } else if (cb !== undefined) {
        originalSend(data, optionsOrCb, cb);
      } else if (optionsOrCb !== undefined) {
        originalSend(data, optionsOrCb);
      } else {
        originalSend(data);
      }
    };

    ws.on('close', () => {
      recorder.close();
    });

    return recorder;
  }

  write(data: RawData): void {
    if (!this.stream || this.closed) return;
    try {
      const chunk = toBuffer(data);
      if (chunk.length > 0) {
        this.stream.write(chunk);
      }
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

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from(String(data));
}
