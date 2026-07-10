import { cpSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/monaco-editor/min/vs');
const dest = join(root, 'public/monaco-editor/min/vs');

if (!existsSync(src)) {
  console.warn('[copy-monaco] monaco-editor not installed, skipping');
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[copy-monaco] copied to public/monaco-editor/min/vs');
