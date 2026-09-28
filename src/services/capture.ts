// ノート作成・ページ追加（詳細設計書 9.1）。
// ノートのフォルダを作業用フォルダで組み立ててから1回の移動で本棚に置き、最後に DB に登録する（NFR-R-01、ADR 0016）。
import { Directory } from 'expo-file-system';

import type { Db } from '@/db/db';
import { insertNote, markNoteUpdated } from '@/db/noteRepository';
import { insertPage } from '@/db/pageRepository';
import { pickAvailableName } from '@/domain/name';
import type { CapturedImage, IsoDateTime, NoteId, NotebookId } from '@/domain/types';
import { newNoteId } from '@/native/randomId';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import { newNoteManifest, writeManifest, type PageManifest } from '@/storage/manifest';
import { discardCapturedImages, storePageImages } from '@/storage/pageImages';
import { workDirectory } from '@/storage/paths';

import {
  getNoteWithDirectory,
  listEntryNames,
  locateNotebookDirectory,
  readNoteManifest,
  updateNoteManifest,
} from './folders';
import { enqueueOcr } from './ocrQueue';

/** 保存先に同じ名前があれば "タイトル (2)" などにする（FR-S-07） */
export async function createNoteFromCapture(
  shelf: OpenShelf,
  input: { images: CapturedImage[]; title: string; notebookId: NotebookId | null },
): Promise<NoteId> {
  const noteId = newNoteId();
  const pages = await shelf.runExclusively(async () => {
    const now = new Date().toISOString();
    const assembled = await assembleNoteInWorkDirectory(shelf, noteId, input.images, now);
    const parent = await locateNotebookDirectory(shelf, input.notebookId);
    const title = pickAvailableName(listEntryNames(parent), input.title);
    assembled.move(new Directory(parent, title));
    // ここで終了しても、フォルダが正本なので次の外部変更の反映で DB に登録される
    await shelf.db.transaction(async (tx) => {
      await insertNote(tx, { id: noteId, notebookId: input.notebookId, title, createdAt: now, updatedAt: now });
      await insertPages(tx, noteId, assembled.pages, 0, now);
    });
    return assembled.pages;
  });
  finishCapture(input.images, pages);
  return noteId;
}

/** 既存ノートの末尾にページを追加する（FR-N-06） */
export async function addPagesToNote(
  shelf: OpenShelf,
  noteId: NoteId,
  images: CapturedImage[],
): Promise<void> {
  const pages = await shelf.runExclusively(async () => {
    const now = new Date().toISOString();
    const { directory } = await getNoteWithDirectory(shelf, noteId);
    const firstPosition = readNoteManifest(directory).pages.length;
    const added = await storePageImages(images, directory, firstPosition, shelf.id, now);
    updateNoteManifest(directory, (manifest) => ({
      ...manifest,
      updatedAt: now,
      pages: [...manifest.pages, ...added],
    }));
    await shelf.db.transaction(async (tx) => {
      await insertPages(tx, noteId, added, firstPosition, now);
      await markNoteUpdated(tx, noteId, now);
    });
    return added;
  });
  finishCapture(images, pages);
}

/**
 * 作業用フォルダ（本棚と同じボリューム）に、ページ画像と .leaves.json を持つノートのフォルダを作る。
 * 失敗したら作業用フォルダを消してから例外を投げる
 */
async function assembleNoteInWorkDirectory(
  shelf: OpenShelf,
  noteId: NoteId,
  images: CapturedImage[],
  now: IsoDateTime,
): Promise<{ move(target: Directory): void; pages: PageManifest[] }> {
  const folder = new Directory(workDirectory(shelf.directory), noteId);
  folder.create({ intermediates: true, overwrite: true });
  try {
    const pages = await storePageImages(images, folder, 0, shelf.id, now);
    writeManifest(folder, newNoteManifest(noteId, pages, now));
    return {
      move: (target) => {
        folder.moveSync(target);
        removeWorkDirectoryIfEmpty(shelf);
      },
      pages,
    };
  } catch (error) {
    folder.delete();
    removeWorkDirectoryIfEmpty(shelf);
    throw error;
  }
}

/** 本棚フォルダの中に空の作業用フォルダを残さない（Finder で隠しファイルを表示したときに散らからないように） */
function removeWorkDirectoryIfEmpty(shelf: OpenShelf): void {
  const work = workDirectory(shelf.directory);
  if (work.exists && work.list().length === 0) work.delete();
}

async function insertPages(
  db: Db,
  noteId: NoteId,
  pages: PageManifest[],
  firstPosition: number,
  now: IsoDateTime,
): Promise<void> {
  for (const [index, page] of pages.entries()) {
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
function finishCapture(images: CapturedImage[], pages: PageManifest[]): void {
  discardCapturedImages(images);
  notifyDataChanged();
  enqueueOcr(pages.map((page) => page.id));
}
