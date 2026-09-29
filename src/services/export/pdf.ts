// PDF の書き出し（詳細設計書 9.5、ADR 0006 / 0010）。
// 1ページ＝1画像とし、OCR の各行を不可視テキストで重ねて、PDF ビューアで検索・コピーできるようにする。
// まとめて書き出し（9.14）と部品を共用する
import fontkit from '@pdf-lib/fontkit';
import type { Directory } from 'expo-file-system';
import {
  beginText,
  endText,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  PDFName,
  type PDFPage,
  type PDFRef,
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
import { listPagesOfNote } from '@/db/pageRepository';
import type { Note, NoteId, OcrLine, Page } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { pageImageFile } from '@/storage/paths';

import { getNoteWithDirectory } from '../folders';

import { throwIfExportCanceled } from './cancel';
import { loadJapaneseFontBytes } from './exportFont';
import { type ExportFile, prepareExportFile, sanitizeFileName } from './fileName';

const PDF_MIME_TYPE = 'application/pdf';

/** 書き出し中の PDF と、埋め込んだフォント（ページごとの透明テキストに使う） */
export type ExportPdf = { pdf: PDFDocument; font: PDFFont };

export async function buildPdf(shelf: OpenShelf, noteId: NoteId): Promise<ExportFile> {
  const { note, directory } = await getNoteWithDirectory(shelf, noteId);
  const target = await createExportPdf();
  await addNotePages(target, shelf, note, directory);
  return savePdf(target, note.title);
}

export async function createExportPdf(): Promise<ExportPdf> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // 使った文字だけを埋め込み、フォント（約 5MB）で PDF が大きくならないようにする
  const font = await pdf.embedFont(await loadJapaneseFontBytes(), { subset: true });
  return { pdf, font };
}

/** ノートの全ページを追加し、最初のページを返す（ページがなければ null）。ページの合間に取り消しを確かめる */
export async function addNotePages(
  target: ExportPdf,
  shelf: OpenShelf,
  note: Note,
  directory: Directory,
  signal?: AbortSignal,
): Promise<PDFPage | null> {
  let firstPage: PDFPage | null = null;
  for (const page of await listPagesOfNote(shelf.db, note.id)) {
    throwIfExportCanceled(signal);
    const added = await addPdfPage(target, page, directory);
    firstPage ??= added;
  }
  return firstPage;
}

/** fileTitle は拡張子なしの名前（ノートのタイトル・ノートブック名） */
export async function savePdf(target: ExportPdf, fileTitle: string): Promise<ExportFile> {
  const file = prepareExportFile(`${sanitizeFileName(fileTitle)}.pdf`);
  file.write(await target.pdf.save());
  return { uri: file.uri, mimeType: PDF_MIME_TYPE };
}

/**
 * しおり（アウトライン）を付ける（詳細設計書 9.14）。pdf-lib にはしおりを作る関数がないため、
 * PDF の辞書を直接組み立てる。タイトルは日本語を含むため UTF-16 の文字列にする
 */
export function addOutline(pdf: PDFDocument, entries: { title: string; page: PDFPage }[]): void {
  if (entries.length === 0) return;
  const { context } = pdf;
  const outlinesRef = context.nextRef();
  const itemRefs = entries.map(() => context.nextRef());
  entries.forEach((entry, index) => {
    const links: Record<string, PDFRef> = {};
    const previous = itemRefs[index - 1];
    const next = itemRefs[index + 1];
    if (previous) links.Prev = previous;
    if (next) links.Next = next;
    context.assign(
      itemRefs[index]!,
      context.obj({
        Title: PDFHexString.fromText(entry.title),
        Parent: outlinesRef,
        Dest: [entry.page.ref, 'XYZ', null, null, null],
        ...links,
      }),
    );
  });
  context.assign(
    outlinesRef,
    context.obj({
      Type: 'Outlines',
      First: itemRefs[0]!,
      Last: itemRefs[itemRefs.length - 1]!,
      Count: entries.length,
    }),
  );
  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef);
  // 対応するビューアでは、開いたときにしおりの一覧を出す
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

async function addPdfPage(
  { pdf, font }: ExportPdf,
  page: Page,
  noteDirectory: Directory,
): Promise<PDFPage> {
  const image = await pdf.embedJpg(await pageImageFile(noteDirectory, page.position).bytes());
  const pageWidth = PDF_PAGE_WIDTH_PT;
  const pageHeight = (pageWidth * image.height) / image.width;
  const pdfPage = pdf.addPage([pageWidth, pageHeight]);
  pdfPage.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  // フォントの登録はページごとに1回でよい（行ごとに登録すると同じ辞書が行数分増える）
  const fontKey = pdfPage.node.newFontDictionary(font.name, font.ref);
  for (const line of page.ocrLines.filter(hasDrawableText)) {
    drawInvisibleLine(pdfPage, font, fontKey, line);
  }
  return pdfPage;
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
