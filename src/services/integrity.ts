// 起動時の保守処理（詳細設計書 9.6）。画面表示の後に裏で行い、起動時間に影響させない（NFR-P-01）。
import type { Db } from '@/db/db';
import { listAllPageIds } from '@/db/pageRepository';
import {
  clearImageOperationMark,
  deletePageImages,
  listStoredPageIds,
  wasImageOperationInterrupted,
} from '@/storage/pageImages';
import { exportDirectory } from '@/storage/paths';

import { startOcrQueue } from './ocrQueue';

export async function runStartupMaintenance(db: Db): Promise<void> {
  // 画像フォルダの一覧は数千枚で数秒かかるため、前回が途中で終わったときだけ行う（ADR 0015）
  if (wasImageOperationInterrupted()) {
    await removeOrphanPageImages(db);
    clearImageOperationMark();
  }
  clearExportDirectory();
  await startOcrQueue(db);
}

/**
 * DB にないページの画像を削除する（保存・削除の途中で終了したときの残骸。NFR-R-01）。
 * 逆に「DB にあるが画像がない」ページは消さない。利用者のデータを勝手に消さないため
 */
export async function removeOrphanPageImages(db: Db): Promise<number> {
  const pageIdsInDb = new Set(await listAllPageIds(db));
  const orphanIds = listStoredPageIds().filter((id) => !pageIdsInDb.has(id));
  deletePageImages(orphanIds);
  return orphanIds.length;
}

/** 共有後に消し損ねた書き出しファイルを消す */
function clearExportDirectory(): void {
  const directory = exportDirectory();
  if (directory.exists) directory.delete();
}
