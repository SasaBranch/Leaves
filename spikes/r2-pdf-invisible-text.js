// R-2 検証: pdf-lib で「画像＋日本語の不可視テキスト」の PDF を作れるか、生成時間はどれくらいか。
// 詳細設計書 9.5 の座標計算（A4 幅・相対座標・Tr 3・Tz）をそのまま使う。
// 準備: sips -s format jpeg -z 2400 1800 assets/images/icon.png --out spikes/sample-page.jpg
// 実行: node spikes/r2-pdf-invisible-text.js → spikes/out/r2.pdf を作り、pdftotext で文字が取れるか確認する
const fs = require('node:fs');
const path = require('node:path');
const fontkit = require('@pdf-lib/fontkit');
const {
  PDFDocument,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} = require('pdf-lib');

const PDF_PAGE_WIDTH_PT = 595.28;
const OCR_TEXT_HEIGHT_RATIO = 0.85;
const PAGE_COUNT = 10;
const LINES_PER_PAGE = 10;
const CHARS_PER_LINE = 20; // 10ページ × 10行 × 20文字 = 2,000文字

const FONT_PATH = require.resolve(
  '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf',
);
const IMAGE_PATH = path.join(__dirname, 'sample-page.jpg');
const OUT_DIR = path.join(__dirname, 'out');

const SOURCE_TEXT =
  '固有値と固有ベクトルの定義を確認する。行列式が零になる条件から特性方程式を立てる。' +
  '線形写像の核と像の次元の関係を整理した。次回の定例会議までに見積りを出すこと。' +
  'リリース日は十月十五日で確定した。イシューとは答えを出すべき問題のことである。' +
  '対称行列の固有値は実数になる。Ax = λx (x ≠ 0) を満たす λ を求める。';

function makeOcrLines(pageIndex) {
  const lines = [];
  for (let i = 0; i < LINES_PER_PAGE; i++) {
    const start = ((pageIndex * LINES_PER_PAGE + i) * CHARS_PER_LINE) % (SOURCE_TEXT.length - CHARS_PER_LINE);
    lines.push({
      text: SOURCE_TEXT.slice(start, start + CHARS_PER_LINE),
      x: 0.08,
      y: 0.08 + i * 0.08,
      width: 0.8,
      height: 0.04,
    });
  }
  return lines;
}

// 詳細設計書 9.5 の手順 3
function drawInvisibleLine(page, fontKey, font, line, pageWidth, pageHeight) {
  const fontSize = line.height * pageHeight * OCR_TEXT_HEIGHT_RATIO;
  const naturalWidth = font.widthOfTextAtSize(line.text, fontSize);
  const horizontalScalePercent = ((line.width * pageWidth) / naturalWidth) * 100;
  const x = line.x * pageWidth;
  const y = pageHeight - (line.y + line.height) * pageHeight;
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(fontKey, fontSize),
    setTextRenderingMode(TextRenderingMode.Invisible),
    setCharacterSqueeze(horizontalScalePercent),
    setTextMatrix(1, 0, 0, 1, x, y),
    showText(font.encodeText(line.text)),
    endText(),
    popGraphicsState(),
  );
}

async function buildPdf(fontBytes, imageBytes) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const image = await pdf.embedJpg(imageBytes);
  for (let p = 0; p < PAGE_COUNT; p++) {
    const pageWidth = PDF_PAGE_WIDTH_PT;
    const pageHeight = (pageWidth * image.height) / image.width;
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const fontKey = page.node.newFontDictionary(font.name, font.ref);
    for (const line of makeOcrLines(p)) {
      drawInvisibleLine(page, fontKey, font, line, pageWidth, pageHeight);
    }
  }
  return pdf.save();
}

async function main() {
  const fontBytes = fs.readFileSync(FONT_PATH);
  const imageBytes = fs.readFileSync(IMAGE_PATH);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const heapBefore = process.memoryUsage().heapUsed;
  const times = [];
  let bytes;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    bytes = await buildPdf(fontBytes, imageBytes);
    times.push(performance.now() - start);
  }
  const heapPeakMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  fs.writeFileSync(path.join(OUT_DIR, 'r2.pdf'), bytes);

  console.log(`font=${(fontBytes.length / 1024 / 1024).toFixed(1)}MB image=${(imageBytes.length / 1024).toFixed(0)}KB`);
  console.log(`pages=${PAGE_COUNT} chars=${PAGE_COUNT * LINES_PER_PAGE * CHARS_PER_LINE}`);
  console.log(`build ms: ${times.map((t) => t.toFixed(0)).join(', ')} / pdf=${(bytes.length / 1024).toFixed(0)}KB / heap delta≈${heapPeakMb.toFixed(0)}MB`);
}

main();
