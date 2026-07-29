/*
 * 软著软件使用说明书生成器 V4
 * 修复: 使用 Word 自动目录字段(TableOfContents)替代手工目录
 * 
 * 关键变更（vs V3）:
 * - 目录页: 使用 TableOfContents 替代手工段落
 * - 章节标题(h2): 应用 Heading1 样式，确保 TOC 可识别
 * - 子标题(h3): 应用 Heading2 样式
 * - 文档 styles: 定义 Heading1/Heading2 样式
 * 
 * 其他格式保持不变（参考杏林药安复购跟进系统文档）
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, PageNumber, PageBreak, BorderStyle,
  PageOrientation, TabStopType, Table, TableRow, TableCell,
  WidthType, VerticalAlign, ShadingType,
  TableOfContents, HeadingLevel
} = require('docx');

// ====== 配置 ======
const FONT_CN = '宋体';
const FONT_EN = 'Times New Roman';
const FONT_YAHEI = 'Microsoft YaHei';
const HEADER_TITLE = '堡垒机安全远程运维管理平台';

// 页边距（参考文档：top/bottom 1440=25.4mm, left/right 1800=31.75mm）
const MARGIN_TOP = 1440;
const MARGIN_BOTTOM = 1440;
const MARGIN_LEFT = 1800;
const MARGIN_RIGHT = 1800;
const HEADER_DISTANCE = 851;
const FOOTER_DISTANCE = 992;

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;

// ====== 解析 HTML ======
const htmlContent = fs.readFileSync('E:/vscodeai/copyright/manual.html', 'utf-8');

// 手动解析 HTML（比正则更可控）
function parseHTML(html) {
  const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/s);
  const bodyHTML = bodyMatch ? bodyMatch[1] : html;
  
  const elements = [];
  let pos = 0;
  const content = bodyHTML.trim();
  
  while (pos < content.length) {
    if (content[pos] === '\n' || content[pos] === '\r' || content[pos] === ' ' || content[pos] === '\t') {
      pos++;
      continue;
    }
    
    if (content[pos] === '<') {
      const tagEnd = content.indexOf('>', pos);
      if (tagEnd < 0) break;
      const tagStr = content.substring(pos, tagEnd + 1);
      
      const tagMatch = tagStr.match(/^<(\w+)([^>]*?)\/>/);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const attrs = parseAttrs(tagMatch[2]);
        elements.push({ type: 'tag', name: tagName, attrs, selfClose: true });
        pos = tagEnd + 1;
        continue;
      }
      
      const openMatch = tagStr.match(/^<(\w+)([^>]*?)>/);
      if (openMatch) {
        const tagName = openMatch[1].toLowerCase();
        const attrs = parseAttrs(openMatch[2]);
        
        if (tagName === 'br') {
          elements.push({ type: 'tag', name: 'br', attrs, selfClose: true });
          pos = tagEnd + 1;
          continue;
        }
        
        if (tagName === 'meta' || tagName === 'title' || tagName === 'link') {
          pos = tagEnd + 1;
          continue;
        }
        
        const endTag = `</${tagName}>`;
        let endPos = findEndTag(content, tagName, tagEnd + 1);
        
        if (endPos >= 0) {
          const innerHTML = content.substring(tagEnd + 1, endPos);
          elements.push({ type: 'element', name: tagName, attrs, innerHTML });
          pos = endPos + endTag.length;
        } else {
          elements.push({ type: 'tag', name: tagName, attrs, selfClose: true });
          pos = tagEnd + 1;
        }
        continue;
      }
    }
    
    let textEnd = content.indexOf('<', pos);
    if (textEnd < 0) textEnd = content.length;
    const text = content.substring(pos, textEnd).trim();
    if (text) {
      elements.push({ type: 'text', content: text });
    }
    pos = textEnd;
  }
  
  return elements;
}

function parseAttrs(attrStr) {
  const attrs = {};
  const matches = attrStr.matchAll(/(\w+)(?:="([^"]*)")?/g);
  for (const m of matches) {
    attrs[m[1]] = m[2] || '';
  }
  return attrs;
}

function findEndTag(content, tagName, startPos) {
  let depth = 1;
  let pos = startPos;
  while (pos < content.length && depth > 0) {
    const nextOpen = content.indexOf(`<${tagName}`, pos);
    const nextClose = content.indexOf(`</${tagName}>`, pos);
    
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const openTagEnd = content.indexOf('>', nextOpen);
      if (openTagEnd >= 0) {
        if (content.substring(nextOpen, openTagEnd + 1).match(/\/>/)) {
          // 自闭合，不增加 depth
        } else {
          depth++;
        }
        pos = openTagEnd + 1;
        continue;
      }
    }
    
    if (nextClose >= 0) {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + `</${tagName}>`.length;
      continue;
    }
    
    break;
  }
  return -1;
}

// 解析内嵌 HTML 文本为 TextRun 数组
function parseInlineHTML(htmlStr) {
  const runs = [];
  htmlStr = htmlStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—');
  
  const parts = htmlStr.split(/(<strong>.*?<\/strong>)/s);
  for (const part of parts) {
    const strongMatch = part.match(/^<strong>(.*?)<\/strong>$/s);
    if (strongMatch) {
      runs.push(new TextRun({
        text: strongMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
        font: { ascii: FONT_EN, eastAsia: FONT_CN },
        bold: true,
        size: 21,
      }));
    } else if (part.trim()) {
      runs.push(new TextRun({
        text: part,
        font: { ascii: FONT_EN, eastAsia: FONT_CN },
        size: 21,
      }));
    }
  }
  return runs;
}

// ====== 构建文档内容 ======
const parsed = parseHTML(htmlContent);
const children = [];

// 封面内容（参考文档格式：多行空行 + 居中标题）
for (let i = 0; i < 7; i++) {
  children.push(new Paragraph({ 
    spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
    children: []
  }));
}

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
  children: [new TextRun({
    text: '堡垒机安全远程运维管理平台',
    font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
    size: 56, // 28pt
  })]
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
  children: [new TextRun({
    text: '系统手册',
    font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
    size: 56, // 28pt
  })]
}));

// 版本信息行
for (let i = 0; i < 3; i++) {
  children.push(new Paragraph({
    spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
    children: []
  }));
}

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
  children: [new TextRun({
    text: 'V1.0',
    font: { ascii: FONT_EN, eastAsia: FONT_CN },
    size: 28, // 14pt
  })]
}));

// 更多空行
for (let i = 0; i < 8; i++) {
  children.push(new Paragraph({
    spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
    children: []
  }));
}

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' },
  children: [new TextRun({
    text: '2026年7月',
    font: { ascii: FONT_EN, eastAsia: FONT_CN },
    size: 24, // 12pt
    color: '999999',
  })]
}));

// 封面分页
children.push(new Paragraph({
  children: [new PageBreak()],
}));

// ====== 目录页（使用 Word 自动目录字段） ======
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200, before: 0, line: 360, lineRule: 'auto' },
  children: [new TextRun({
    text: '目录',
    font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
    size: 36, // 18pt
    bold: true,
  })]
}));

// 空一行
children.push(new Paragraph({ spacing: { after: 0, before: 0, line: 360, lineRule: 'auto' }, children: [] }));

// Word 自动目录字段
children.push(new TableOfContents('目录', {
  hyperlink: true,
  headingStyleRange: '1-2',
}));

// 目录分页
children.push(new Paragraph({
  children: [new PageBreak()],
}));

// ====== 正文内容 ======
function processElement(el) {
  if (el.type === 'text') {
    if (el.content.trim()) {
      children.push(new Paragraph({
        spacing: { after: 60, before: 0, line: 360, lineRule: 'auto' },
        indent: { firstLine: 420 },
        children: [new TextRun({
          text: el.content.trim(),
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 21,
        })]
      }));
    }
    return;
  }
  
  if (el.type === 'tag' && el.selfClose) {
    if (el.name === 'br') {
      // 换行
    }
    return;
  }
  
  if (el.type === 'element') {
    const name = el.name;
    const attrs = el.attrs;
    const inner = el.innerHTML;
    
    // 封面区域（已手动处理，跳过）
    if (attrs.class && attrs.class.includes('cover')) return;
    
    // 分页
    if (attrs.class && attrs.class.includes('page-break')) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      return;
    }
    
    // h2 标题（章节标题） → 使用 Heading1 样式，TOC 可识别
    if (name === 'h2') {
      const titleText = inner.trim();
      
      // 目录标题已单独处理
      if (titleText === '目 录' || titleText === '目录') return;
      
      // 关键变更: 使用 heading 样式而非手动样式
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200, before: 300, line: 360, lineRule: 'auto' },
        children: [new TextRun({
          text: titleText,
          font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
          size: 30, // 15pt
          bold: true,
        })]
      }));
      return;
    }
    
    // h3 子标题 → 使用 Heading2 样式
    if (name === 'h3') {
      const titleText = inner.trim();
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 100, before: 200, line: 360, lineRule: 'auto' },
        children: [new TextRun({
          text: titleText,
          font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
          size: 24, // 12pt
          bold: true,
        })]
      }));
      return;
    }
    
    // h1（封面标题，已手动处理）
    if (name === 'h1') return;
    
    // div.feature
    if (attrs.class && attrs.class.includes('feature')) {
      const runs = parseInlineHTML(inner);
      children.push(new Paragraph({
        spacing: { after: 60, before: 60, line: 360, lineRule: 'auto' },
        indent: { firstLine: 420 },
        children: runs,
      }));
      return;
    }
    
    // div.ss / div.ph（截图占位符）
    if (attrs.class && attrs.class.includes('ss') || (name === 'div' && inner.includes('class="ph"'))) {
      const phMatch = inner.match(/\[([^\]]+)\]/);
      const phText = phMatch ? phMatch[1].replace(/&mdash;/g, '—') : '示意图';
      const displayText = phText.includes('示意图') ? phText : phText + '示意图';
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200, before: 200, line: 360, lineRule: 'auto' },
        indent: { firstLine: 0 },
        children: [new TextRun({
          text: displayText,
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 21,
          italics: true,
          color: '888888',
        })]
      }));
      return;
    }
    
    // div.ver / div（其他 div）
    if (name === 'div' && attrs.class && attrs.class.includes('ver')) return;
    
    if (name === 'div') {
      const innerEls = parseHTML(inner);
      for (const ie of innerEls) {
        processElement(ie);
      }
      return;
    }
    
    // p 段落
    if (name === 'p') {
      const runs = parseInlineHTML(inner);
      const hasSpecialStyle = attrs.style && attrs.style.includes('text-align:center');
      
      children.push(new Paragraph({
        alignment: hasSpecialStyle ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 60, before: 0, line: 360, lineRule: 'auto' },
        indent: hasSpecialStyle ? undefined : { firstLine: 420 },
        children: runs,
      }));
      return;
    }
    
    // ul / ol 列表
    if (name === 'ul') {
      const items = inner.match(/<li[^>]*>(.*?)<\/li>/gs) || [];
      for (const item of items) {
        const itemText = item.replace(/<\/?li[^>]*>/g, '').trim();
        const runs = parseInlineHTML(itemText);
        runs.unshift(new TextRun({
          text: '• ',
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 21,
        }));
        
        children.push(new Paragraph({
          spacing: { after: 40, before: 0, line: 360, lineRule: 'auto' },
          indent: { left: 420, firstLine: 0 },
          children: runs,
        }));
      }
      return;
    }
    
    if (name === 'ol') {
      const items = inner.match(/<li[^>]*>(.*?)<\/li>/gs) || [];
      let idx = 1;
      for (const item of items) {
        const itemText = item.replace(/<\/?li[^>]*>/g, '').trim();
        const runs = parseInlineHTML(itemText);
        runs.unshift(new TextRun({
          text: `${idx}. `,
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 21,
        }));
        
        children.push(new Paragraph({
          spacing: { after: 40, before: 0, line: 360, lineRule: 'auto' },
          indent: { left: 420, firstLine: 0 },
          children: runs,
        }));
        idx++;
      }
      return;
    }
    
    // table
    if (name === 'table') {
      const rows = inner.match(/<tr[^>]*>(.*?)<\/tr>/gs) || [];
      const tableRows = [];
      
      for (const rowStr of rows) {
        const cells = rowStr.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs) || [];
        const tableCells = [];
        
        for (const cellStr of cells) {
          const isHeader = cellStr.startsWith('<th');
          const cellText = cellStr.replace(/<\/?t[dh][^>]*>/g, '').trim();
          const cellRuns = parseInlineHTML(cellText);
          
          tableCells.push(new TableCell({
            width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
            shading: isHeader ? { fill: 'F0F4FF', type: ShadingType.CLEAR } : undefined,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              spacing: { after: 40, before: 40, line: 360, lineRule: 'auto' },
              children: cellRuns,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
          }));
        }
        
        if (tableCells.length > 0) {
          tableRows.push(new TableRow({
            children: tableCells,
          }));
        }
      }
      
      if (tableRows.length > 0) {
        children.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
        children.push(new Paragraph({ spacing: { after: 60, before: 60, line: 360, lineRule: 'auto' }, children: [] }));
      }
      return;
    }
  }
}

// 处理所有解析出的元素
for (const el of parsed) {
  processElement(el);
}

// ====== 分离封面、目录、正文 ======
let coverEnd = -1;
let tocEnd = -1;

// 找封面结束位置（"2026年7月" 那个段落之后就是 PageBreak 段落）
for (let i = 0; i < children.length; i++) {
  if (children[i] instanceof Paragraph) {
    const text = extractParagraphText(children[i]);
    if (text.includes('2026年7月')) {
      coverEnd = i + 1;
      break;
    }
  }
}

// 找目录结束位置（TableOfContents 后面的分页段落）
// TableOfContents 是特殊对象，不是 Paragraph
for (let i = coverEnd; i < children.length; i++) {
  if (children[i] instanceof TableOfContents) {
    // TOC 对象之后应该有空行和分页段落
    // 找后面的 PageBreak
    for (let j = i + 1; j < children.length; j++) {
      if (children[j] instanceof Paragraph) {
        const text = extractParagraphText(children[j]);
        // 分页段落（PageBreak 段落通常没有文字）
        if (text === '' && j - i < 5) {
          tocEnd = j + 1;
          break;
        }
      }
    }
    if (tocEnd < 0) tocEnd = i + 2; // fallback
    break;
  }
}

// Fallback: 如果没找到 TableOfContents，用旧方法
if (tocEnd < 0) {
  let tocFound = false;
  for (let i = coverEnd; i < children.length; i++) {
    if (children[i] instanceof Paragraph) {
      const text = extractParagraphText(children[i]);
      if (text.includes('目录')) {
        tocFound = true;
      }
      if (tocFound && text === '') {
        tocEnd = i + 1;
        break;
      }
    }
  }
}

if (coverEnd < 0) coverEnd = 22;
if (tocEnd < 0) tocEnd = 35;

const coverContent = children.slice(0, coverEnd);
const tocContent = children.slice(coverEnd, tocEnd);
const bodyContent = children.slice(tocEnd);

console.log(`Cover: ${coverContent.length} items, TOC: ${tocContent.length} items, Body: ${bodyContent.length} items`);
console.log(`TOC section includes TableOfContents: ${tocContent.some(c => c instanceof TableOfContents)}`);

// 提取段落文本的辅助函数
function extractParagraphText(p) {
  try {
    let text = '';
    if (p.root && Array.isArray(p.root)) {
      for (const node of p.root) {
        if (node && node.rootKey === 'w:r') {
          for (const sub of node.root || []) {
            if (sub && sub.rootKey === 'w:t') {
              text += sub.root || '';
            }
          }
        }
      }
    }
    return text;
  } catch (e) {
    return '';
  }
}

// ====== 页眉 ======
const contentWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 8306

function makeHeader() {
  return new Header({
    children: [new Paragraph({
      spacing: { after: 0, before: 0, line: 240, lineRule: 'auto' },
      tabStops: [{
        type: TabStopType.RIGHT,
        position: contentWidth,
      }],
      children: [
        new TextRun({
          text: HEADER_TITLE,
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 18, // 9pt
        }),
        new TextRun({
          text: '\t',
          size: 18,
        }),
        new TextRun({
          children: [PageNumber.CURRENT],
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 18,
        }),
        new TextRun({
          text: ' / ',
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 18,
        }),
        new TextRun({
          children: [PageNumber.TOTAL_PAGES],
          font: { ascii: FONT_EN, eastAsia: FONT_CN },
          size: 18,
        }),
      ],
    })],
  });
}

function makeEmptyHeader() {
  return new Header({
    children: [new Paragraph({ children: [] })],
  });
}

function makeEmptyFooter() {
  return new Footer({
    children: [new Paragraph({ children: [] })],
  });
}

// ====== 创建文档 ======
// 关键变更: 添加 styles 定义 Heading1/Heading2 样式
const doc = new Document({
  styles: {
    default: {
      heading1: {
        run: {
          font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
          size: 30, // 15pt
          bold: true,
        },
        paragraph: {
          alignment: AlignmentType.CENTER,
          spacing: { after: 200, before: 300, line: 360, lineRule: 'auto' },
        },
      },
      heading2: {
        run: {
          font: { ascii: FONT_EN, eastAsia: FONT_YAHEI },
          size: 24, // 12pt
          bold: true,
        },
        paragraph: {
          spacing: { after: 100, before: 200, line: 360, lineRule: 'auto' },
        },
      },
    },
  },
  sections: [
    // 封面页（无页眉页脚）
    {
      properties: {
        page: {
          size: {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top: MARGIN_TOP,
            bottom: MARGIN_BOTTOM,
            left: MARGIN_LEFT,
            right: MARGIN_RIGHT,
            header: HEADER_DISTANCE,
            footer: FOOTER_DISTANCE,
          },
        },
      },
      headers: {
        default: makeEmptyHeader(),
      },
      footers: {
        default: makeEmptyFooter(),
      },
      children: coverContent,
    },
    // 目录页（有页眉，含自动目录字段）
    {
      properties: {
        page: {
          size: {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top: MARGIN_TOP,
            bottom: MARGIN_BOTTOM,
            left: MARGIN_LEFT,
            right: MARGIN_RIGHT,
            header: HEADER_DISTANCE,
            footer: FOOTER_DISTANCE,
          },
        },
      },
      headers: {
        default: makeHeader(),
      },
      footers: {
        default: makeEmptyFooter(),
      },
      children: tocContent,
    },
    // 正文（有页眉）
    {
      properties: {
        page: {
          size: {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top: MARGIN_TOP,
            bottom: MARGIN_BOTTOM,
            left: MARGIN_LEFT,
            right: MARGIN_RIGHT,
            header: HEADER_DISTANCE,
            footer: FOOTER_DISTANCE,
          },
        },
      },
      headers: {
        default: makeHeader(),
      },
      footers: {
        default: makeEmptyFooter(),
      },
      children: bodyContent,
    },
  ],
});

// ====== 生成文件 ======
const outputPath = 'E:/vscodeai/copyright/manual-v4.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`\nDocument generated: ${outputPath}`);
  console.log(`  Font: ${FONT_CN}/${FONT_EN}`);
  console.log(`  Header: ${HEADER_TITLE} + page number (left+right)`);
  console.log(`  TOC: Auto TableOfContents (Word can insert/update)`);
  console.log(`  Headings: H1(centered 15pt) + H2(left 12pt bold)`);
  console.log(`  Cover: ${coverContent.length} items`);
  console.log(`  TOC: ${tocContent.length} items`);
  console.log(`  Body: ${bodyContent.length} items`);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
