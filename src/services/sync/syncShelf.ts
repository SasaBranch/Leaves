// 外部変更の反映（基本設計書 6.7、詳細設計書 9.9）。本棚フォルダを走査し、索引 DB を合わせる。
// 呼ばれるのは起動時・本棚を開いたとき・前面に戻ったとき。
import { ICLOUD_RESYNC_DELAY_MS, ICLOUD_RESYNC_MAX_TIMES } from '@/config';
import {
  deleteNotebooksByIds,
  deleteNotesByIds,
  loadIndexSnapshot,
  replaceNotePages,
  upsertNote,
  upsertNotebook,
} from '@/db/indexRepository';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import { deleteThumbnails, ensureThumbnail } from '@/storage/pageImages';
import { pageImageFile } from '@/storage/paths';

import { enqueueOcr } from '../ocrQueue';

import { diffIndex, hasChanges, type IndexChanges } from './diffIndex';
import { scanShelf } from './scanShelf';

const runningSyncs = new WeakMap<OpenShelf, Promise<void>>();
const queuedSyncs = new WeakMap<OpenShelf, Promise<void>>();

/**
 * 反映中に再び呼ばれた場合は、終わってからもう1回だけ行う（連続して呼ばれても走査は最大2回）。
 * 反映中に起きた外部変更も、2回目で拾える
 */
export function syncShelf(shelf: OpenShelf): Promise<void> {
  const queued = queuedSyncs.get(shelf);
  if (queued) return queued;
  const running = runningSyncs.get(shelf);
  if (!running) return startSync(shelf);
  const next = running
    .catch(() => undefined)
    .then(() => {
      queuedSyncs.delete(shelf);
      return startSync(shelf);
    });
  queuedSyncs.set(shelf, next);
  return next;
}

function startSync(shelf: OpenShelf): Promise<void> {
  const running = runSync(shelf).finally(() => {
    if (runningSyncs.get(shelf) === running) runningSyncs.delete(shelf);
  });
  runningSyncs.set(shelf, running);
  return running;
}

async function runSync(shelf: OpenShelf): Promise<void> {
  const startedAt = performance.now();
  const { changes, hasPendingDownloads } = await shelf.runExclusively(async () => {
    const now = new Date().toISOString();
    const index = await loadIndexSnapshot(shelf.db);
    const scan = await scanShelf(shelf.directory, shelf.id, index, now);
    for (const failure of scan.failures) {
      console.warn(`外部変更の反映で読めなかったフォルダ: ${failure.uri}`, failure.error);
    }
    const diff = diffIndex(index, scan, now);
    await applyIndexChanges(shelf, diff, now);
    return { changes: diff, hasPendingDownloads: scan.hasPendingDownloads };
  });
  // 性能計測（NFR-P-07: 変更なし時 5秒以内）
  if (__DEV__) console.log(`[perf] sync: ${(performance.now() - startedAt).toFixed(0)}ms`);
  if (hasChanges(changes)) notifyDataChanged();
  enqueueOcr(changes.pendingPageIds);
  scheduleICloudResync(shelf, hasPendingDownloads);
}

const iCloudResyncCounts = new WeakMap<OpenShelf, number>();

/**
 * iCloud のダウンロード待ちがあったら、少し待ってからもう一度反映する（FR-L-06）。
 * 回数に上限を設け、それ以降は次に前面に戻ったときに反映する（届かないファイルで反映を繰り返さないため）
 */
function scheduleICloudResync(shelf: OpenShelf, hasPendingDownloads: boolean): void {
  const count = (iCloudResyncCounts.get(shelf) ?? 0) + 1;
  if (!hasPendingDownloads || count > ICLOUD_RESYNC_MAX_TIMES) {
    iCloudResyncCounts.delete(shelf);
    return;
  }
  iCloudResyncCounts.set(shelf, count);
  setTimeout(() => {
    syncShelf(shelf).catch((error: unknown) =>
      console.warn('iCloud のダウンロード後の反映に失敗しました', error),
    );
  }, ICLOUD_RESYNC_DELAY_MS);
}

/**
 * DB を1トランザクションで更新する。移動されたものの親を先に付け替えてから消す
 * （消すノートブックの CASCADE で、よそへ移ったノートまで消さないため）
 */
async function applyIndexChanges(shelf: OpenShelf, changes: IndexChanges, now: string) {
  await shelf.db.transaction(async (tx) => {
    for (const notebook of changes.upsertedNotebooks) await upsertNotebook(tx, notebook);
    for (const note of changes.upsertedNotes) await upsertNote(tx, note);
    for (const { note, pages } of changes.replacedPages) {
      await replaceNotePages(tx, note.id, pages, now);
    }
    await deleteNotesByIds(tx, changes.deletedNoteIds);
    await deleteNotebooksByIds(tx, changes.deletedNotebookIds);
  });
  deleteThumbnails(shelf.id, changes.removedPageIds);
  // DB を作り直したときなど、サムネイルがないページの分を作る
  for (const { note, pages } of changes.replacedPages) {
    for (const page of pages) {
      await ensureThumbnail(shelf.id, page.id, pageImageFile(note.directory, page.position)).catch(
        (error: unknown) => console.warn(`サムネイルを作れませんでした: ${page.id}`, error),
      );
    }
  }
}
