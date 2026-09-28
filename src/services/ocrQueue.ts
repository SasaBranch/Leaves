// OCR キュー（詳細設計書 9.2）。端末の負荷を抑えるため、1ページずつ順番に処理する。
// 状態遷移: pending → processing → done / failed、failed → pending（再実行）、
// 開いたときに processing → pending（中断分の復旧。NFR-R-03）。
// 対象は開いている本棚だけ。結果はノートの .leaves.json → DB の順に保存する（ADR 0016）
import { findNote } from '@/db/noteRepository';
import {
  findPage,
  listPageIdsByOcrStatus,
  resetInterruptedOcr,
  saveOcrResult,
  updateOcrStatus,
} from '@/db/pageRepository';
import type { OcrLine, Page, PageId } from '@/domain/types';
import { recognizeText, type RecognizedLine } from '@/native/textRecognizer';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import type { ManifestOcrStatus } from '@/storage/manifest';
import { pageImageFile } from '@/storage/paths';

import { locateNoteDirectory, updateNoteManifest } from './folders';

const waitingPageIds: PageId[] = [];
let queueShelf: OpenShelf | null = null;
let isProcessing = false;

/** 本棚を開いたときに呼ぶ。中断された OCR を戻し、未処理のページをすべて投入する */
export async function startOcrQueue(shelf: OpenShelf): Promise<void> {
  queueShelf = shelf;
  await resetInterruptedOcr(shelf.db, new Date().toISOString());
  enqueueOcr(await listPageIdsByOcrStatus(shelf.db, 'pending'));
}

/** 本棚を閉じる前に呼ぶ。認識中の1件は、結果を捨てる（閉じた本棚に書かないため） */
export function stopOcrQueue(): void {
  queueShelf = null;
  waitingPageIds.length = 0;
}

/** startOcrQueue より前に呼ばれた分は、開始時にまとめて処理される */
export function enqueueOcr(pageIds: PageId[]): void {
  for (const id of pageIds) {
    if (!waitingPageIds.includes(id)) waitingPageIds.push(id);
  }
  void processWaitingPages();
}

/** 失敗したページを再実行する（FR-O-05） */
export async function retryOcr(shelf: OpenShelf, pageId: PageId): Promise<void> {
  await saveOcrOutcome(shelf, pageId, 'pending', { text: '', lines: [] });
  notifyDataChanged();
  enqueueOcr([pageId]);
}

async function processWaitingPages(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    for (let shelf = queueShelf; shelf && waitingPageIds.length > 0; shelf = queueShelf) {
      const pageId = waitingPageIds.shift()!;
      await recognizePage(shelf, pageId);
    }
  } finally {
    isProcessing = false;
  }
}

async function recognizePage(shelf: OpenShelf, pageId: PageId): Promise<void> {
  const page = await findPage(shelf.db, pageId);
  if (!page || page.ocrStatus !== 'pending') return; // 削除済み・処理済みは飛ばす

  await updateOcrStatus(shelf.db, pageId, 'processing', new Date().toISOString());
  notifyDataChanged();
  try {
    const startedAt = performance.now();
    const result = await recognizeText((await locatePageImage(shelf, page)).uri);
    // 性能計測（#33、NFR-P-05: 1ページ3秒以内）
    if (__DEV__) console.log(`[perf] ocr: ${(performance.now() - startedAt).toFixed(0)}ms`);
    if (queueShelf !== shelf) return; // 認識中に本棚が閉じられた
    await saveOcrOutcome(shelf, pageId, 'done', {
      text: result.text,
      lines: toRelativeOcrLines(result.lines, page),
    });
  } catch (error) {
    console.warn(`文字認識に失敗しました: ${pageId}`, error);
    if (queueShelf !== shelf) return;
    await saveOcrOutcome(shelf, pageId, 'failed', { text: '', lines: [] }).catch(() => undefined);
  }
  notifyDataChanged();
}

async function locatePageImage(shelf: OpenShelf, page: Page) {
  const note = await findNote(shelf.db, page.noteId);
  if (!note) throw new Error(`ノートがありません: ${page.noteId}`);
  return pageImageFile(await locateNoteDirectory(shelf, note), page.position);
}

/**
 * 結果を .leaves.json → DB の順に保存する。.leaves.json に該当ページがない
 * （認識中に外部で消された）場合は、DB にも書かない（次の外部変更の反映で消える）
 */
async function saveOcrOutcome(
  shelf: OpenShelf,
  pageId: PageId,
  status: ManifestOcrStatus,
  result: { text: string; lines: OcrLine[] },
): Promise<void> {
  await shelf.runExclusively(async () => {
    const page = await findPage(shelf.db, pageId);
    const note = page && (await findNote(shelf.db, page.noteId));
    if (!page || !note) return;
    let isInManifest = false;
    updateNoteManifest(await locateNoteDirectory(shelf, note), (manifest) => ({
      ...manifest,
      pages: manifest.pages.map((entry) => {
        if (entry.id !== pageId) return entry;
        isInManifest = true;
        return { ...entry, ocrStatus: status, ocrText: result.text, ocrLines: result.lines };
      }),
    }));
    if (!isInManifest) return;
    const now = new Date().toISOString();
    if (status === 'done') {
      await saveOcrResult(shelf.db, pageId, result, now);
    } else {
      await updateOcrStatus(shelf.db, pageId, status, now);
    }
  });
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
