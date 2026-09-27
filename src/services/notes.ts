// ノート・ページの操作（詳細設計書 9.4）。
// DB を先に確定させ、画像ファイルは後から消す（画像だけ消えて DB に残るページを作らないため）。
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
  listPagesOfNote,
  updatePagePositions,
} from '@/db/pageRepository';
import { normalizeName } from '@/domain/name';
import type { NoteId, NotebookId, PageId } from '@/domain/types';
import { notifyDataChanged } from '@/state/dataChanges';
import { deletePageImages, withImageOperation } from '@/storage/pageImages';

export async function renameNote(db: Db, id: NoteId, title: string): Promise<void> {
  await updateNoteTitle(db, id, normalizeName(title), new Date().toISOString());
  notifyDataChanged();
}

/** notebookId が null ならライブラリ直下へ移す */
export async function moveNote(db: Db, id: NoteId, notebookId: NotebookId | null): Promise<void> {
  await updateNoteNotebook(db, id, notebookId, new Date().toISOString());
  notifyDataChanged();
}

export async function deleteNote(db: Db, id: NoteId): Promise<void> {
  // ページ行は CASCADE で消えるので、消す画像を先に控えておく
  const pageIds = await listPageIdsOfNote(db, id);
  await withImageOperation(async () => {
    await deleteNoteRow(db, id);
    deletePageImages(pageIds);
  });
  notifyDataChanged();
}

export async function reorderPages(
  db: Db,
  noteId: NoteId,
  orderedPageIds: PageId[],
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await assertSamePageSet(tx, noteId, orderedPageIds);
    await updatePagePositions(tx, noteId, orderedPageIds, now);
    await markNoteUpdated(tx, noteId, now);
  });
  notifyDataChanged();
}

/** 最後の1ページならノートごと消す。確認ダイアログは画面側が事前に出す（FR-N-08） */
export async function deletePage(db: Db, pageId: PageId): Promise<{ noteDeleted: boolean }> {
  const page = await findPage(db, pageId);
  if (!page) throw new Error(`ページがありません: ${pageId}`);

  let noteDeleted = false;
  await withImageOperation(async () => {
    await db.transaction(async (tx) => {
      const remainingPageIds = await listRemainingPageIds(tx, page.noteId, pageId);
      noteDeleted = remainingPageIds.length === 0;
      if (noteDeleted) {
        await deleteNoteRow(tx, page.noteId);
      } else {
        await deletePageAndCompactPositions(tx, page.noteId, pageId, remainingPageIds);
      }
    });
    deletePageImages([pageId]);
  });
  notifyDataChanged();
  return { noteDeleted };
}

/** 並べ替え後の ID がノートの全ページと過不足なく一致するか。ずれは呼び出し側の誤りなので AppError にしない */
async function assertSamePageSet(db: Db, noteId: NoteId, orderedPageIds: PageId[]): Promise<void> {
  const currentPageIds = new Set(await listPageIdsOfNote(db, noteId));
  const isSameSet =
    orderedPageIds.length === currentPageIds.size &&
    new Set(orderedPageIds).size === currentPageIds.size &&
    orderedPageIds.every((id) => currentPageIds.has(id));
  if (!isSameSet) {
    throw new Error(`並べ替えるページがノート ${noteId} のページと一致しません`);
  }
}

/** 消すページを除いた、現在の順番のページ ID */
async function listRemainingPageIds(
  db: Db,
  noteId: NoteId,
  deletingPageId: PageId,
): Promise<PageId[]> {
  const pages = await listPagesOfNote(db, noteId);
  return pages.map((page) => page.id).filter((id) => id !== deletingPageId);
}

/** 抜けた番号を残さないよう、残りのページの position を 0 から詰め直す */
async function deletePageAndCompactPositions(
  db: Db,
  noteId: NoteId,
  pageId: PageId,
  remainingPageIds: PageId[],
): Promise<void> {
  const now = new Date().toISOString();
  await deletePageRow(db, pageId);
  await updatePagePositions(db, noteId, remainingPageIds, now);
  await markNoteUpdated(db, noteId, now);
}
