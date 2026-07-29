const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist') continue;
    const fp = path.join(dir, item.name);
    if (item.isDirectory()) { files.push(...walk(fp)); continue; }
    if (/\.(ts|tsx)$/.test(item.name)) files.push(fp);
  }
  return files;
}

const baseDir = path.resolve(__dirname, '..');
const serverFiles = walk(path.join(baseDir, 'server', 'src')).sort();
const clientFiles = walk(path.join(baseDir, 'client', 'src')).sort();
const allFiles = [
  ...serverFiles.map(f => ({ path: f })),
  ...clientFiles.map(f => ({ path: f })),
];

const PAGE_LINES = 55;
const FF = '\x0C';
let out = '';
let pageNum = 0;

function pad(n, w) { return String(n).padStart(w, ' '); }

function addPage(body, title) {
  pageNum++;
  const breakMarker = pageNum > 1 ? '\n' + FF + '\n' : '';
  out += breakMarker +
    '============================================================\n' +
    '  堡垒机安全远程运维管理平台 V1.0         第 ' + pad(pageNum, 3) + ' 页\n' +
    '  源代码文档 - ' + title + '\n' +
    '============================================================\n\n' +
    body;
}

// Render all files as one continuous stream, splitting at page boundary
let pageBuf = '';
let pageLines = 0;

function flushPage(title) {
  if (pageBuf.trim()) {
    addPage(pageBuf, title || 'project source');
    pageBuf = '';
    pageLines = 0;
  }
}

for (const file of allFiles) {
  const code = fs.readFileSync(file.path, 'utf8');
  let relPath = file.path.replace(baseDir, '').replace(/\\/g, '/').replace(/^\/server\/src\//, 'server/').replace(/^\/client\/src\//, 'client/');
  const totalLineCount = code.split('\n').length;
  const fileHeader = '// File: ' + relPath + ' (' + totalLineCount + ' lines)\n\n';

  // Split code into lines
  const allCodeLines = code.split('\n');

  // If adding fileHeader alone would exceed the page, flush
  if (pageLines + fileHeader.split('\n').length > PAGE_LINES) {
    flushPage();
  }

  let offset = 0;
  let isFirstChunk = true;

  while (offset < allCodeLines.length) {
    let hdr = isFirstChunk ? fileHeader : ('// (continued) ' + relPath + '\n\n');
    let remainingLines = allCodeLines.length - offset;
    let space = PAGE_LINES - pageLines - hdr.split('\n').length - 1; // -1 for safety

    if (space <= 0) {
      flushPage();
      hdr = isFirstChunk ? fileHeader : ('// (continued) ' + relPath + '\n\n');
      space = PAGE_LINES - hdr.split('\n').length - 1;
    }

    let take = Math.min(remainingLines, space);
    if (take <= 0) take = Math.min(remainingLines, PAGE_LINES - 5); // force some content

    let chunk = allCodeLines.slice(offset, offset + take).join('\n');
    if (offset + take < allCodeLines.length) {
      chunk += '\n// --- continued on next page ---';
    }

    pageBuf += hdr + chunk + '\n';
    pageLines = (pageBuf + '\n').split('\n').length; // recalculate
    offset += take;
    isFirstChunk = false;

    // If more to write for this file, flush and continue
    if (offset < allCodeLines.length) {
      flushPage();
    }
  }
}

flushPage();

fs.writeFileSync(path.join(__dirname, 'source-code.txt'), out, 'utf8');
console.log('Done. Total pages:', pageNum);
console.log('File size:', (fs.statSync(path.join(__dirname, 'source-code.txt')).size / 1024).toFixed(1) + 'KB');
