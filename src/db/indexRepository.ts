// 外部変更の反映（詳細設計書 9.9）のための、索引 DB の一括の読み書き。
// 走査結果との突き合わせに必要な列だけを読み、差分を ID 単位で書き込む。
import type {
  IsoDateTime,
  Note,
  Notebook,
  NotebookColor,
  NotebookId,
  NoteId,
  OcrStatus,
  Page,
  PageId,
} from '@/domain/types';

import type { Db } from './db';

export type IndexedNotebook = Notebook & { scannedModifiedAt: number | null };
export type IndexedNote = Note & { scannedModifiedAt: number | null };
export type IndexedPage = { id: PageId; noteId: NoteId; ocrStatus: OcrStatus };

export type IndexSnapshot = {
  notebooks: IndexedNotebook[];
  notes: IndexedNote[];
  pages: IndexedPage[];
};

/** 走査の前に DB の今の状態を読む。OCR テキストなど大きな列は読まない */
export async function loadIndexSnapshot(db: Db): Promise<IndexSnapshot> {
  const notebooks = await db.all<{
    id: string;
    parent_id: string | null;
    name: string;
    color: string;
    created_at: string;
    updated_at: string;
    scanned_modified_at: number | null;
  }>('SELECT * FROM notebooks');
  const notes = await db.all<{
    id: string;
    notebook_id: string | null;
    title: string;
    created_at: string;
    updated_at: string;
    scanned_modified_at: number | null;
  }>('SELECT * FROM notes');
  const pages = await db.all<{ id: string; note_id: string; ocr_status: string }>(
    'SELECT id, note_id, ocr_status FROM pages',
  );
  return {
    notebooks: notebooks.map((row) => ({
      id: row.id as NotebookId,
      parentId: row.parent_id as NotebookId | null,
      name: row.name,
      color: row.color as NotebookColor,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      scannedModifiedAt: row.scanned_modified_at,
    })),
    notes: notes.map((row) => ({
      id: row.id as NoteId,
      notebookId: row.notebook_id as NotebookId | null,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      scannedModifiedAt: row.scanned_modified_at,
    })),
    pages: pages.map((row) => ({
      id: row.id as PageId,
      noteId: row.note_id as NoteId,
      ocrStatus: row.ocr_status as OcrStatus,
    })),
  };
}

/** 親は子より先に渡すこと（外部キーのため） */
export async function upsertNotebook(db: Db, notebook: IndexedNotebook): Promise<void> {
  await db.run(
    `INSERT INTO notebooks (id, parent_id, name, color, created_at, updated_at, scanned_modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       parent_id = excluded.parent_id, name = excluded.name, color = excluded.color,
       created_at = excluded.created_at, updated_at = excluded.updated_at,
       scanned_modified_at = excluded.scanned_modified_at`,
    [
      notebook.id,
      notebook.parentId,
      notebook.name,
      notebook.color,
      notebook.createdAt,
      notebook.updatedAt,
      notebook.scannedModifiedAt,
    ],
  );
}

export async function upsertNote(db: Db, note: IndexedNote): Promise<void> {
  await db.run(
    `INSERT INTO notes (id, notebook_id, title, created_at, updated_at, scanned_modified_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       notebook_id = excluded.notebook_id, title = excluded.title,
       created_at = excluded.created_at, updated_at = excluded.updated_at,
       scanned_modified_at = excluded.scanned_modified_at`,
    [
      note.id,
      note.notebookId,
      note.title,
      note.createdAt,
      note.updatedAt,
      note.scannedModifiedAt,
    ],
  );
}

/**
 * ノートのページを、渡されたページ（ページ順）に置き換える。なくなったページは消す。
 * (note_id, position) の一意制約に途中でかからないよう、先に位置を負の値に退避する（詳細設計書 6.5）
 */
export async function replaceNotePages(
  db: Db,
  noteId: NoteId,
  pages: Page[],
  now: IsoDateTime,
): Promise<void> {
  const keepIds = pages.map((page) => page.id);
  await db.run(
    `DELETE FROM pages WHERE note_id = ? AND id NOT IN (${keepIds.map(() => '?').join(', ')})`,
    [noteId, ...keepIds],
  );
  await db.run('UPDATE pages SET position = -(position + 1) WHERE note_id = ?', [noteId]);
  for (const page of pages) {
    await db.run(
      `INSERT INTO pages
         (id, note_id, position, width, height, ocr_status, ocr_text, ocr_lines, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         note_id = excluded.note_id, position = excluded.position,
         width = excluded.width, height = excluded.height, ocr_status = excluded.ocr_status,
         ocr_text = excluded.ocr_text, ocr_lines = excluded.ocr_lines, updated_at = ?`,
      [
        page.id,
        noteId,
        page.position,
        page.width,
        page.height,
        page.ocrStatus,
        page.ocrText,
        JSON.stringify(page.ocrLines),
        page.createdAt,
        page.updatedAt,
        now,
      ],
    );
  }
}

/** 子孫・中のノート・ページも CASCADE で消える。移動されたものは先に upsert で親を付け替えておくこと */
export async function deleteNotebooksByIds(db: Db, ids: NotebookId[]): Promise<void> {
  for (const id of ids) await db.run('DELETE FROM notebooks WHERE id = ?', [id]);
}

export async function deleteNotesByIds(db: Db, ids: NoteId[]): Promise<void> {
  for (const id of ids) await db.run('DELETE FROM notes WHERE id = ?', [id]);
}
