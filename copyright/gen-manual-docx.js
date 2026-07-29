/*
 * 软著软件使用说明书 Word 文档生成器
 * 将 manual.html 转换为 Word 文档
 * 要求：微软雅黑、有页眉
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageNumber, PageBreak, BorderStyle,
  WidthType, ShadingType, HeadingLevel, LevelFormat
} = require('docx');

const FONT_NAME = 'Microsoft YaHei';
const HEADER_TITLE = '堡垒机安全远程运维管理平台 V1.0 — 软件使用说明书';

// A4 页面
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN_TOP = 1134;    // 20mm
const MARGIN_BOTTOM = 1134;  // 20mm
const MARGIN_LEFT = 1020;    // 18mm
const MARGIN_RIGHT = 1020;   // 18mm

// ====== 解析 HTML 内容 ======
const html = fs.readFileSync('E:/vscodeai/copyright/manual.html', 'utf-8');

// 提取文本内容和结构
function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—');
}

// 手动解析 HTML 结构
function parseHTML(html) {
  const elements = [];
  // 去掉 CSS style 和 head
  let body = html.replace(/<head>.*?<\/head>/s, '');
  body = body.replace(/<style>.*?<\/style>/s, '');
  body = body.replace(/<!DOCTYPE[^>]*>/, '');
  body = body.replace(/<html[^>]*>/, '');
  body = body.replace(/<\/html>/, '');

  // 按行解析
  const lines = body.split('\n');
  let i = 0;

  // Simple state machine parser
  let inTable = false;
  let tableRows = [];
  let currentRow = [];
  let currentCell = '';
  let inCell = false;
  let isHeaderRow = false;
  let inUl = false;
  let ulItems = [];
  let inCover = false;
  let coverLines = [];
  let inSs = false;
  let ssContent = '';
  let inFeature = false;
  let featureText = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Cover div
    if (trimmed.includes('<div class="cover">')) { inCover = true; continue; }
    if (inCover && trimmed.includes('</div>')) {
      inCover = false;
      elements.push({ type: 'cover', content: coverLines });
      coverLines = [];
      continue;
    }
    if (inCover) {
      if (trimmed.includes('<h1>')) {
        coverLines.push({ type: 'h1', text: decodeEntities(trimmed.replace(/<h1>/, '').replace(/<\/h1>/, '')) });
      } else if (trimmed.includes('class="ver"')) {
        coverLines.push({ type: 'ver', text: decodeEntities(trimmed.replace(/<div[^>]*>/, '').replace(/<\/div>/, '')) });
      } else if (trimmed.includes('<p')) {
        const text = decodeEntities(trimmed.replace(/<p[^>]*>/, '').replace(/<\/p>/, ''));
        coverLines.push({ type: 'p', text: text });
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
      featureText = decodeEntities(trimmed.replace(/<div[^>]*>/, '').replace(/<\/div>/, ''));
      if (trimmed.includes('</div>')) {
        elements.push({ type: 'feature', text: featureText });
        inFeature = false;
      }
      continue;
    }
    if (inFeature) {
      featureText += ' ' + decodeEntities(trimmed.replace(/<\/div>/, ''));
      if (trimmed.includes('</div>')) {
        elements.push({ type: 'feature', text: featureText });
        inFeature = false;
      }
      continue;
    }

    // Screenshot placeholder
    if (trimmed.includes('class="ss"')) {
      inSs = true;
      ssContent = trimmed;
      if (trimmed.includes('</div></div>')) {
        const phText = trimmed.match(/<div class="ph">\[ ([^\]]*) \]/);
        if (phText) {
          elements.push({ type: 'screenshot', text: phText[1] });
        }
        inSs = false;
      }
      continue;
    }
    if (inSs) {
      if (trimmed.includes('<div class="ph">')) {
        const phText = trimmed.match(/<div class="ph">\[ ([^\]]*) \]/);
        if (phText) ssContent = phText[1];
      }
      if (trimmed.includes('</div></div>')) {
        elements.push({ type: 'screenshot', text: ssContent });
        inSs = false;
      }
      continue;
    }

    // H1
    if (trimmed.match(/^<h1>/)) {
      elements.push({ type: 'h1', text: decodeEntities(trimmed.replace(/<h1>/, '').replace(/<\/h1>/, '')) });
      continue;
    }

    // H2
    if (trimmed.match(/^<h2>/)) {
      elements.push({ type: 'h2', text: decodeEntities(trimmed.replace(/<h2>/, '').replace(/<\/h2>/, '')) });
      continue;
    }

    // H3
    if (trimmed.match(/^<h3>/)) {
      elements.push({ type: 'h3', text: decodeEntities(trimmed.replace(/<h3>/, '').replace(/<\/h3>/, '')) });
      continue;
    }

    // Table
    if (trimmed.includes('<table')) {
      inTable = true;
      tableRows = [];
      continue;
    }
    if (inTable) {
      if (trimmed.includes('</table>')) {
        inTable = false;
        elements.push({ type: 'table', rows: tableRows });
        tableRows = [];
        continue;
      }
      if (trimmed.includes('<tr>')) {
        currentRow = [];
        isHeaderRow = trimmed.includes('<th>');
        // If th is on same line as tr
        if (trimmed.includes('</tr>')) {
          // Single line row
          const cells = trimmed.match(/<t[dh][^>]*>(.*?)<\/t[dh]/g);
          if (cells) {
            for (const cell of cells) {
              const cellText = decodeEntities(cell.replace(/<t[dh][^>]*>/, '').replace(/<\/t[dh]/, '').replace(/<strong>/, '').replace(/<\/strong>/, ''));
              currentRow.push(cellText);
            }
          }
          tableRows.push({ cells: currentRow, isHeader: isHeaderRow });
          continue;
        }
        continue;
      }
      if (trimmed.includes('</tr>')) {
        tableRows.push({ cells: currentRow, isHeader: isHeaderRow });
        currentRow = [];
        isHeaderRow = false;
        continue;
      }
      // Cells
      if (trimmed.match(/^<t[dh]/)) {
        const cellText = decodeEntities(trimmed.replace(/<t[dh][^>]*>/, '').replace(/<\/t[dh]>/, '').replace(/<strong>/, '').replace(/<\/strong>/, ''));
        currentRow.push(cellText);
        continue;
      }
      // Multi-line cell content
      if (currentRow.length > 0) {
        const extra = decodeEntities(trimmed.replace(/<\/t[dh]>/, '').replace(/<strong>/, '').replace(/<\/strong>/, ''));
        currentRow[currentRow.length - 1] += ' ' + extra;
      }
      continue;
    }

    // Lists
    if (trimmed.includes('<ul>') || trimmed.includes('<ol>')) {
      inUl = true;
      ulItems = [];
      const isOrdered = trimmed.includes('<ol>');
      if (trimmed.includes('</ul>') || trimmed.includes('</ol>')) {
        inUl = false;
        // Check if items on same line
        const items = trimmed.match(/<li[^>]*>(.*?)<\/li>/g);
        if (items) {
          for (const item of items) {
            ulItems.push(decodeEntities(item.replace(/<li[^>]*>/, '').replace(/<\/li>/, '').replace(/<strong>/, '').replace(/<\/strong>/, '')));
          }
        }
        elements.push({ type: 'list', items: ulItems, ordered: isOrdered });
        ulItems = [];
      }
      continue;
    }
    if (inUl) {
      if (trimmed.includes('</ul>') || trimmed.includes('</ol>')) {
        inUl = false;
        elements.push({ type: 'list', items: ulItems, ordered: trimmed.includes('</ol>') });
        ulItems = [];
        continue;
      }
      if (trimmed.match(/^<li/)) {
        let itemText = decodeEntities(trimmed.replace(/<li[^>]*>/, '').replace(/<\/li>/, '').replace(/<strong>/, '').replace(/<\/strong>/, ''));
        if (trimmed.includes('</li>')) {
          ulItems.push(itemText);
        } else {
          // Multi-line li
          ulItems.push(itemText);
        }
        continue;
      }
      // Continuation of li
      if (ulItems.length > 0) {
        const extra = decodeEntities(trimmed.replace(/<\/li>/, '').replace(/<strong>/, '').replace(/<\/strong>/, ''));
        ulItems[ulItems.length - 1] += ' ' + extra;
      }
      continue;
    }

    // Paragraphs
    if (trimmed.match(/^<p/)) {
      let text = decodeEntities(trimmed.replace(/<p[^>]*>/, '').replace(/<\/p>/, '').replace(/<strong>/, '').replace(/<\/strong>/, ''));
      // Handle inline strong tags
      text = text.replace(/<strong>/, '').replace(/<\/strong>/, '');
      elements.push({ type: 'p', text: text });
      continue;
    }

    // Standalone text
    if (!trimmed.match(/^</) && !inTable && !inUl && !inCover && !inSs && !inFeature) {
      elements.push({ type: 'text', text: decodeEntities(trimmed) });
    }
  }

  return elements;
}

const elements = parseHTML(html);
console.log(`Parsed ${elements.length} elements`);

// ====== 构建 Word 文档 ======
const children = [];

// Helper: parse inline bold markers (we decoded <strong> already, but text may contain bold patterns)
// For simplicity, we'll just create TextRuns from text content
function createTextRuns(text, fontSize = 21) {
  // Split by bold markers if any remain
  const parts = [];
  // Simple approach: if text contains style attributes, handle them
  // For now just create plain text runs
  return [new TextRun({
    text: text,
    font: FONT_NAME,
    size: fontSize,
  })];
}

// Helper: create bold text run
function createBoldRun(text, fontSize = 21) {
  return new TextRun({
    text: text,
    font: FONT_NAME,
    size: fontSize,
    bold: true,
  });
}

// Helper: table borders
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

for (const el of elements) {
  switch (el.type) {
    case 'cover':
      // Cover page
      for (const item of el.content) {
        if (item.type === 'h1') {
          children.push(new Paragraph({
            children: [new TextRun({ text: item.text, font: FONT_NAME, size: 44, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 800, after: 200 },
          }));
        } else if (item.type === 'ver') {
          children.push(new Paragraph({
            children: [new TextRun({ text: item.text, font: FONT_NAME, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
          }));
        } else if (item.type === 'p') {
          if (item.text.includes('软件使用说明书')) {
            children.push(new Paragraph({
              children: [new TextRun({ text: item.text, font: FONT_NAME, size: 24, bold: true })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 800 },
            }));
          } else {
            children.push(new Paragraph({
              children: [new TextRun({ text: item.text, font: FONT_NAME, size: 20 })],
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

    case 'h1':
      children.push(new Paragraph({
        children: [new TextRun({ text: el.text, font: FONT_NAME, size: 36, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 400 },
      }));
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
      // Handle paragraphs with text-indent (2em)
      children.push(new Paragraph({
        children: createTextRuns(el.text),
        spacing: { before: 120, after: 120, line: 360 },
        indent: { firstLine: 480 }, // 2em ≈ 480 DXA at 10.5pt
      }));
      break;

    case 'feature':
      // Feature block - styled with left border effect via indent
      // Parse bold prefix
      const colonIdx = el.text.indexOf('：');
      if (colonIdx > 0) {
        const boldPart = el.text.substring(0, colonIdx + 1);
        const normalPart = el.text.substring(colonIdx + 1);
        children.push(new Paragraph({
          children: [
            createBoldRun(boldPart, 21),
            new TextRun({ text: normalPart, font: FONT_NAME, size: 21 }),
          ],
          spacing: { before: 160, after: 160, line: 360 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
        }));
      } else {
        children.push(new Paragraph({
          children: createTextRuns(el.text),
          spacing: { before: 160, after: 160, line: 360 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
        }));
      }
      break;

    case 'list':
      for (let idx = 0; idx < el.items.length; idx++) {
        const item = el.items[idx];
        // Parse bold prefix in list items
        const dashIdx = item.indexOf('—');
        const colonIdx2 = item.indexOf('：');
        const boldEnd = Math.max(dashIdx, colonIdx2);
        
        if (boldEnd > 0 && boldEnd < 30) {
          const boldPart = item.substring(0, boldEnd + 1);
          const normalPart = item.substring(boldEnd + 1);
          children.push(new Paragraph({
            children: [
              createBoldRun(boldPart, 21),
              new TextRun({ text: normalPart, font: FONT_NAME, size: 21 }),
            ],
            spacing: { before: 80, after: 80, line: 360 },
            indent: { left: 480, hanging: 240 },
          }));
        } else {
          children.push(new Paragraph({
            children: createTextRuns(item),
            spacing: { before: 80, after: 80, line: 360 },
            indent: { left: 480, hanging: 240 },
          }));
        }
      }
      break;

    case 'table':
      if (el.rows.length === 0) break;
      
      const numCols = el.rows[0].cells.length;
      // Calculate column widths based on content
      // Total width: page width - margins = 11906 - 1020 - 1020 = 9866 DXA
      const tableWidth = 9866;
      const colWidths = [];
      
      // Check if it's a func-table (2 columns with first narrow)
      if (numCols === 2) {
        colWidths.push(1600); // First col ~100px equivalent
        colWidths.push(tableWidth - 1600);
      } else {
        // Equal columns
        const each = Math.floor(tableWidth / numCols);
        for (let c = 0; c < numCols; c++) colWidths.push(each);
      }
      
      const rows = el.rows.map((row, rowIdx) => {
        return new TableRow({
          children: row.cells.map((cellText, colIdx) => {
            const isHeader = row.isHeader;
            return new TableCell({
              borders,
              width: { size: colWidths[colIdx], type: WidthType.DXA },
              shading: isHeader ? { fill: 'F0F4FF', type: ShadingType.CLEAR } : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({
                children: [new TextRun({
                  text: cellText.trim(),
                  font: FONT_NAME,
                  size: isHeader ? 20 : 19,
                  bold: isHeader,
                })],
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
      
      // Add spacing after table
      children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
      break;

    case 'screenshot':
      // Screenshot placeholder - show as a bordered box with text
      children.push(new Paragraph({
        children: [new TextRun({
          text: `[ ${el.text} ]`,
          font: FONT_NAME,
          size: 19,
          italics: true,
          color: '999999',
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200, line: 360 },
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
      // End marker
      if (el.text.includes('文档结束')) {
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

// 创建文档
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: FONT_NAME,
          size: 21, // 10.5pt default
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
  sections: [{
    properties: {
      page: {
        size: {
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
        },
        margin: {
          top: MARGIN_TOP,
          bottom: MARGIN_BOTTOM,
          left: MARGIN_LEFT,
          right: MARGIN_RIGHT,
          header: 425,
          footer: 425,
        },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({
            text: HEADER_TITLE,
            font: FONT_NAME,
            size: 18, // 9pt
          })],
          alignment: AlignmentType.CENTER,
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: '2563EB',
              space: 2,
            },
          },
          spacing: { after: 0, before: 0 },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: '第 ', font: FONT_NAME, size: 18 }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT_NAME, size: 18 }),
            new TextRun({ text: ' 页 / 共 ', font: FONT_NAME, size: 18 }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_NAME, size: 18 }),
            new TextRun({ text: ' 页', font: FONT_NAME, size: 18 }),
          ],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children: children,
  }],
});

// 生成文件
const outputPath = 'E:/vscodeai/copyright/manual.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`\n✅ Document generated: ${outputPath}`);
  console.log(`   Total elements: ${elements.length}`);
  console.log(`   Font: ${FONT_NAME}`);
  console.log(`   Has header/footer: yes`);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
