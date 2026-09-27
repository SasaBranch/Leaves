// OCR キュー（詳細設計書 9.2）。端末の負荷を抑えるため、1ページずつ順番に処理する。
// 状態遷移: pending → processing → done / failed、failed → pending（再実行）、
// 起動時に processing → pending（中断分の復旧。NFR-R-03）
import type { Db } from '@/db/db';
import {
  findPage,
  listPageIdsByOcrStatus,
  resetInterruptedOcr,
  saveOcrResult,
  updateOcrStatus,
} from '@/db/pageRepository';
import type { OcrLine, PageId } from '@/domain/types';
import { recognizeText, type RecognizedLine } from '@/native/textRecognizer';
import { notifyDataChanged } from '@/state/dataChanges';
import { pageImageFile } from '@/storage/paths';

const waitingPageIds: PageId[] = [];
let queueDb: Db | null = null;
let isProcessing = false;

/** 起動時に1回呼ぶ。中断された OCR を戻し、未処理のページをすべて投入する */
export async function startOcrQueue(db: Db): Promise<void> {
  queueDb = db;
  await resetInterruptedOcr(db, new Date().toISOString());
  enqueueOcr(await listPageIdsByOcrStatus(db, 'pending'));
}

/** startOcrQueue より前に呼ばれた分は、開始時にまとめて処理される */
export function enqueueOcr(pageIds: PageId[]): void {
  for (const id of pageIds) {
    if (!waitingPageIds.includes(id)) waitingPageIds.push(id);
  }
  void processWaitingPages();
}

/** 失敗したページを再実行する（FR-O-05） */
export async function retryOcr(db: Db, pageId: PageId): Promise<void> {
  await updateOcrStatus(db, pageId, 'pending', new Date().toISOString());
  notifyDataChanged();
  enqueueOcr([pageId]);
}

async function processWaitingPages(): Promise<void> {
  if (isProcessing || !queueDb) return;
  isProcessing = true;
  try {
    for (let pageId = waitingPageIds.shift(); pageId; pageId = waitingPageIds.shift()) {
      await recognizePage(queueDb, pageId);
    }
  } finally {
    isProcessing = false;
  }
}

async function recognizePage(db: Db, pageId: PageId): Promise<void> {
  const page = await findPage(db, pageId);
  if (!page || page.ocrStatus !== 'pending') return; // 削除済み・処理済みは飛ばす

  await updateOcrStatus(db, pageId, 'processing', new Date().toISOString());
  notifyDataChanged();
  try {
    const startedAt = performance.now();
    const result = await recognizeText(pageImageFile(pageId).uri);
    // 性能計測（#33、NFR-P-05: 1ページ3秒以内）
    if (__DEV__) console.log(`[perf] ocr: ${(performance.now() - startedAt).toFixed(0)}ms`);
    const lines = toRelativeOcrLines(result.lines, page);
    // 認識中にページが削除されていても、UPDATE が0件になるだけで問題ない
    await saveOcrResult(db, pageId, { text: result.text, lines }, new Date().toISOString());
  } catch (error) {
    console.warn(`文字認識に失敗しました: ${pageId}`, error);
    await updateOcrStatus(db, pageId, 'failed', new Date().toISOString());
  }
  notifyDataChanged();
}

/** 認識行の位置（px）を、画像に対する相対座標（0〜1）にする。画像サイズが変わっても使えるようにするため */
export function toRelativeOcrLines(
  lines: RecognizedLine[],
  imageSize: { width: number; height: number },
): OcrLine[] {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return lines.map(({ text, frame }) => ({
    text,
    x: clamp(frame.left / imageSize.width),
    y: clamp(frame.top / imageSize.height),
    width: clamp(frame.width / imageSize.width),
    height: clamp(frame.height / imageSize.height),
  }));
}
