/*
 * 软著软件使用说明书生成器 V3
 * 格式参考: 杏林药安复购跟进系统-软著文档
 * 
 * 关键格式:
 * - 封面: 居中, 大标题(28pt), 副标题"系统手册", 前面有多行空行
 * - 目录: 手工编写的目录页(编号+标题+页码)
 * - 页眉: 左对齐标题 + 空格填充 + 右侧 PAGE/NUMPAGES
 * - 页脚: 空
 * - 页边距: 上1440 下1440 左1800 右1800
 * - 正文: 宋体/Times New Roman, 首行缩进2em(420 twips)
 * - 标题: heading1 居中14pt, heading2 左对齐12pt加粗
 * - 示意图: 文字标注
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, PageNumber, PageBreak, BorderStyle,
  PageOrientation, TabStopType, Table, TableRow, TableCell,
  WidthType, VerticalAlign, ShadingType
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
  // 去除 DOCTYPE/head/style 等
  const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/s);
  const bodyHTML = bodyMatch ? bodyMatch[1] : html;
  
  const elements = [];
  let pos = 0;
  const content = bodyHTML.trim();
  
  while (pos < content.length) {
    // 跳过空白
    if (content[pos] === '\n' || content[pos] === '\r' || content[pos] === ' ' || content[pos] === '\t') {
      pos++;
      continue;
    }
    
    // 找到下一个标签
    if (content[pos] === '<') {
      const tagEnd = content.indexOf('>', pos);
      if (tagEnd < 0) break;
      const tagStr = content.substring(pos, tagEnd + 1);
      
      // 自闭合标签
      const tagMatch = tagStr.match(/^<(\w+)([^>]*?)\/>/);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const attrs = parseAttrs(tagMatch[2]);
        elements.push({ type: 'tag', name: tagName, attrs, selfClose: true });
        pos = tagEnd + 1;
        continue;
      }
      
      // 开始标签
      const openMatch = tagStr.match(/^<(\w+)([^>]*?)>/);
      if (openMatch) {
        const tagName = openMatch[1].toLowerCase();
        const attrs = parseAttrs(openMatch[2]);
        
        // 结束标签位置
        if (tagName === 'br') {
          elements.push({ type: 'tag', name: 'br', attrs, selfClose: true });
          pos = tagEnd + 1;
          continue;
        }
        
        if (tagName === 'meta' || tagName === 'title' || tagName === 'link') {
          pos = tagEnd + 1;
          continue;
        }
        
        // 找结束标签
        const endTag = `</${tagName}>`;
        let endPos = findEndTag(content, tagName, tagEnd + 1);
        
        if (endPos >= 0) {
          const innerHTML = content.substring(tagEnd + 1, endPos);
          elements.push({ type: 'element', name: tagName, attrs, innerHTML });
          pos = endPos + endTag.length;
        } else {
          // 没有结束标签，当作自闭合
          elements.push({ type: 'tag', name: tagName, attrs, selfClose: true });
          pos = tagEnd + 1;
        }
        continue;
      }
    }
    
    // 文本内容
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
    
    // 只找开始标签（非自闭合）
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const openTagEnd = content.indexOf('>', nextOpen);
      if (openTagEnd >= 0) {
        // 检查是否自闭合 <tag .../>
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
  // 处理 HTML 实体
  htmlStr = htmlStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—');
  
  // 拆分 <strong> 和普通文本
  const parts = htmlStr.split(/(<strong>.*?<\/strong>)/s);
  for (const part of parts) {
    const strongMatch = part.match(/^<strong>(.*?)<\/strong>$/s);
    if (strongMatch) {
      runs.push(new TextRun({
        text: strongMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
        font: { ascii: FONT_EN, eastAsia: FONT_CN },
        bold: true,
        size: 21, // 小四 = 12pt = 24 half-points → 用 21 (10.5pt) 更接近参考
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
let currentPage = 3; // 封面=1, 目录=2, 正文从第3页开始

// 章节编号映射（用于目录）
const chapterMap = [
  { num: '一', title: '软件简介', page: 3 },
  { num: '二', title: '用户登录与角色权限', page: 4 },
  { num: '三', title: '仪表盘 — 运维态势总览', page: 5 },
  { num: '四', title: '资产管理 — 远程目标注册与维护', page: 6 },
  { num: '五', title: 'SSH 远程终端 — 浏览器内命令行操作', page: 8 },
  { num: '六', title: 'RDP 远程桌面 — 浏览器内桌面控制', page: 9 },
  { num: '七', title: '数据库管理 — Web SQL 查询工作台', page: 10 },
  { num: '八', title: '授权管理 — 访问权限分配', page: 13 },
  { num: '九', title: '安全审计 — 操作追溯与合规', page: 14 },
  { num: '十', title: '会话回放 — 历史会话复盘', page: 15 },
];

// 封面内容（参考文档格式：多行空行 + 居中标题）
// 参考文档封面：sz=56 (28pt) 大标题居中
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

// 版本信息行（空几行）
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

// ====== 目录页（参考文档格式：手工目录，编号+标题+页码） ======
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

// 目录条目（参考文档格式）
for (const ch of chapterMap) {
  // 使用 tab stop 实现"标题...页码"对齐
  const numText = `${ch.num}. `;
  const titleText = ch.title;
  const pageText = `${ch.page}`;
  
  // 估算空格数：内容区宽度约 8306 DXA ≈ 14.6cm ≈ 约45个中文字符
  // 简化：用 tab stop 右对齐页码
  const totalWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 8306 DXA
  
  children.push(new Paragraph({
    spacing: { after: 60, before: 0, line: 360, lineRule: 'auto' },
    tabStops: [{
      type: TabStopType.RIGHT,
      position: totalWidth,
    }],
    children: [
      new TextRun({
        text: numText + titleText,
        font: { ascii: FONT_EN, eastAsia: FONT_CN },
        size: 24, // 12pt
      }),
      new TextRun({
        text: '\t',
        font: { ascii: FONT_EN, eastAsia: FONT_CN },
        size: 24,
      }),
      new TextRun({
        text: pageText,
        font: { ascii: FONT_EN, eastAsia: FONT_CN },
        size: 24,
      }),
    ]
  }));
}

// 目录分页
children.push(new Paragraph({
  children: [new PageBreak()],
}));

// ====== 正文内容 ======
// 处理 HTML 元素生成 Word 内容
function processElement(el) {
  if (el.type === 'text') {
    // 独立文本（不太常见）
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
      currentPage++;
      return;
    }
    
    // h2 标题（章节标题）
    if (name === 'h2') {
      const titleText = inner.trim();
      
      // 目录标题已单独处理
      if (titleText === '目 录' || titleText === '目录') return;
      
      // 章节标题格式（参考文档：居中、加粗、较大字号）
      // 参考文档标题样式：居中, sz=30 (15pt)
      children.push(new Paragraph({
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
    
    // h3 子标题
    if (name === 'h3') {
      const titleText = inner.trim();
      // 参考文档子标题：左对齐、加粗、sz=24 (12pt)
      children.push(new Paragraph({
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
    
    // div.feature（要点列表，参考文档无此样式，转为普通段落+加粗前缀）
    if (attrs.class && attrs.class.includes('feature')) {
      const runs = parseInlineHTML(inner);
      children.push(new Paragraph({
        spacing: { after: 60, before: 60, line: 360, lineRule: 'auto' },
        indent: { firstLine: 420 },
        children: runs,
      }));
      return;
    }
    
    // div.ss / div.ph（截图占位符 → 参考文档格式："XXX示意图"）
    if (attrs.class && attrs.class.includes('ss') || (name === 'div' && inner.includes('class="ph"'))) {
      // 提取占位符文字
      const phMatch = inner.match(/\[([^\]]+)\]/);
      const phText = phMatch ? phMatch[1].replace(/&mdash;/g, '—') : '示意图';
      // 参考文档格式：居中显示 "XXX示意图"
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
    if (name === 'div' && attrs.class && attrs.class.includes('ver')) return; // 封面版本，已处理
    
    // 通用 div（包含内嵌元素）
    if (name === 'div') {
      // 递归处理内部内容
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
        // 加 • 标记
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
      // 解析表格
      const rows = inner.match(/<tr[^>]*>(.*?)<\/tr>/gs) || [];
      const tableRows = [];
      
      for (const rowStr of rows) {
        const cells = rowStr.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs) || [];
        const tableCells = [];
        let isHeaderRow = false;
        
        for (const cellStr of cells) {
          const isHeader = cellStr.startsWith('<th');
          if (isHeader) isHeaderRow = true;
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
        // 表格后空一行
        children.push(new Paragraph({ spacing: { after: 60, before: 60, line: 360, lineRule: 'auto' }, children: [] }));
      }
      return;
    }
    
    // 其他未处理的标签
  }
}

// 处理所有解析出的元素
for (const el of parsed) {
  processElement(el);
}

// ====== 分离封面、目录、正文 ======
// 由于 docx 库的 Paragraph 对象结构复杂，无法用 instanceof PageBreak 检测
// 改用已知位置切分：
// 封面 = 所有空行 + 标题 + 版本信息（约前15个元素）
// 目录 = "目录"标题 + 10个目录条目 + 空行（约10-25个元素）
// 正文 = 之后的全部内容

// 找封面结束位置（"2026年7月" 那个段落之后就是 PageBreak 段落）
let coverEnd = -1;
let tocEnd = -1;

for (let i = 0; i < children.length; i++) {
  // 封面结束：找包含 PageBreak 的段落（封面分页）
  // 目录结束：找第二个包含 PageBreak 的段落（目录分页）
  // docx 库把 PageBreak 作为特殊对象嵌套，我们用文本特征判断
  if (children[i] instanceof Paragraph) {
    // 检查段落是否有文本内容
    const text = extractParagraphText(children[i]);
    if (text === '' && i > 10 && i < 20 && coverEnd < 0) {
      // 封面后的空段（PageBreak 段落通常没有文字）
      coverEnd = i;
    }
  }
}

// 更简单的方案：搜索已知文本定位
let foundDateLine = false;
for (let i = 0; i < children.length; i++) {
  if (children[i] instanceof Paragraph) {
    const text = extractParagraphText(children[i]);
    if (text.includes('2026年7月')) {
      coverEnd = i + 1; // 日期行之后就是分页段落
      foundDateLine = true;
      break;
    }
  }
}

// 找目录结束位置（目录最后一个条目之后）
let tocFound = false;
let tocLastEntry = -1;
for (let i = coverEnd; i < children.length; i++) {
  if (children[i] instanceof Paragraph) {
    const text = extractParagraphText(children[i]);
    if (text.includes('目录')) {
      tocFound = true;
    }
    if (tocFound && text.includes('十') && text.includes('会话回放')) {
      tocLastEntry = i;
      break;
    }
  }
}

tocEnd = tocLastEntry + 1; // 最后目录条目之后是分页段落

const coverContent = children.slice(0, coverEnd);
const tocContent = children.slice(coverEnd, tocEnd);
const bodyContent = children.slice(tocEnd);

console.log(`Cover: ${coverContent.length} items, TOC: ${tocContent.length} items, Body: ${bodyContent.length} items`);

// 提取段落文本的辅助函数
function extractParagraphText(p) {
  // docx 库的 Paragraph 对象有 root[0] (w:p) 结构
  // 简化：遍历其内部结构提取文字
  try {
    let text = '';
    // Paragraph 的内部结构可能用 .root 属性
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

// ====== 页眉（参考文档格式：左标题 + 空格填充 + 右页码） ======
// 参考文档的页眉：pStyle=13(header style), jc=both(两端对齐)
// 内容："杏林药安复购跟进系统" + 大量空格 + PAGE / NUMPAGES
// 使用 tab stop 实现更优雅的版本

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
          size: 18, // 9pt (参考文档用小字号)
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
const doc = new Document({
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
    // 目录页（无页眉，或和正文共用）
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
const outputPath = 'E:/vscodeai/copyright/manual-v3.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`\n✅ Document generated: ${outputPath}`);
  console.log(`   Font: ${FONT_CN}/${FONT_EN}`);
  console.log(`   Header: ${HEADER_TITLE} + page number (left+right)`);
  console.log(`   Margins: top/bottom ${MARGIN_TOP}, left/right ${MARGIN_LEFT}`);
  console.log(`   Cover: ${coverContent.length} items`);
  console.log(`   TOC: ${tocContent.length} items`);
  console.log(`   Body: ${bodyContent.length} items`);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
