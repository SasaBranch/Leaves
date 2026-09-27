// PDF の書き出し（詳細設計書 9.5、ADR 0006 / 0010）。
// 1ページ＝1画像とし、OCR の各行を不可視テキストで重ねて、PDF ビューアで検索・コピーできるようにする。
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import fontkit from '@pdf-lib/fontkit';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import {
  beginText,
  endText,
  PDFDocument,
  type PDFFont,
  type PDFName,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from 'pdf-lib';

import { OCR_TEXT_HEIGHT_RATIO, PDF_PAGE_WIDTH_PT } from '@/config';
import type { Db } from '@/db/db';
import { findNote } from '@/db/noteRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import type { NoteId, OcrLine, Page } from '@/domain/types';
import { pageImageFile } from '@/storage/paths';

import { type ExportFile, prepareExportFile, sanitizeFileName } from './fileName';

const PDF_MIME_TYPE = 'application/pdf';

export async function buildPdf(db: Db, noteId: NoteId): Promise<ExportFile> {
  const note = await findNote(db, noteId);
  if (!note) throw new Error(`書き出すノートが見つかりません: ${noteId}`);
  const pages = await listPagesOfNote(db, noteId);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // 使った文字だけを埋め込み、フォント（約 5MB）で PDF が大きくならないようにする
  const font = await pdf.embedFont(await loadJapaneseFontBytes(), { subset: true });
  for (const page of pages) {
    await addPdfPage(pdf, font, page);
  }

  const file = prepareExportFile(`${sanitizeFileName(note.title)}.pdf`);
  file.write(await pdf.save());
  return { uri: file.uri, mimeType: PDF_MIME_TYPE };
}

async function loadJapaneseFontBytes(): Promise<Uint8Array> {
  const asset = await Asset.fromModule(NotoSansJP_400Regular).downloadAsync();
  if (!asset.localUri) throw new Error('PDF 用のフォントを読み込めませんでした');
  return new File(asset.localUri).bytes();
}

async function addPdfPage(pdf: PDFDocument, font: PDFFont, page: Page): Promise<void> {
  const image = await pdf.embedJpg(await pageImageFile(page.id).bytes());
  const pageWidth = PDF_PAGE_WIDTH_PT;
  const pageHeight = (pageWidth * image.height) / image.width;
  const pdfPage = pdf.addPage([pageWidth, pageHeight]);
  pdfPage.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  // フォントの登録はページごとに1回でよい（行ごとに登録すると同じ辞書が行数分増える）
  const fontKey = pdfPage.node.newFontDictionary(font.name, font.ref);
  for (const line of page.ocrLines.filter(hasDrawableText)) {
    drawInvisibleLine(pdfPage, font, fontKey, line);
  }
}

// 文字のない行や大きさのない行は、検索の役に立たず、拡大率の計算が 0 除算になるため描かない
function hasDrawableText(line: OcrLine): boolean {
  return line.text.trim() !== '' && line.width > 0 && line.height > 0;
}

// pdf-lib の高水準 API は描画モード（Tr）と水平拡大率（Tz）を扱えないため、低水準の演算子で書く
function drawInvisibleLine(pdfPage: PDFPage, font: PDFFont, fontKey: PDFName, line: OcrLine): void {
  const { width, height } = pdfPage.getSize();
  const placement = placeInvisibleLine(line, width, height, (text, fontSize) =>
    font.widthOfTextAtSize(text, fontSize),
  );
  pdfPage.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(fontKey, placement.fontSize),
    setTextRenderingMode(TextRenderingMode.Invisible),
    setCharacterSqueeze(placement.horizontalScalePercent),
    setTextMatrix(1, 0, 0, 1, placement.x, placement.y),
    showText(font.encodeText(line.text)),
    endText(),
    popGraphicsState(),
  );
}

export type InvisibleLinePlacement = {
  /** 行の左下（PDF は左下原点、単位 pt） */
  x: number;
  y: number;
  fontSize: number;
  /** 文字列の幅を行の幅に合わせるための水平拡大率（%、PDF の Tz） */
  horizontalScalePercent: number;
};

/**
 * OCR の1行（画像に対する左上原点の相対座標）を、PDF ページ上の位置・文字サイズ・水平拡大率にする
 * （詳細設計書 9.5 手順 3）。measureWidth は、その文字サイズで描いたときの文字列の幅（pt）
 */
export function placeInvisibleLine(
  line: OcrLine,
  pageWidth: number,
  pageHeight: number,
  measureWidth: (text: string, fontSize: number) => number,
): InvisibleLinePlacement {
  // 行の上下には余白があるため、文字サイズは行の高さより少し小さくする
  const fontSize = line.height * pageHeight * OCR_TEXT_HEIGHT_RATIO;
  const naturalWidth = measureWidth(line.text, fontSize);
  return {
    x: line.x * pageWidth,
    y: pageHeight - (line.y + line.height) * pageHeight,
    fontSize,
    horizontalScalePercent: ((line.width * pageWidth) / naturalWidth) * 100,
  };
}
