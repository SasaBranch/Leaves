// マイグレーション適用済みのテスト用 DB と、テストデータを直接入れる小さな関数。
// リポジトリを使わず SQL で入れるのは、スキーマ自体のテストでリポジトリの不具合を混ぜないため。
import type { Db } from '@/db/db';
import { configureConnection, migrateDatabase } from '@/db/migrations';

import { createTestDb } from './testDb';

export const TEST_NOW = '2026-09-28T00:00:00.000Z';

export async function createMigratedTestDb(): Promise<Db> {
  const db = createTestDb();
  await configureConnection(db);
  await migrateDatabase(db);
  return db;
}

export async function insertNotebookRow(
  db: Db,
  row: { id: string; parentId?: string | null; name: string },
): Promise<void> {
  await db.run(
    `INSERT INTO notebooks (id, parent_id, name, color, created_at, updated_at)
     VALUES (?, ?, ?, '#2F5D45', ?, ?)`,
    [row.id, row.parentId ?? null, row.name, TEST_NOW, TEST_NOW],
  );
}

export async function insertNoteRow(
  db: Db,
  row: { id: string; notebookId?: string | null; title: string; updatedAt?: string },
): Promise<void> {
  const updatedAt = row.updatedAt ?? TEST_NOW;
  await db.run(
    `INSERT INTO notes (id, notebook_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.notebookId ?? null, row.title, TEST_NOW, updatedAt],
  );
}

export async function insertPageRow(
  db: Db,
  row: { id: string; noteId: string; position: number; ocrText?: string; ocrStatus?: string },
): Promise<void> {
  await db.run(
    `INSERT INTO pages (id, note_id, position, width, height, ocr_status, ocr_text, created_at, updated_at)
     VALUES (?, ?, ?, 1800, 2400, ?, ?, ?, ?)`,
    [
      row.id,
      row.noteId,
      row.position,
      row.ocrStatus ?? 'pending',
      row.ocrText ?? '',
      TEST_NOW,
      TEST_NOW,
    ],
  );
}
