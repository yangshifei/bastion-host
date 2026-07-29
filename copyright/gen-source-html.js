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

// Collect all source files with content (blank lines stripped)
let allLines = [];
let fileBoundaries = []; // index in allLines where each file starts

for (const f of [...serverFiles, ...clientFiles]) {
  const code = fs.readFileSync(f, 'utf8');
  const lines = code.split('\n').filter(l => l.trim() !== ''); // strip blank lines
  const relPath = f.replace(baseDir, '').replace(/\\/g, '/').replace(/^\/server\/src\//, 'server/').replace(/^\/client\/src\//, 'client/');
  if (lines.length < 3) continue; // skip tiny files

  fileBoundaries.push({ start: allLines.length, path: relPath, count: lines.length });

  // Add file header comment and code lines
  allLines.push('// ' + relPath);
  allLines.push('');
  for (const l of lines) {
    allLines.push(l);
  }
  allLines.push(''); // separator between files
}

// Page layout: 微软雅黑 六号 (7.5pt), A4 paper
// A4: 210mm x 297mm, printable ~190mm x 267mm with margins
// At 7.5pt line height (~10pt with spacing): ~60 lines per page
const LINES_PER_PAGE = 58;
const TOTAL_PAGES = 60;
const TOTAL_LINES = LINES_PER_PAGE * TOTAL_PAGES; // 3480 lines

// Ensure we start at beginning of a file and end at end of a file
// Find the closest file boundary near the end
let endCut = TOTAL_LINES;
for (let i = fileBoundaries.length - 1; i >= 0; i--) {
  const b = fileBoundaries[i];
  const fileEnd = b.start + 2 + b.count; // header + blank + code lines
  if (fileEnd <= TOTAL_LINES + LINES_PER_PAGE && fileEnd >= TOTAL_LINES - LINES_PER_PAGE) {
    endCut = fileEnd;
    break;
  }
}
// If no good boundary, use the last file's end
if (endCut === TOTAL_LINES) {
  const lastB = fileBoundaries[fileBoundaries.length - 1];
  endCut = lastB.start + 2 + lastB.count;
}

const selectedLines = allLines.slice(0, endCut);

// Now split into pages
let pages = [];
for (let i = 0; i < selectedLines.length; i += LINES_PER_PAGE) {
  pages.push(selectedLines.slice(i, i + LINES_PER_PAGE));
}

// Pad or trim to exactly 60 pages
while (pages.length < TOTAL_PAGES) {
  pages.push(['// (end of document)', '']);
}
pages = pages.slice(0, TOTAL_PAGES);

console.log('Total pages:', pages.length);
console.log('Total code lines:', selectedLines.length);

// Generate HTML
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let html = `<\!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>堡垒机安全远程运维管理平台 V1.0 - 源代码文档</title>
<style>
  @page {
    size: A4;
    margin: 15mm 12mm 15mm 12mm;
  }
  body {
    font-family: 'Microsoft YaHei', '微软雅黑', sans-serif;
    font-size: 7.5pt;
    line-height: 1.4;
    color: #000;
    margin: 0;
    padding: 0;
  }
  .page {
    page-break-after: always;
    padding: 0;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .header {
    text-align: center;
    border-bottom: 1px solid #000;
    padding-bottom: 4px;
    margin-bottom: 8px;
    font-size: 8pt;
  }
  .header .title {
    font-weight: bold;
  }
  .code {
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'Consolas', 'Courier New', 'Microsoft YaHei', monospace;
    margin: 0;
    padding: 0;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
`;

for (let p = 0; p < pages.length; p++) {
  const pageNum = p + 1;
  html += '<div class="page">\n';
  html += '<div class="header">\n';
  html += '  <span class="title">堡垒机安全远程运维管理平台 V1.0</span> &mdash; 源代码文档 &mdash; 第 ' + pageNum + ' 页 / 共 ' + pages.length + ' 页\n';
  html += '</div>\n';
  html += '<div class="code">';
  for (const line of pages[p]) {
    html += escapeHtml(line) + '\n';
  }
  html += '</div>\n';
  html += '</div>\n';
}

html += '</body>\n</html>';

const outPath = path.join(__dirname, 'source-code.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('HTML written to:', outPath);
console.log('File size:', (fs.statSync(outPath).size / 1024).toFixed(1) + 'KB');
