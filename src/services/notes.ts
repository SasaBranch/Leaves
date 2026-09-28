// ノート・ページの操作（詳細設計書 9.4）。
// フォルダを先に変更し、成功したら DB に反映する（ADR 0016）。
import { Directory, File } from 'expo-file-system';

import type { Db } from '@/db/db';
import {
  deleteNote as deleteNoteRow,
  markNoteUpdated,
  updateNoteNotebook,
  updateNoteTitle,
} from '@/db/noteRepository';
import {
  deletePage as deletePageRow,
  findPage,
  listPageIdsOfNote,
  updatePagePositions,
} from '@/db/pageRepository';
import { AppError } from '@/domain/errors';
import { validateName } from '@/domain/name';
import type { NoteId, NotebookId, PageId } from '@/domain/types';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import type { NoteManifest, PageManifest } from '@/storage/manifest';
import { deleteThumbnails, renumberPageFiles } from '@/storage/pageImages';

import {
  getNoteWithDirectory,
  hasEntryNamed,
  locateNotebookDirectory,
  readNoteManifest,
  updateNoteManifest,
} from './folders';

export async function renameNote(shelf: OpenShelf, id: NoteId, title: string): Promise<void> {
  const validTitle = validateName(title);
  await shelf.runExclusively(async () => {
    const { note, directory } = await getNoteWithDirectory(shelf, id);
    if (validTitle === note.title) return;
    if (hasEntryNamed(directory.parentDirectory, validTitle, note.title)) {
      throw new AppError('duplicateName');
    }
    directory.rename(validTitle);
    await updateNoteTitle(shelf.db, id, validTitle, new Date().toISOString());
  });
  notifyDataChanged();
}

/** notebookId が null ならライブラリ直下へ移す */
export async function moveNote(
  shelf: OpenShelf,
  id: NoteId,
  notebookId: NotebookId | null,
): Promise<void> {
  await shelf.runExclusively(async () => {
    const { note, directory } = await getNoteWithDirectory(shelf, id);
    if (note.notebookId === notebookId) return;
    const destination = await locateNotebookDirectory(shelf, notebookId);
    if (hasEntryNamed(destination, note.title)) throw new AppError('duplicateName');
    directory.moveSync(new Directory(destination, note.title));
    await updateNoteNotebook(shelf.db, id, notebookId, new Date().toISOString());
  });
  notifyDataChanged();
}

export async function deleteNote(shelf: OpenShelf, id: NoteId): Promise<void> {
  await shelf.runExclusively(async () => {
    const { directory } = await getNoteWithDirectory(shelf, id);
    // ページ行は CASCADE で消えるので、消すサムネイルを先に控えておく
    const pageIds = await listPageIdsOfNote(shelf.db, id);
    if (directory.exists) directory.delete();
    await deleteNoteRow(shelf.db, id);
    deleteThumbnails(shelf.id, pageIds);
  });
  notifyDataChanged();
}

export async function reorderPages(
  shelf: OpenShelf,
  noteId: NoteId,
  orderedPageIds: PageId[],
): Promise<void> {
  await shelf.runExclusively(async () => {
    const { directory } = await getNoteWithDirectory(shelf, noteId);
    const manifest = readNoteManifest(directory);
    assertSamePageSet(manifest, orderedPageIds);
    const byId = new Map(manifest.pages.map((page) => [page.id, page]));
    const reordered = orderedPageIds.map((id) => byId.get(id)!);
    await rewritePages(shelf.db, directory, noteId, reordered);
  });
  notifyDataChanged();
}

/** 最後の1ページならノートごと消す。確認ダイアログは画面側が事前に出す（FR-N-08） */
export async function deletePage(
  shelf: OpenShelf,
  pageId: PageId,
): Promise<{ noteDeleted: boolean }> {
  const page = await findPage(shelf.db, pageId);
  if (!page) throw new Error(`ページがありません: ${pageId}`);
  const remaining = await shelf.runExclusively(async () => {
    const { directory } = await getNoteWithDirectory(shelf, page.noteId);
    const pages = readNoteManifest(directory).pages;
    const deleting = pages.find((entry) => entry.id === pageId);
    const rest = pages.filter((entry) => entry.id !== pageId);
    if (rest.length === 0) return rest;
    if (deleting) new File(directory, deleting.file).delete();
    await rewritePages(shelf.db, directory, page.noteId, rest, pageId);
    deleteThumbnails(shelf.id, [pageId]);
    return rest;
  });
  if (remaining.length === 0) {
    await deleteNote(shelf, page.noteId);
    return { noteDeleted: true };
  }
  notifyDataChanged();
  return { noteDeleted: false };
}

/**
 * ページの並びを確定させる: 画像を新しい順番のファイル名に付け直し（001.jpg …）、
 * .leaves.json → DB の順に反映する。deletedPageId があれば DB からも消す
 */
async function rewritePages(
  db: Db,
  directory: Directory,
  noteId: NoteId,
  orderedPages: PageManifest[],
  deletedPageId?: PageId,
): Promise<void> {
  const now = new Date().toISOString();
  const fileNames = renumberPageFiles(
    directory,
    orderedPages.map((page) => page.file),
  );
  updateNoteManifest(directory, (manifest) => ({
    ...manifest,
    updatedAt: now,
    pages: orderedPages.map((page, index) => withRenamedFile(directory, page, fileNames[index]!)),
  }));
  await db.transaction(async (tx) => {
    if (deletedPageId) await deletePageRow(tx, deletedPageId);
    await updatePagePositions(
      tx,
      noteId,
      orderedPages.map((page) => page.id),
      now,
    );
    await markNoteUpdated(tx, noteId, now);
  });
}

/** 名前を付け直したファイルの名前と更新日時を控え直す（外部変更の対応づけに使うため） */
function withRenamedFile(directory: Directory, page: PageManifest, fileName: string): PageManifest {
  const file = new File(directory, fileName);
  return { ...page, file: fileName, modifiedAt: file.modificationTime ?? page.modifiedAt };
}

/**
 * 並べ替え後の ID がノートの全ページと過不足なく一致するか。
 * ずれは呼び出し側の誤りなので AppError にしない
 */
function assertSamePageSet(manifest: NoteManifest, orderedPageIds: PageId[]): void {
  const currentPageIds = new Set(manifest.pages.map((page) => page.id));
  const isSameSet =
    orderedPageIds.length === currentPageIds.size &&
    new Set(orderedPageIds).size === currentPageIds.size &&
    orderedPageIds.every((id) => currentPageIds.has(id));
  if (!isSameSet) {
    throw new Error(`並べ替えるページがノート ${manifest.id} のページと一致しません`);
  }
}
