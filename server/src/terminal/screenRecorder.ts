import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Records terminal sessions in asciicast v2 format.
 * Format: JSONL file where each line is [time_in_seconds, event_type, data]
 */
export class ScreenRecorder {
  private stream: fs.WriteStream | null = null;
  private filePath: string;
  private startTime: number;

  constructor(sessionId: string, width = 80, height = 24) {
    const dir = path.resolve(process.cwd(), 'recordings');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.filePath = path.join(dir, `${sessionId}.cast`);
    this.startTime = Date.now();

    this.stream = fs.createWriteStream(this.filePath, { flags: 'w' });

    // Write asciicast v2 header
    const header = {
      version: 2,
      width,
      height,
      timestamp: Math.floor(Date.now() / 1000),
      title: `Session ${sessionId}`,
    };
    this.stream.write(JSON.stringify(header) + '\n');

    logger.info({ filePath: this.filePath }, 'Recording started');
  }

  /**
   * Write an event to the recording.
   * @param data - The string data
   * @param type - 'o' for output, 'i' for input
   */
  write(data: string, type: 'o' | 'i' = 'o'): void {
    if (!this.stream) return;

    const elapsed = (Date.now() - this.startTime) / 1000;
    const event = [elapsed.toFixed(6), type, data];
    this.stream.write(JSON.stringify(event) + '\n');
  }

  /**
   * Close the recording stream.
   */
  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
      logger.info({ filePath: this.filePath }, 'Recording saved');
    }
  }

  /**
   * Get the file path for the recording.
   */
  getPath(): string {
    return this.filePath;
  }
}
