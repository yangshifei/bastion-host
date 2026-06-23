import { checkDangerousCommand, RuleResult } from './dangerousCommands';

export interface CompletedCommand {
  line: string;
  check: RuleResult;
  /** If true, Enter was suppressed and Ctrl+C injected instead */
  blockedEnter: boolean;
}

export interface ProcessInputOptions {
  /** Client-reported line when Enter is pressed (covers shell history recall, etc.) */
  lineOnEnter?: string;
}

export interface ProcessInputResult {
  /** Bytes/chars to forward to the SSH stream */
  forward: string;
  completed: CompletedCommand[];
}

type EscapeAction =
  | 'ignore'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'delete'
  | 'up'
  | 'down'
  | 'paste_start'
  | 'paste_end';

function isCsiFinal(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x40 && code <= 0x7e;
}

function classifyCsi(body: string, final: string): EscapeAction {
  if (final === '~') {
    if (body === '200') return 'paste_start';
    if (body === '201') return 'paste_end';
    if (body === '1' || body === '7') return 'home';
    if (body === '4' || body === '8') return 'end';
    if (body === '3') return 'delete';
    return 'ignore';
  }

  if (final === 'D') return 'left';
  if (final === 'C') return 'right';
  if (final === 'A') return 'up';
  if (final === 'B') return 'down';
  if (final === 'H' && !body.includes(';')) return 'home';
  if (final === 'F') return 'end';

  return 'ignore';
}

function classifySs3(final: string): EscapeAction {
  if (final === 'D') return 'left';
  if (final === 'C') return 'right';
  if (final === 'A') return 'up';
  if (final === 'B') return 'down';
  if (final === 'H') return 'home';
  if (final === 'F') return 'end';
  return 'ignore';
}

function splitIncompleteEscape(data: string): [complete: string, pending: string] {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] !== '\x1b') continue;

    const tail = data.slice(i);
    if (tail.length === 1) {
      return [data.slice(0, i), tail];
    }

    if (tail[1] === '[') {
      const hasFinal = tail.slice(2).split('').some(isCsiFinal);
      if (!hasFinal) {
        return [data.slice(0, i), tail];
      }
      break;
    }

    if (tail[1] === 'O' && tail.length < 3) {
      return [data.slice(0, i), tail];
    }

    break;
  }

  return [data, ''];
}

/**
 * Accumulate terminal input into full command lines (split on Enter).
 * Tracks cursor position and parses ANSI/readline control sequences.
 */
export class CommandLineBuffer {
  private buffer = '';
  private cursor = 0;
  private pendingInput = '';
  private bracketedPaste = false;

  process(data: string, options: ProcessInputOptions = {}): ProcessInputResult {
    const completed: CompletedCommand[] = [];
    let forward = '';

    const merged = this.pendingInput + data;
    const [input, pending] = splitIncompleteEscape(merged);
    this.pendingInput = pending;

    for (let i = 0; i < input.length; ) {
      const char = input[i];

      if (char === '\x1b' || char === '\x9b') {
        const isC1 = char === '\x9b';
        const start = i;
        i += isC1 ? 1 : 1;

        if (isC1) {
          let body = '';
          while (i < input.length && !isCsiFinal(input[i])) {
            body += input[i];
            i++;
          }
          if (i >= input.length) {
            this.pendingInput = input.slice(start);
            break;
          }
          const final = input[i];
          i++;
          this.applyEscape(classifyCsi(body, final));
          forward += input.slice(start, i);
          continue;
        }

        const next = input[i];
        if (next === undefined) {
          this.pendingInput = input.slice(start);
          break;
        }

        if (next === '[') {
          i++;
          let body = '';
          while (i < input.length && !isCsiFinal(input[i])) {
            body += input[i];
            i++;
          }
          if (i >= input.length) {
            this.pendingInput = input.slice(start);
            break;
          }
          const final = input[i];
          i++;
          this.applyEscape(classifyCsi(body, final));
          forward += input.slice(start, i);
          continue;
        }

        if (next === 'O') {
          i++;
          const final = input[i];
          if (final === undefined) {
            this.pendingInput = input.slice(start);
            break;
          }
          i++;
          this.applyEscape(classifySs3(final));
          forward += input.slice(start, i);
          continue;
        }

        i++;
        forward += input.slice(start, i);
        continue;
      }

      if (char === '\r' || char === '\n') {
        if (char === '\n' && i > 0 && input[i - 1] === '\r') {
          i++;
          continue;
        }

        const line = this.resolveLine(options.lineOnEnter);
        this.clearLine();

        if (line) {
          const check = checkDangerousCommand(line);
          if (check.blocked) {
            completed.push({ line, check, blockedEnter: true });
            forward += '\x03';
            i++;
            continue;
          }
          completed.push({ line, check, blockedEnter: false });
        }

        forward += char;
        i++;
        continue;
      }

      if (char === '\x7f' || char === '\b') {
        this.backspace();
        forward += char;
        i++;
        continue;
      }

      if (char === '\x03') {
        this.clearLine();
        forward += char;
        i++;
        continue;
      }

      if (char === '\x15') {
        this.clearLine();
        forward += char;
        i++;
        continue;
      }

      if (char === '\x01') {
        this.cursor = 0;
        forward += char;
        i++;
        continue;
      }

      if (char === '\x05') {
        this.cursor = this.buffer.length;
        forward += char;
        i++;
        continue;
      }

      if (char === '\x02') {
        this.moveCursor(-1);
        forward += char;
        i++;
        continue;
      }

      if (char === '\x06') {
        this.moveCursor(1);
        forward += char;
        i++;
        continue;
      }

      if (char === '\x0b') {
        this.buffer = this.buffer.slice(0, this.cursor);
        forward += char;
        i++;
        continue;
      }

      if (char === '\x17') {
        this.killWordBackward();
        forward += char;
        i++;
        continue;
      }

      if (char === '\x04') {
        forward += char;
        i++;
        continue;
      }

      if (char === '\t' || (char >= ' ' && char !== '\x7f')) {
        this.insertAtCursor(char);
      }

      forward += char;
      i++;
    }

    return { forward, completed };
  }

  reset(): void {
    this.clearLine();
    this.pendingInput = '';
    this.bracketedPaste = false;
  }

  private resolveLine(lineOnEnter?: string): string {
    const local = this.buffer.trim();
    if (local) return local;
    return (lineOnEnter ?? '').trim();
  }

  private clearLine(): void {
    this.buffer = '';
    this.cursor = 0;
  }

  private insertAtCursor(text: string): void {
    if (!text) return;
    this.buffer =
      this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
  }

  private backspace(): void {
    if (this.cursor <= 0) return;
    this.buffer =
      this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
    this.cursor--;
  }

  private deleteForward(): void {
    if (this.cursor >= this.buffer.length) return;
    this.buffer =
      this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
  }

  private moveCursor(delta: number): void {
    this.cursor = Math.max(0, Math.min(this.buffer.length, this.cursor + delta));
  }

  private killWordBackward(): void {
    if (this.cursor === 0) return;

    let pos = this.cursor - 1;
    while (pos > 0 && /\s/.test(this.buffer[pos]!)) pos--;
    while (pos > 0 && !/\s/.test(this.buffer[pos - 1]!)) pos--;

    this.buffer = this.buffer.slice(0, pos) + this.buffer.slice(this.cursor);
    this.cursor = pos;
  }

  private applyEscape(action: EscapeAction): void {
    switch (action) {
      case 'left':
        this.moveCursor(-1);
        break;
      case 'right':
        this.moveCursor(1);
        break;
      case 'home':
        this.cursor = 0;
        break;
      case 'end':
        this.cursor = this.buffer.length;
        break;
      case 'delete':
        this.deleteForward();
        break;
      case 'up':
      case 'down':
        this.clearLine();
        break;
      case 'paste_start':
        this.bracketedPaste = true;
        break;
      case 'paste_end':
        this.bracketedPaste = false;
        break;
      default:
        break;
    }
  }
}
