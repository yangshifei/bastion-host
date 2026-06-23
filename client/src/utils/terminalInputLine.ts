import type { Terminal } from 'xterm';

const PROMPT_SUFFIX = /(?:\][#$]|[$#%>])\s+(.*)$/;

/**
 * Read the current shell input line from xterm (prompt stripped).
 * Used when server-side buffering cannot see history-recalled lines.
 */
export function getTerminalInputLine(term: Terminal): string {
  const buf = term.buffer.active;
  const row = buf.getLine(buf.cursorY);
  if (!row) return '';

  const line = row.translateToString(false, 0, buf.cursorX);
  const match = line.match(PROMPT_SUFFIX);
  if (match) return match[1]!.replace(/\s+$/, '');

  return line.replace(/\s+$/, '');
}

/** True when data ends with an Enter key (CR and/or LF). */
export function isEnterKey(data: string): boolean {
  return /[\r\n]$/.test(data);
}
