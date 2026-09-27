// ノート作成・ページ追加（詳細設計書 9.1）。
// 画像を先に保存し、DB は最後に1トランザクションで登録する（NFR-R-01）。
import type { Db } from '@/db/db';
import { insertNote, markNoteUpdated } from '@/db/noteRepository';
import { getNextPagePosition, insertPage } from '@/db/pageRepository';
import type { CapturedImage, IsoDateTime, NoteId, NotebookId } from '@/domain/types';
import { newNoteId } from '@/native/randomId';
import { notifyDataChanged } from '@/state/dataChanges';
import {
  deletePageImages,
  discardCapturedImages,
  storePageImages,
  type StoredPageImage,
} from '@/storage/pageImages';

import { enqueueOcr } from './ocrQueue';

export async function createNoteFromCapture(
  db: Db,
  input: { images: CapturedImage[]; title: string; notebookId: NotebookId | null },
): Promise<NoteId> {
  const storedPages = await storePageImages(input.images);
  const noteId = newNoteId();
  await registerOrDiscardImages(storedPages, (now) =>
    db.transaction(async (tx) => {
      await insertNote(tx, {
        id: noteId,
        notebookId: input.notebookId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      });
      await insertPages(tx, noteId, storedPages, 0, now);
    }),
  );
  finishCapture(input.images, storedPages);
  return noteId;
}

/** 既存ノートの末尾にページを追加する（FR-N-06） */
export async function addPagesToNote(
  db: Db,
  noteId: NoteId,
  images: CapturedImage[],
): Promise<void> {
  const storedPages = await storePageImages(images);
  await registerOrDiscardImages(storedPages, (now) =>
    db.transaction(async (tx) => {
      const firstPosition = await getNextPagePosition(tx, noteId);
      await insertPages(tx, noteId, storedPages, firstPosition, now);
      await markNoteUpdated(tx, noteId, now);
    }),
  );
  finishCapture(images, storedPages);
}

/** DB 登録に失敗したら、保存した画像を消してから例外を投げる（画像だけが残らないように） */
async function registerOrDiscardImages(
  storedPages: StoredPageImage[],
  register: (now: IsoDateTime) => Promise<void>,
): Promise<void> {
  try {
    await register(new Date().toISOString());
  } catch (error) {
    deletePageImages(storedPages.map((page) => page.id));
    throw error;
  }
}

async function insertPages(
  db: Db,
  noteId: NoteId,
  storedPages: StoredPageImage[],
  firstPosition: number,
  now: IsoDateTime,
): Promise<void> {
  for (const [index, page] of storedPages.entries()) {
    await insertPage(db, {
      id: page.id,
      noteId,
      position: firstPosition + index,
      width: page.width,
      height: page.height,
      ocrStatus: 'pending',
      ocrText: '',
      ocrLines: [],
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** 登録が確定した後の後始末と、画面・OCR への引き継ぎ */
function finishCapture(images: CapturedImage[], storedPages: StoredPageImage[]): void {
  discardCapturedImages(images);
  notifyDataChanged();
  enqueueOcr(storedPages.map((page) => page.id));
}
