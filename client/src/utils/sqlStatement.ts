import type { editor } from 'monaco-editor';

interface StatementRange {
  start: number;
  end: number;
  text: string;
}

/** Split SQL text into statements by semicolon (simple, ignores strings). */
function splitStatements(text: string): StatementRange[] {
  const statements: StatementRange[] = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';

    if (ch === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;

    // Line comment
    if (ch === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    if (ch === ';') {
      const raw = text.slice(start, i);
      const trimmed = raw.trim();
      if (trimmed) {
        statements.push({ start, end: i + 1, text: trimmed });
      }
      start = i + 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail) {
    statements.push({ start, end: text.length, text: tail });
  }

  return statements;
}

/** Return the SQL statement that contains the cursor, or the nearest non-empty statement. */
export function getStatementAtCursor(
  model: editor.ITextModel,
  position: { lineNumber: number; column: number }
): string {
  const fullText = model.getValue();
  const offset = model.getOffsetAt(position);
  const statements = splitStatements(fullText);

  if (statements.length === 0) return fullText.trim();

  for (const stmt of statements) {
    if (offset >= stmt.start && offset <= stmt.end) {
      return stmt.text;
    }
  }

  // Cursor in whitespace between statements — pick closest by line
  const lineStart = model.getOffsetAt({ lineNumber: position.lineNumber, column: 1 });
  let best = statements[0];
  let bestDist = Infinity;
  for (const stmt of statements) {
    const mid = (stmt.start + stmt.end) / 2;
    const dist = Math.abs(lineStart - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = stmt;
    }
  }
  return best.text;
}

export function getSqlToExecute(
  ed: editor.IStandaloneCodeEditor | null,
  fallbackSql: string
): string {
  if (!ed) return fallbackSql.trim();

  const model = ed.getModel();
  if (!model) return fallbackSql.trim();

  const selection = ed.getSelection();
  if (selection && !selection.isEmpty()) {
    return model.getValueInRange(selection).trim();
  }

  const pos = ed.getPosition();
  if (!pos) return fallbackSql.trim();

  return getStatementAtCursor(model, pos).trim();
}
