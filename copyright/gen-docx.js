/*
 * 软著源代码文档生成器 V2
 * 将源代码转换为符合软著申请要求的 Word 文档
 * 要求：微软雅黑、六号字体(7.5pt)、60页、代码无空行、有页眉
 * 
 * 策略：使用分页符强制每页固定行数，配合精确行距
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, PageNumber, PageBreak, BorderStyle,
  PageOrientation, TabStopType
} = require('docx');

// ====== 配置 ======
const FONT_NAME = 'Microsoft YaHei'; // 微软雅黑
const FONT_SIZE = 15;                // 六号 = 7.5pt = 15 half-points
const HEADER_TITLE = '堡垒机安全远程运维管理平台源代码';
const TARGET_PAGES = 60;

// A4 页面尺寸 (DXA: 1440 = 1 inch, 1mm = 56.7 DXA)
// A4: 210mm x 297mm = 11906 x 16838 DXA
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;

// 页边距设计（缩小上下边距，减少页眉对正文的挤压）
// 实际测试：20mm边距时62页，说明页眉挤压了正文区域
// 改为上下 15mm，左右 12mm（与原HTML一致）
const MARGIN_TOP = 850;      // 15mm
const MARGIN_BOTTOM = 850;   // 15mm
const MARGIN_LEFT = 680;     // 12mm
const MARGIN_RIGHT = 680;    // 12mm
const HEADER_DISTANCE = 425;  // 7.5mm from top edge
const FOOTER_DISTANCE = 425;  // 7.5mm from bottom edge

// 内容区域高度 = 16838 - 850 - 850 = 15138 DXA
// 实际渲染62页（非60页），说明页眉挤压正文约 600 DXA
// 有效内容区 ≈ 15138 - 600 = 14538 DXA
// 但我们有分页符控制每页行数，问题在于每页分配的行数太多
// 实际每页可容纳约 55 行（3441/62 ≈ 55.5）
// 改为每页 55-58 行，配合较小行距确保不溢出
// 3441行/60页：前41页58行 + 后19页57行 = 2378+1083 = 3461 ❌
// 改为：每页固定 57 行，前21页58行后39页57行
// 但实际每页只能放约55行，所以需要减少到 55行/页
// 55*60 = 3300，不够3441
// 57*60 = 3420，差21行
// 用 58行/页 × 21 + 57行/页 × 39 = 3441
// 但如果实际每页只能放55行，58行会溢出
// 
// 策略：不使用固定行数分页，而是让内容自然流动
// 调整行距让 3441 行自然分页为 60 页
// 3441/60 = 57.35行/页
// 有效内容区需要精确计算
// 实际62页 = 3441/62 = 55.5行/页
// 要变成60页 = 3441/60 = 57.35行/页
// 需要每页多放2行，即减小行距
// 当前 250 DXA → 实际每页55行
// 需要每页57行 → 行距 = 250 * (55/57) = 241 DXA
// 策略：不用分页符，让内容自然流动
// 通过精确调整行距让 3441 行自然分页为 60 页
// 之前：边距20mm+行距250 → 62页（每页约55.5行）
// 目标：60页（每页约57.35行）
// 方案1：减小行距 → 250 * (55.5/57.35) = 242 → 用 240
// 方案2：同时减小上下边距释放更多内容空间
// 用 15mm 边距 + 240 DXA 行距，无分页符
// 内容区 = 16838 - 850 - 850 = 15138 DXA
// 页眉挤压约 500 DXA → 有效区 ≈ 14638
// 14638 / 240 = 60.9 行/页 → 3441/61 = 56.4 ❌ 可能还是61页
// 
// 更激进：行距 230 (11.5pt)
// 14638 / 230 = 63.6 → 3441/63.6 = 54.1页 ❌ 太少
//
// 最终方案：保留分页符，每页分配准确行数
// 实际测试：250 DXA + 20mm边距 = 62页（每页55.5行）
// 改为 15mm 边距，内容区增大 568 DXA，每页可多放约2行 → 57.5行/页
// 3441/57.5 = 59.8 ≈ 60页
// 行距保持 250，每页分配 57 行，60页共 3420 行，差 21 行
// 前21页放58行
// 但实际每页能放 57.5 行，58 行可能溢出
// 安全方案：每页 57 行 × 60 页 = 3420，需要从代码中删 21 行 → 不好
//
// 最佳方案：用分页符 + 每页 57 行 + 减小行距到 240
// 有效区 ≈ 15138 - 500(header) = 14638
// 14638 / 240 = 61 行/页 → 57 行不会溢出 ✅
// 57*60 = 3420 < 3441 → 前21页放58行：21*58+39*57 = 3441 ✅
// 58行 * 240 = 13920 < 14638 ✅ 不会溢出
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM; // 15138
const LINE_SPACING = 240; // 12pt fixed line spacing

// ====== 读取代码行 ======
const codeContent = fs.readFileSync('/tmp/code_lines.txt', 'utf-8');
const allLines = codeContent.split('\n').filter(l => l !== '');

console.log(`Total code lines: ${allLines.length}`);
console.log(`First line: ${allLines[0]}`);
console.log(`Last line: ${allLines[allLines.length - 1]}`);

// 计算分页：3441 / 60 = 57.35
// 前 21 页放 58 行，后 39 页放 57 行：21*58 + 39*57 = 1218 + 2223 = 3441
const totalLines = allLines.length;
const baseLines = Math.floor(totalLines / TARGET_PAGES); // 57
const extraLines = totalLines - baseLines * TARGET_PAGES;  // 3441 - 57*60 = 3441-3420 = 21

console.log(`Base lines per page: ${baseLines}, extra lines: ${extraLines}`);
console.log(`First ${extraLines} pages: ${baseLines + 1} lines each`);
console.log(`Remaining ${TARGET_PAGES - extraLines} pages: ${baseLines} lines each`);

// 分配行到每一页
const pageAssignments = [];
let lineIndex = 0;
for (let page = 0; page < TARGET_PAGES; page++) {
  const linesThisPage = baseLines + (page < extraLines ? 1 : 0);
  const pageLines = allLines.slice(lineIndex, lineIndex + linesThisPage);
  pageAssignments.push(pageLines);
  lineIndex += linesThisPage;
}

console.log(`Page 1: ${pageAssignments[0].length} lines, starts: "${pageAssignments[0][0]}"`);
console.log(`Page 21: ${pageAssignments[20].length} lines`);
console.log(`Page 22: ${pageAssignments[21].length} lines`);
console.log(`Page 60: ${pageAssignments[59].length} lines, ends: "${pageAssignments[59][pageAssignments[59].length - 1]}"`);

// ====== 构建 Word 文档 ======
const paragraphs = [];

for (let pageIdx = 0; pageIdx < pageAssignments.length; pageIdx++) {
  const pageLines = pageAssignments[pageIdx];

  for (let lineIdx = 0; lineIdx < pageLines.length; lineIdx++) {
    const line = pageLines[lineIdx];
    const isLastLineOfPage = (lineIdx === pageLines.length - 1);
    const isLastPage = (pageIdx === pageAssignments.length - 1);

    // 构建段落
    const children = [new TextRun({
      text: line,
      font: FONT_NAME,
      size: FONT_SIZE,
    })];

    // 在每页最后一行后添加分页符（最后一页除外）
    if (isLastLineOfPage && !isLastPage) {
      children.push(new PageBreak());
    }

    const para = new Paragraph({
      children: children,
      spacing: {
        before: 0,
        after: 0,
        line: LINE_SPACING,    // 固定行距 12.5pt
        lineRule: 'exact',
      },
    });

    paragraphs.push(para);
  }
}

// 创建文档
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: FONT_NAME,
          size: FONT_SIZE,
        },
      },
    },
  },
  sections: [{
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
          footer: 0,    // 不预留页脚空间（页码已合并到页眉）
        },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({
              text: HEADER_TITLE,
              font: FONT_NAME,
              size: 16,  // 八号 = 8pt
            }),
            new TextRun({
              text: '\t',
              font: FONT_NAME,
              size: 16,
            }),
            new TextRun({
              children: [PageNumber.CURRENT],
              font: FONT_NAME,
              size: 16,
            }),
            new TextRun({
              text: ' / ',
              font: FONT_NAME,
              size: 16,
            }),
            new TextRun({
              children: [PageNumber.TOTAL_PAGES],
              font: FONT_NAME,
              size: 16,
            }),
          ],
          alignment: AlignmentType.LEFT,
          tabStops: [{
            type: TabStopType.RIGHT,
            position: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, // 内容区宽度，右对齐
          }],
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,     // 0.75pt
              color: '000000',
              space: 2,
            },
          },
          spacing: {
            after: 0,
            before: 0,
            line: 200,    // 页眉行距 10pt
            lineRule: 'exact',
          },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [],
      }),
    },
    children: paragraphs,
  }],
});

// 生成文件
const outputPath = 'E:/vscodeai/copyright/source-code-v2.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`\n✅ Document generated: ${outputPath}`);
  console.log(`   Total paragraphs: ${paragraphs.length}`);
  console.log(`   Total code lines: ${totalLines}`);
  console.log(`   Target pages: ${TARGET_PAGES}`);
  console.log(`   Font: ${FONT_NAME} (${FONT_SIZE / 2}pt = 六号)`);
  console.log(`   Line spacing: exact ${LINE_SPACING / 20}pt`);
  console.log(`   Content area: ${CONTENT_HEIGHT} DXA`);
  console.log(`   Lines per page: ${baseLines} or ${baseLines + 1}`);
  console.log(`   Page breaks: ${TARGET_PAGES - 1}`);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
