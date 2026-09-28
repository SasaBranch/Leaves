// v1.0 のデータ（DB・pages/・thumbs/）を本棚「マイ本棚」に移行する（基本設計書 6.9、詳細設計書 9.10）。
// 作業用フォルダで本棚を組み立ててから1回の移動で置き、最後に旧データを消す。
// 画像はコピーするので、途中で終了しても旧データは残り、次回の起動で最初からやり直せる。
// 本棚の索引 DB はここでは作らない（本棚を開いた後の外部変更の反映が、フォルダから作る）
import { Directory } from 'expo-file-system';

import { DEFAULT_SHELF_NAME, NOTEBOOK_COLORS } from '@/config';
import type { Db } from '@/db/db';
import { listNoteSummaries } from '@/db/noteRepository';
import { listAllNotebooks } from '@/db/notebookRepository';
import { openLegacyDatabase } from '@/db/openLegacyDatabase';
import { listPagesOfNote } from '@/db/pageRepository';
import { pickAvailableName, sanitizeLegacyName } from '@/domain/name';
import type { Notebook, NotebookColor, NotebookId, Page, ShelfId } from '@/domain/types';
import { newShelfId } from '@/native/randomId';
import {
  newNoteManifest,
  newNotebookManifest,
  newShelfManifest,
  writeManifest,
  type ManifestOcrStatus,
  type PageManifest,
} from '@/storage/manifest';
import { describeStoredPage } from '@/storage/pageImages';
import {
  isHiddenEntryName,
  legacyDatabaseFile,
  legacyEntries,
  legacyMigrationWorkDirectory,
  legacyPageImageFile,
  legacyThumbnailFile,
  pageImageFile,
  shelfDirectory,
  shelvesRootDirectory,
  thumbnailFile,
  thumbnailsDirectory,
} from '@/storage/paths';

/** 旧 DB があり、本棚フォルダがまだ1つもない場合だけ移行する（起動時、本棚の一覧の前に呼ぶ） */
export async function migrateLegacyDataIfPresent(): Promise<void> {
  if (!legacyDatabaseFile().exists || hasShelfFolder()) return;
  const legacy = await openLegacyDatabase(legacyDatabaseFile());
  try {
    await buildShelfFromLegacyData(legacy.db);
  } finally {
    await legacy.close();
  }
  deleteLegacyData();
}

/** 旧データのフォルダ（SQLite・pages・thumbs）は本棚ではない */
function hasShelfFolder(): boolean {
  const legacyNames = new Set(legacyEntries().map((entry) => entry.name));
  return shelvesRootDirectory()
    .list()
    .some(
      (entry) =>
        entry instanceof Directory &&
        !isHiddenEntryName(entry.name) &&
        !legacyNames.has(entry.name),
    );
}

async function buildShelfFromLegacyData(legacyDb: Db): Promise<void> {
  const work = legacyMigrationWorkDirectory();
  // 前回の途中までの残りは使わず、最初からやり直す
  if (work.exists) work.delete();
  const assembled = new Directory(work, DEFAULT_SHELF_NAME);
  assembled.create({ intermediates: true });
  const shelfId = newShelfId();
  writeManifest(assembled, newShelfManifest(shelfId, new Date().toISOString()));
  thumbnailsDirectory(shelfId).create({ intermediates: true, idempotent: true });

  const context = { db: legacyDb, shelfId, notebooks: await listAllNotebooks(legacyDb) };
  await buildFolderContents(context, assembled, null);
  assembled.moveSync(shelfDirectory(DEFAULT_SHELF_NAME));
  work.delete();
}

type BuildContext = { db: Db; shelfId: ShelfId; notebooks: Notebook[] };

/**
 * notebookId 直下のノートブック・ノートを folder の中に作る。
 * 旧 DB では同じ場所に同じ名前のノートブックとノートを置けたので、両方を合わせて重複を避ける
 */
async function buildFolderContents(
  context: BuildContext,
  folder: Directory,
  notebookId: NotebookId | null,
): Promise<void> {
  const usedNames: string[] = [];
  const createChildFolder = (legacyName: string) => {
    const name = pickAvailableName(usedNames, sanitizeLegacyName(legacyName));
    usedNames.push(name);
    const directory = new Directory(folder, name);
    directory.create();
    return directory;
  };

  for (const notebook of context.notebooks.filter((each) => each.parentId === notebookId)) {
    const directory = createChildFolder(notebook.name);
    writeManifest(directory, {
      ...newNotebookManifest(notebook.id, toKnownColor(notebook.color), notebook.createdAt),
      updatedAt: notebook.updatedAt,
    });
    await buildFolderContents(context, directory, notebook.id);
  }
  for (const note of await listNoteSummaries(context.db, notebookId, 'name')) {
    const directory = createChildFolder(note.title);
    const pages = copyPages(await listPagesOfNote(context.db, note.id), directory, context.shelfId);
    writeManifest(directory, {
      ...newNoteManifest(note.id, pages, note.createdAt),
      updatedAt: note.updatedAt,
    });
  }
}

/** ページ画像を position の順に 001.jpg … としてコピーする。画像がないページは飛ばす（番号は詰める） */
function copyPages(pages: Page[], noteFolder: Directory, shelfId: ShelfId): PageManifest[] {
  const copied: PageManifest[] = [];
  for (const page of pages) {
    const source = legacyPageImageFile(page.id);
    if (!source.exists) {
      console.warn(`移行: ページ画像がないため飛ばします: ${page.id}`);
      continue;
    }
    const target = pageImageFile(noteFolder, copied.length);
    source.copySync(target);
    // サムネイルは無くてもページ画像から作り直せる（ensureThumbnail）
    const thumbnail = legacyThumbnailFile(page.id);
    if (thumbnail.exists) thumbnail.copySync(thumbnailFile(shelfId, page.id));
    copied.push({
      ...describeStoredPage(page.id, target, page, page.createdAt),
      ocrStatus: toManifestOcrStatus(page.ocrStatus),
      ocrText: page.ocrText,
      ocrLines: page.ocrLines,
    });
  }
  return copied;
}

/** 認識中に終了したページは、ファイルには認識待ちとして書く（processing は DB だけの状態） */
function toManifestOcrStatus(status: Page['ocrStatus']): ManifestOcrStatus {
  return status === 'processing' ? 'pending' : status;
}

/** 知らない色は .leaves.json の検査で弾かれ、ID まで振り直されてしまうため、既定の色にする */
function toKnownColor(color: string): NotebookColor {
  return (NOTEBOOK_COLORS as readonly string[]).includes(color)
    ? (color as NotebookColor)
    : NOTEBOOK_COLORS[0];
}

/** 本棚を置いた後に消す。消し残しは容量を使うだけで、本棚があるので次回は移行しない */
function deleteLegacyData(): void {
  for (const entry of legacyEntries()) {
    try {
      if (entry.exists) entry.delete();
    } catch (error) {
      console.warn(`移行: 旧データを削除できませんでした: ${entry.uri}`, error);
    }
  }
}
