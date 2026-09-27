// pages テーブルの読み書き。検索索引（pages_fts）はトリガーが追従するので、ここでは触らない。
import type {
  IsoDateTime,
  NoteId,
  NotebookId,
  OcrLine,
  OcrStatus,
  Page,
  PageId,
} from '@/domain/types';

import type { Db } from './db';

type PageRow = {
  id: string;
  note_id: string;
  position: number;
  width: number;
  height: number;
  ocr_status: string;
  ocr_text: string;
  ocr_lines: string;
  created_at: string;
  updated_at: string;
};

function toPage(row: PageRow): Page {
  return {
    id: row.id as PageId,
    noteId: row.note_id as NoteId,
    position: row.position,
    width: row.width,
    height: row.height,
    ocrStatus: row.ocr_status as OcrStatus,
    ocrText: row.ocr_text,
    ocrLines: JSON.parse(row.ocr_lines) as OcrLine[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertPage(db: Db, page: Page): Promise<void> {
  await db.run(
    `INSERT INTO pages
       (id, note_id, position, width, height, ocr_status, ocr_text, ocr_lines, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      page.id,
      page.noteId,
      page.position,
      page.width,
      page.height,
      page.ocrStatus,
      page.ocrText,
      JSON.stringify(page.ocrLines),
      page.createdAt,
      page.updatedAt,
    ],
  );
}

export async function findPage(db: Db, id: PageId): Promise<Page | null> {
  const row = await db.get<PageRow>('SELECT * FROM pages WHERE id = ?', [id]);
  return row ? toPage(row) : null;
}

export async function listPagesOfNote(db: Db, noteId: NoteId): Promise<Page[]> {
  const rows = await db.all<PageRow>('SELECT * FROM pages WHERE note_id = ? ORDER BY position', [
    noteId,
  ]);
  return rows.map(toPage);
}

/** ページを末尾に追加するときの position（ページがなければ 0） */
export async function getNextPagePosition(db: Db, noteId: NoteId): Promise<number> {
  const row = await db.get<{ next: number }>(
    'SELECT coalesce(max(position) + 1, 0) AS next FROM pages WHERE note_id = ?',
    [noteId],
  );
  return row?.next ?? 0;
}

/**
 * ページを orderedPageIds の順に並べ直す（詳細設計書 6.5）。
 * UNIQUE (note_id, position) があるため、いったん全ページを負の位置に退避してから書き込む。
 */
export async function updatePagePositions(
  db: Db,
  noteId: NoteId,
  orderedPageIds: PageId[],
  now: IsoDateTime,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE pages SET position = -(position + 1) WHERE note_id = ?', [noteId]);
    for (const [position, pageId] of orderedPageIds.entries()) {
      await tx.run('UPDATE pages SET position = ?, updated_at = ? WHERE id = ? AND note_id = ?', [
        position,
        now,
        pageId,
        noteId,
      ]);
    }
  });
}

export async function updateOcrStatus(
  db: Db,
  id: PageId,
  status: OcrStatus,
  now: IsoDateTime,
): Promise<void> {
  await db.run('UPDATE pages SET ocr_status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
}

export async function saveOcrResult(
  db: Db,
  id: PageId,
  result: { text: string; lines: OcrLine[] },
  now: IsoDateTime,
): Promise<void> {
  await db.run(
    `UPDATE pages SET ocr_status = 'done', ocr_text = ?, ocr_lines = ?, updated_at = ? WHERE id = ?`,
    [result.text, JSON.stringify(result.lines), now, id],
  );
}

export async function listPageIdsByOcrStatus(db: Db, status: OcrStatus): Promise<PageId[]> {
  const rows = await db.all<{ id: string }>(
    'SELECT id FROM pages WHERE ocr_status = ? ORDER BY created_at, position',
    [status],
  );
  return rows.map((row) => row.id as PageId);
}

/** 起動時: 前回の実行中に中断された OCR（processing のまま）を pending に戻す（NFR-R-03） */
export async function resetInterruptedOcr(db: Db, now: IsoDateTime): Promise<void> {
  await db.run(
    `UPDATE pages SET ocr_status = 'pending', updated_at = ? WHERE ocr_status = 'processing'`,
    [now],
  );
}

export async function deletePage(db: Db, id: PageId): Promise<void> {
  await db.run('DELETE FROM pages WHERE id = ?', [id]);
}

/** 整合性チェック用: DB にあるすべてのページ ID */
export async function listAllPageIds(db: Db): Promise<PageId[]> {
  const rows = await db.all<{ id: string }>('SELECT id FROM pages');
  return rows.map((row) => row.id as PageId);
}

export async function listPageIdsOfNote(db: Db, noteId: NoteId): Promise<PageId[]> {
  const rows = await db.all<{ id: string }>('SELECT id FROM pages WHERE note_id = ?', [noteId]);
  return rows.map((row) => row.id as PageId);
}

/** ノートブックを中身ごと消す前に、消える画像を特定するために使う */
export async function listPageIdsInNotebooks(db: Db, notebookIds: NotebookId[]): Promise<PageId[]> {
  if (notebookIds.length === 0) return [];
  const placeholders = notebookIds.map(() => '?').join(', ');
  const rows = await db.all<{ id: string }>(
    `SELECT pages.id FROM pages JOIN notes ON notes.id = pages.note_id
     WHERE notes.notebook_id IN (${placeholders})`,
    notebookIds,
  );
  return rows.map((row) => row.id as PageId);
}
