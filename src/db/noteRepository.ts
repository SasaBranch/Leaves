// notes テーブルの読み書き。
import type {
  IsoDateTime,
  Note,
  NoteId,
  NoteSummary,
  NotebookId,
  PageId,
  SortOrder,
} from '@/domain/types';

import type { Db } from './db';

type NoteRow = {
  id: string;
  notebook_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

type NoteSummaryRow = NoteRow & { page_count: number; cover_page_id: string };

function toNote(row: NoteRow): Note {
  return {
    id: row.id as NoteId,
    notebookId: row.notebook_id as NotebookId | null,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNoteSummary(row: NoteSummaryRow): NoteSummary {
  return {
    ...toNote(row),
    pageCount: row.page_count,
    coverPageId: row.cover_page_id as PageId,
  };
}

const ORDER_BY: Record<SortOrder, string> = {
  updatedAt: 'notes.updated_at DESC',
  name: 'notes.title COLLATE NOCASE',
};

// ノート表紙に必要な情報（ページ数と1ページ目）を1回の SQL で取る（詳細設計書 6.4）
const SELECT_NOTE_SUMMARY = `
  SELECT notes.*,
         (SELECT count(*) FROM pages WHERE pages.note_id = notes.id) AS page_count,
         (SELECT id FROM pages WHERE pages.note_id = notes.id ORDER BY position LIMIT 1) AS cover_page_id
  FROM notes`;

export async function insertNote(db: Db, note: Note): Promise<void> {
  await db.run(
    `INSERT INTO notes (id, notebook_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [note.id, note.notebookId, note.title, note.createdAt, note.updatedAt],
  );
}

export async function findNote(db: Db, id: NoteId): Promise<Note | null> {
  const row = await db.get<NoteRow>('SELECT * FROM notes WHERE id = ?', [id]);
  return row ? toNote(row) : null;
}

/** notebookId 直下のノート。null はライブラリ直下 */
export async function listNoteSummaries(
  db: Db,
  notebookId: NotebookId | null,
  sort: SortOrder,
): Promise<NoteSummary[]> {
  const rows = await db.all<NoteSummaryRow>(
    `${SELECT_NOTE_SUMMARY} WHERE notes.notebook_id IS ? ORDER BY ${ORDER_BY[sort]}`,
    [notebookId],
  );
  return rows.map(toNoteSummary);
}

/** どのノートブックかを問わず、更新が新しい順 */
export async function listRecentNoteSummaries(db: Db, limit: number): Promise<NoteSummary[]> {
  const rows = await db.all<NoteSummaryRow>(
    `${SELECT_NOTE_SUMMARY} ORDER BY notes.updated_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toNoteSummary);
}

export async function updateNoteTitle(
  db: Db,
  id: NoteId,
  title: string,
  now: IsoDateTime,
): Promise<void> {
  await db.run('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?', [title, now, id]);
}

export async function updateNoteNotebook(
  db: Db,
  id: NoteId,
  notebookId: NotebookId | null,
  now: IsoDateTime,
): Promise<void> {
  await db.run('UPDATE notes SET notebook_id = ?, updated_at = ? WHERE id = ?', [
    notebookId,
    now,
    id,
  ]);
}

/** ページの追加・並べ替え・削除など、ノートの中身が変わったときに更新日時だけを進める */
export async function markNoteUpdated(db: Db, id: NoteId, now: IsoDateTime): Promise<void> {
  await db.run('UPDATE notes SET updated_at = ? WHERE id = ?', [now, id]);
}

/** ページも CASCADE で消える。画像ファイルは呼び出し側で消す */
export async function deleteNote(db: Db, id: NoteId): Promise<void> {
  await db.run('DELETE FROM notes WHERE id = ?', [id]);
}
