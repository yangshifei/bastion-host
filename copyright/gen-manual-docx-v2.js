/*
 * 软著软件使用说明书 Word 文档生成器 V2
 * 改进：生成可更新的目录、合并页眉页码、修复格式
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageNumber, PageBreak, BorderStyle,
  WidthType, ShadingType, HeadingLevel, TabStopType,
  LevelFormat, TableOfContents
} = require('docx');

const FONT_NAME = 'Microsoft YaHei';
const HEADER_TITLE = '杏林药安复购跟进系统软件使用说明书';

// A4 页面
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN_TOP = 1134;    // 20mm
const MARGIN_BOTTOM = 850;  // 15mm（减小给正文更多空间）
const MARGIN_LEFT = 1020;   // 18mm
const MARGIN_RIGHT = 1020;  // 18mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 9866

// ====== 解析 HTML 内容 ======
const html = fs.readFileSync('E:/vscodeai/copyright/manual.html', 'utf-8');

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—');
}

// 提取内联 HTML 标签（如 <strong>）生成 TextRun 数组
function createInlineRuns(text, fontSize = 21, baseBold = false) {
  // 用 <strong> 标签分割文本为粗体和普通部分
  const runs = [];
  // 处理 <strong>...</strong> 标签
  const regex = /<strong>(.*?)<\/strong>/g;
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    // 添加 match 之前的普通文本
    if (match.index > lastIndex) {
      const plainText = decodeEntities(text.substring(lastIndex, match.index));
      if (plainText) {
        runs.push(new TextRun({ text: plainText, font: FONT_NAME, size: fontSize, bold: baseBold }));
      }
    }
    // 添加粗体文本
    const boldText = decodeEntities(match[1]);
    if (boldText) {
      runs.push(new TextRun({ text: boldText, font: FONT_NAME, size: fontSize, bold: true }));
    }
    lastIndex = match.index + match[0].length;
  }
  
  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    const remaining = decodeEntities(text.substring(lastIndex));
    if (remaining) {
      runs.push(new TextRun({ text: remaining, font: FONT_NAME, size: fontSize, bold: baseBold }));
    }
  }
  
  // 如果没有匹配到任何 bold 标签，返回一个普通 run
  if (runs.length === 0) {
    runs.push(new TextRun({ text: decodeEntities(text), font: FONT_NAME, size: fontSize, bold: baseBold }));
  }
  
  return runs;
}

// 手动解析 HTML 结构
function parseHTML(html) {
  const elements = [];
  let body = html.replace(/<head>.*?<\/head>/s, '');
  body = body.replace(/<style>.*?<\/style>/s, '');
  body = body.replace(/<!DOCTYPE[^>]*>/, '');
  body = body.replace(/<html[^>]*>/, '');
  body = body.replace(/<\/html>/, '');

  const lines = body.split('\n');
  let inTable = false, tableRows = [], currentRow = [], isHeaderRow = false;
  let inUl = false, ulItems = [], ulOrdered = false;
  let inCover = false, coverLines = [];
  let inSs = false, ssContent = '';
  let inFeature = false, featureText = '';
  let inLi = false, liText = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Cover
    if (trimmed.includes('<div class="cover">')) { inCover = true; continue; }
    if (inCover && trimmed.includes('</div>') && !trimmed.includes('<div')) {
      inCover = false;
      elements.push({ type: 'cover', content: coverLines });
      coverLines = [];
      continue;
    }
    if (inCover) {
      if (trimmed.includes('<h1>')) {
        coverLines.push({ type: 'h1', text: trimmed.replace(/<h1>/, '').replace(/<\/h1>/, '') });
      } else if (trimmed.includes('class="ver"')) {
        coverLines.push({ type: 'ver', text: trimmed.replace(/<div[^>]*>/, '').replace(/<\/div>/, '') });
      } else if (trimmed.match(/^<p/)) {
        coverLines.push({ type: 'p', text: trimmed.replace(/<p[^>]*>/, '').replace(/<\/p>/, '') });
      }
      continue;
    }

    // Page break
    if (trimmed.includes('class="page-break"') || trimmed === '<div class="page-break"></div>') {
      elements.push({ type: 'pagebreak' });
      continue;
    }

    // Feature blocks
    if (trimmed.includes('class="feature"')) {
      inFeature = true;
      featureText = trimmed.replace(/<div class="feature">/, '').replace(/<\/div>/, '');
      if (trimmed.includes('</div>')) {
        elements.push({ type: 'feature', text: featureText });
        inFeature = false;
      }
      continue;
    }
    if (inFeature) {
      featureText += ' ' + trimmed.replace(/<\/div>/, '');
      if (trimmed.includes('</div>')) {
        elements.push({ type: 'feature', text: featureText });
        inFeature = false;
      }
      continue;
    }

    // Screenshot placeholder
    if (trimmed.includes('class="ss"')) {
      inSs = true;
      ssContent = '';
      const phMatch = trimmed.match(/<div class="ph">\[ ([^\]]*) \]/);
      if (phMatch) ssContent = phMatch[1];
      if (trimmed.includes('</div></div>')) {
        elements.push({ type: 'screenshot', text: ssContent });
        inSs = false;
      }
      continue;
    }
    if (inSs) {
      if (trimmed.includes('<div class="ph">')) {
        const phMatch = trimmed.match(/<div class="ph">\[ ([^\]]*) \]/);
        if (phMatch) ssContent = phMatch[1];
      }
      if (trimmed.includes('</div></div>')) {
        elements.push({ type: 'screenshot', text: ssContent });
        inSs = false;
      }
      continue;
    }

    // H2
    if (trimmed.match(/^<h2>/)) {
      const text = trimmed.replace(/<h2>/, '').replace(/<\/h2>/, '');
      if (text === '目 录') {
        // 跳过 HTML 中的静态目录，我们会用 Word TOC 替代
        continue;
      }
      elements.push({ type: 'h2', text: decodeEntities(text) });
      continue;
    }

    // H3
    if (trimmed.match(/^<h3>/)) {
      elements.push({ type: 'h3', text: decodeEntities(trimmed.replace(/<h3>/, '').replace(/<\/h3>/, '')) });
      continue;
    }

    // 目录 ol（跳过，用 Word TOC 替代）
    if (trimmed.includes('<ol>') && trimmed.includes('目 录')) {
      // Skip the static TOC
      continue;
    }
    // 如果前一个元素是跳过的目录 h2，后面紧跟的 ol 也跳过
    if (trimmed.includes('<ol>') && !inUl) {
      // 检查是否是目录列表（紧跟在跳过的"目 录"之后）
      // 简单判断：如果文本包含章节名
      if (trimmed.includes('软件简介') || trimmed.includes('用户登录')) {
        // 这是目录列表，跳过
        continue;
      }
      inUl = true;
      ulItems = [];
      ulOrdered = true;
      if (trimmed.includes('</ol>')) {
        inUl = false;
        const items = trimmed.match(/<li[^>]*>(.*?)<\/li>/g);
        if (items) {
          for (const item of items) {
            ulItems.push(item.replace(/<li[^>]*>/, '').replace(/<\/li>/, ''));
          }
        }
        elements.push({ type: 'list', items: ulItems, ordered: true });
        ulItems = [];
      }
      continue;
    }

    // Table
    if (trimmed.includes('<table')) {
      inTable = true;
      tableRows = [];
      // 如果 table 和 tr 在同一行
      if (trimmed.includes('<tr>')) {
        currentRow = [];
        isHeaderRow = trimmed.includes('<th>');
      }
      continue;
    }
    if (inTable) {
      if (trimmed.includes('</table>')) {
        inTable = false;
        if (currentRow.length > 0) {
          tableRows.push({ cells: currentRow, isHeader: isHeaderRow });
        }
        elements.push({ type: 'table', rows: tableRows });
        tableRows = [];
        currentRow = [];
        continue;
      }
      if (trimmed.includes('<tr>')) {
        if (currentRow.length > 0) {
          tableRows.push({ cells: currentRow, isHeader: isHeaderRow });
        }
        currentRow = [];
        isHeaderRow = trimmed.includes('<th>');
        // Single line row
        if (trimmed.includes('</tr>')) {
          const cells = trimmed.match(/<t[dh][^>]*>(.*?)<\/t[dh]/g);
          if (cells) {
            for (const cell of cells) {
              currentRow.push(cell.replace(/<t[dh][^>]*>/, '').replace(/<\/t[dh]/, ''));
            }
          }
          tableRows.push({ cells: currentRow, isHeader: isHeaderRow });
          currentRow = [];
          isHeaderRow = false;
        }
        continue;
      }
      if (trimmed.includes('</tr>')) {
        if (currentRow.length > 0) {
          tableRows.push({ cells: currentRow, isHeader: isHeaderRow });
        }
        currentRow = [];
        isHeaderRow = false;
        continue;
      }
      if (trimmed.match(/^<t[dh]/)) {
        const cellText = trimmed.replace(/<t[dh][^>]*>/, '').replace(/<\/t[dh]>/, '');
        currentRow.push(cellText);
        continue;
      }
      // Multi-line cell content
      if (currentRow.length > 0) {
        const extra = trimmed.replace(/<\/t[dh]>/, '');
        currentRow[currentRow.length - 1] += ' ' + extra;
      }
      continue;
    }

    // Lists
    if (trimmed.includes('<ul>') || trimmed.includes('<ol>')) {
      inUl = true;
      ulItems = [];
      ulOrdered = trimmed.includes('<ol>');
      if (trimmed.includes('</ul>') || trimmed.includes('</ol>')) {
        inUl = false;
        const items = trimmed.match(/<li[^>]*>(.*?)<\/li>/g);
        if (items) {
          for (const item of items) {
            ulItems.push(item.replace(/<li[^>]*>/, '').replace(/<\/li>/, ''));
          }
        }
        elements.push({ type: 'list', items: ulItems, ordered: ulOrdered });
        ulItems = [];
      }
      continue;
    }
    if (inUl) {
      if (trimmed.includes('</ul>') || trimmed.includes('</ol>')) {
        if (ulItems.length > 0) {
          elements.push({ type: 'list', items: ulItems, ordered: ulOrdered });
        }
        inUl = false;
        ulItems = [];
        continue;
      }
      if (trimmed.match(/^<li/)) {
        inLi = true;
        liText = trimmed.replace(/<li[^>]*>/, '').replace(/<\/li>/, '');
        if (trimmed.includes('</li>')) {
          inLi = false;
          ulItems.push(liText);
        }
        continue;
      }
      if (inLi) {
        liText += ' ' + trimmed.replace(/<\/li>/, '');
        if (trimmed.includes('</li>')) {
          inLi = false;
          ulItems.push(liText);
        }
        continue;
      }
      // Continuation text inside li
      if (ulItems.length > 0 && !trimmed.match(/^</)) {
        ulItems[ulItems.length - 1] += ' ' + trimmed;
      }
      continue;
    }

    // Paragraphs
    if (trimmed.match(/^<p/)) {
      const text = trimmed.replace(/<p[^>]*>/, '').replace(/<\/p>/, '');
      elements.push({ type: 'p', text: text });
      continue;
    }

    // Standalone text
    if (!trimmed.match(/^</) && !inTable && !inUl && !inCover && !inSs && !inFeature) {
      elements.push({ type: 'text', text: trimmed });
    }
  }

  return elements;
}

const elements = parseHTML(html);
console.log(`Parsed ${elements.length} elements`);

// ====== 构建 Word 文档 ======
const children = [];

// Helper: 判断段落是否需要首行缩进（普通段落缩进，标题/列表不缩进）
const borderDef = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: borderDef, bottom: borderDef, left: borderDef, right: borderDef };

for (const el of elements) {
  switch (el.type) {
    case 'cover':
      // 封面页 - 大标题居中
      for (const item of el.content) {
        const decoded = decodeEntities(item.text);
        if (item.type === 'h1') {
          children.push(new Paragraph({
            children: createInlineRuns(decoded, 44, true),
            alignment: AlignmentType.CENTER,
            spacing: { before: 800, after: 200 },
          }));
        } else if (item.type === 'ver') {
          children.push(new Paragraph({
            children: [new TextRun({ text: decoded, font: FONT_NAME, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
          }));
        } else if (item.type === 'p') {
          if (decoded.includes('软件使用说明书')) {
            children.push(new Paragraph({
              children: [new TextRun({ text: decoded, font: FONT_NAME, size: 24, bold: true })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 800 },
            }));
          } else if (decoded.includes('文档版本')) {
            children.push(new Paragraph({
              children: createInlineRuns(decoded, 20),
              alignment: AlignmentType.CENTER,
              spacing: { before: 1200 },
            }));
          }
        }
      }
      break;

    case 'pagebreak':
      children.push(new Paragraph({ children: [new PageBreak()] }));
      break;

    case 'h2':
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: el.text, font: FONT_NAME, size: 28, bold: true })],
        spacing: { before: 400, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2563EB', space: 4 } },
      }));
      break;

    case 'h3':
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: el.text, font: FONT_NAME, size: 22, bold: true, color: '1E40AF' })],
        spacing: { before: 300, after: 150 },
      }));
      break;

    case 'p':
      children.push(new Paragraph({
        children: createInlineRuns(el.text, 21),
        spacing: { before: 120, after: 120, line: 360 },
        indent: { firstLine: 420 },
      }));
      break;

    case 'feature':
      // Feature block - 加粗前缀 + 蓝色左边框
      const colonIdx = el.text.indexOf('：');
      if (colonIdx > 0 && colonIdx < 30) {
        const boldPart = el.text.substring(0, colonIdx + 1);
        const normalPart = el.text.substring(colonIdx + 1);
        children.push(new Paragraph({
          children: [
            new TextRun({ text: decodeEntities(boldPart), font: FONT_NAME, size: 21, bold: true, color: '1E40AF' }),
            new TextRun({ text: decodeEntities(normalPart), font: FONT_NAME, size: 21 }),
          ],
          spacing: { before: 160, after: 160, line: 360 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
        }));
      } else {
        children.push(new Paragraph({
          children: createInlineRuns(el.text, 21),
          spacing: { before: 160, after: 160, line: 360 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
        }));
      }
      break;

    case 'list':
      for (let idx = 0; idx < el.items.length; idx++) {
        const item = el.items[idx];
        const decoded = decodeEntities(item);
        // 解析加粗前缀（如"名称 —"、"资产类型 —"）
        const dashIdx = decoded.indexOf(' —');
        const colonIdx2 = decoded.indexOf('：');
        let boldEnd = -1;
        if (dashIdx > 0 && dashIdx < 40) boldEnd = dashIdx + 1;
        if (colonIdx2 > 0 && colonIdx2 < 40 && colonIdx2 > boldEnd) boldEnd = colonIdx2 + 1;

        if (boldEnd > 0) {
          const boldPart = decoded.substring(0, boldEnd + 1);
          const normalPart = decoded.substring(boldEnd + 1).trim();
          children.push(new Paragraph({
            children: [
              new TextRun({ text: boldPart, font: FONT_NAME, size: 21, bold: true }),
              new TextRun({ text: normalPart, font: FONT_NAME, size: 21 }),
            ],
            spacing: { before: 80, after: 80, line: 340 },
            indent: { left: 480 },
            bullet: el.ordered ? { level: 0 } : undefined,
          }));
        } else {
          children.push(new Paragraph({
            children: createInlineRuns(decoded, 21),
            spacing: { before: 80, after: 80, line: 340 },
            indent: { left: 480 },
            bullet: el.ordered ? { level: 0 } : undefined,
          }));
        }
      }
      break;

    case 'table':
      if (el.rows.length === 0) break;

      const numCols = el.rows[0].cells.length;
      const tableWidth = CONTENT_WIDTH;
      const colWidths = [];

      if (numCols === 2) {
        colWidths.push(1800);
        colWidths.push(tableWidth - 1800);
      } else if (numCols === 3) {
        colWidths.push(2000);
        colWidths.push(4600);
        colWidths.push(tableWidth - 6600);
      } else {
        const each = Math.floor(tableWidth / numCols);
        for (let c = 0; c < numCols; c++) colWidths.push(each);
      }

      const rows = el.rows.map((row, rowIdx) => {
        return new TableRow({
          children: row.cells.map((cellText, colIdx) => {
            const isHeader = row.isHeader;
            const decoded = decodeEntities(cellText.trim());
            return new TableCell({
              borders,
              width: { size: colWidths[colIdx] || Math.floor(tableWidth / numCols), type: WidthType.DXA },
              shading: isHeader ? { fill: 'F0F4FF', type: ShadingType.CLEAR } : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({
                children: createInlineRuns(decoded, isHeader ? 20 : 19, isHeader),
                spacing: { before: 0, after: 0, line: 280 },
              })],
            });
          }),
        });
      });

      children.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: colWidths,
        rows: rows,
      }));
      children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
      break;

    case 'screenshot':
      children.push(new Paragraph({
        children: [new TextRun({
          text: `[ ${el.text} ]`,
          font: FONT_NAME,
          size: 19,
          italics: true,
          color: '999999',
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD', space: 8 },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD', space: 8 },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD', space: 8 },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD', space: 8 },
        },
        shading: { fill: 'FAFAFA', type: ShadingType.CLEAR },
      }));
      break;

    case 'text':
      const decodedText = decodeEntities(el.text);
      if (decodedText.includes('文档结束')) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: '— 文档结束 —',
            font: FONT_NAME,
            size: 20,
            color: '999999',
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200 },
        }));
      }
      break;
  }
}

// ====== 分离封面和正文 ======
// children 中第一个 pagebreak 之前是封面内容
let coverEnd = -1;
for (let i = 0; i < children.length; i++) {
  if (children[i] instanceof Paragraph) {
    const runs = children[i].children || [];
    for (const r of runs) {
      if (r instanceof PageBreak) {
        coverEnd = i;
        break;
      }
    }
    if (coverEnd >= 0) break;
    // Also check for PageBreak inside TextRun children (docx library wraps it differently)
    // PageBreak() creates a separate child in Paragraph
    const innerChildren = children[i];
    if (innerChildren && Array.isArray(innerChildren.root)) {
      for (const child of innerChildren.root) {
        if (child && child.rootKey === 'w:br' || (child instanceof PageBreak)) {
          coverEnd = i;
          break;
        }
      }
    }
  }
}
// Fallback: if no pagebreak found, assume first 5 paragraphs are cover
if (coverEnd < 0) coverEnd = 5;

const coverContent = children.slice(0, coverEnd);
const bodyContent = children.slice(coverEnd + 1); // skip the pagebreak paragraph

console.log(`Cover paragraphs: ${coverContent.length}, Body paragraphs: ${bodyContent.length}`);

// ====== 创建文档 ======
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: FONT_NAME,
          size: 21,
        },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, font: FONT_NAME },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 22, bold: true, font: FONT_NAME, color: '1E40AF' },
        paragraph: { spacing: { before: 300, after: 150 } },
      },
    ],
  },
  numbering: {
    config: [{
      reference: 'ordered-list',
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.START,
        style: {
          paragraph: {
            indent: { left: 720, hanging: 360 },
          },
        },
      }],
    }],
  },
  sections: [
    // ====== 封面页（无页眉页脚） ======
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
        },
      },
      children: coverContent, // 封面内容
    },
    // ====== 目录页 ======
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: HEADER_TITLE, font: FONT_NAME, size: 18 }),
              new TextRun({ text: '\t', font: FONT_NAME, size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT_NAME, size: 18 }),
              new TextRun({ text: ' / ', font: FONT_NAME, size: 18 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_NAME, size: 18 }),
            ],
            alignment: AlignmentType.LEFT,
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2563EB', space: 2 } },
            spacing: { after: 0, before: 0 },
          })],
        }),
      },
      footers: {
        default: new Footer({ children: [] }),
      },
      children: [
        // 目录标题
        new Paragraph({
          children: [new TextRun({ text: '目 录', font: FONT_NAME, size: 28, bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400 },
        }),
        // Word TOC 字段（在 Word 中右键→更新域即可生成目录）
        new TableOfContents('目录', {
          hyperlink: true,
          headingStyleRange: '1-2',
        }),
      ],
    },
    // ====== 正文 ======
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: HEADER_TITLE, font: FONT_NAME, size: 18 }),
              new TextRun({ text: '\t', font: FONT_NAME, size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT_NAME, size: 18 }),
              new TextRun({ text: ' / ', font: FONT_NAME, size: 18 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_NAME, size: 18 }),
            ],
            alignment: AlignmentType.LEFT,
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2563EB', space: 2 } },
            spacing: { after: 0, before: 0 },
          })],
        }),
      },
      footers: {
        default: new Footer({ children: [] }),
      },
      children: bodyContent,
    },
  ],
});

// 生成文件
const outputPath = 'E:/vscodeai/copyright/manual-v2.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`\n✅ Document generated: ${outputPath}`);
  console.log(`   Total elements: ${elements.length}`);
  console.log(`   Cover paragraphs: ${coverContent.length}`);
  console.log(`   Body paragraphs: ${bodyContent.length}`);
  console.log(`   Font: ${FONT_NAME}`);
  console.log(`   Has TOC: yes (update in Word: right-click -> update field)`);
  console.log(`   Header: ${HEADER_TITLE} + page number on same line`);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
