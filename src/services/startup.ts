// 起動時・本棚を開いたときの処理（詳細設計書 9.6）。
import { readAppSettings } from '@/storage/appSettings';
import { exportDirectory, workDirectory } from '@/storage/paths';
import type { OpenShelf } from '@/state/openShelf';

import { migrateLegacyDataIfPresent } from './legacyMigration';
import { startOcrQueue } from './ocrQueue';
import { listShelves, openShelf } from './shelves';
import { syncShelf } from './sync/syncShelf';

/**
 * 画面表示の前に行う: v1.0 のデータの移行（初回のみ）→ 最後に開いた本棚（なければ一覧の先頭）を開く。
 * 本棚が1つもなければ null（本棚の作成画面を表示する。FR-V-01）
 */
export async function openInitialShelf(): Promise<OpenShelf | null> {
  await migrateLegacyDataIfPresent();
  const shelves = listShelves();
  const { lastOpenedShelfId } = readAppSettings();
  const shelf = shelves.find((candidate) => candidate.id === lastOpenedShelfId) ?? shelves[0];
  return shelf ? openShelf(shelf) : null;
}

/**
 * 本棚を開いた後、画面表示の後に裏で行う（NFR-P-01）: 一時フォルダの残骸を消す →
 * 外部変更を反映する → OCR キューを始める
 */
export async function runShelfMaintenance(shelf: OpenShelf): Promise<void> {
  await shelf.runExclusively(async () => {
    for (const directory of [workDirectory(), exportDirectory()]) {
      if (directory.exists) directory.delete();
    }
  });
  await syncShelf(shelf);
  await startOcrQueue(shelf);
}
