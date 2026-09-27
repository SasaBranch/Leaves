import { OCR_STATUSES } from '@/domain/types';

import {
  createMigratedTestDb,
  insertNoteRow,
  insertNotebookRow,
  insertPageRow,
} from '../../test/migratedTestDb';
import { createTestDb } from '../../test/testDb';
import {
  configureConnection,
  LATEST_SCHEMA_VERSION,
  migrateDatabase,
  readSchemaVersion,
} from './migrations';

async function countRows(db: Awaited<ReturnType<typeof createMigratedTestDb>>, table: string) {
  const row = await db.get<{ count: number }>(`SELECT count(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}

describe('migrateDatabase', () => {
  test('最新のスキーマバージョンまで適用され、2回目は何もしない', async () => {
    const db = createTestDb();
    await configureConnection(db);
    await migrateDatabase(db);
    expect(await readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    await expect(migrateDatabase(db)).resolves.toBeUndefined();
    expect(await readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
  });
});

describe('notebooks の制約', () => {
  test('同じ親の下に同名のノートブックは作れない（FR-F-06）', async () => {
    const db = await createMigratedTestDb();
    await insertNotebookRow(db, { id: 'parent', name: '大学' });
    await insertNotebookRow(db, { id: 'a', parentId: 'parent', name: '線形代数' });
    await expect(
      insertNotebookRow(db, { id: 'b', parentId: 'parent', name: '線形代数' }),
    ).rejects.toThrow(/UNIQUE/);
  });

  test('ライブラリ直下（parent_id が NULL）でも同名は作れない', async () => {
    const db = await createMigratedTestDb();
    await insertNotebookRow(db, { id: 'a', name: '大学' });
    await expect(insertNotebookRow(db, { id: 'b', name: '大学' })).rejects.toThrow(/UNIQUE/);
  });

  test('親が違えば同名を作れる', async () => {
    const db = await createMigratedTestDb();
    await insertNotebookRow(db, { id: 'p1', name: '大学' });
    await insertNotebookRow(db, { id: 'p2', name: '仕事' });
    await insertNotebookRow(db, { id: 'a', parentId: 'p1', name: 'メモ' });
    await expect(insertNotebookRow(db, { id: 'b', parentId: 'p2', name: 'メモ' })).resolves.toBe(
      undefined,
    );
  });

  test('空白だけの名前は作れない', async () => {
    const db = await createMigratedTestDb();
    await expect(insertNotebookRow(db, { id: 'a', name: '   ' })).rejects.toThrow(/CHECK/);
  });
});

describe('CASCADE 削除', () => {
  test('ノートブックを消すと、子孫のノートブック・ノート・ページ・検索索引がすべて消える', async () => {
    const db = await createMigratedTestDb();
    await insertNotebookRow(db, { id: 'root', name: '大学' });
    await insertNotebookRow(db, { id: 'child', parentId: 'root', name: '線形代数' });
    await insertNoteRow(db, { id: 'note', notebookId: 'child', title: '第1回' });
    await insertPageRow(db, { id: 'page', noteId: 'note', position: 0, ocrText: '固有値' });

    await db.run('DELETE FROM notebooks WHERE id = ?', ['root']);

    expect(await countRows(db, 'notebooks')).toBe(0);
    expect(await countRows(db, 'notes')).toBe(0);
    expect(await countRows(db, 'pages')).toBe(0);
    expect(await countRows(db, 'pages_fts')).toBe(0);
  });
});

describe('pages の制約', () => {
  test('同じノートに同じ position のページは作れない', async () => {
    const db = await createMigratedTestDb();
    await insertNoteRow(db, { id: 'note', title: 'メモ' });
    await insertPageRow(db, { id: 'p1', noteId: 'note', position: 0 });
    await expect(insertPageRow(db, { id: 'p2', noteId: 'note', position: 0 })).rejects.toThrow(
      /UNIQUE/,
    );
  });

  test('OCR_STATUSES のすべての値を保存でき、それ以外は保存できない', async () => {
    const db = await createMigratedTestDb();
    await insertNoteRow(db, { id: 'note', title: 'メモ' });
    for (const [position, status] of OCR_STATUSES.entries()) {
      await insertPageRow(db, { id: `p${position}`, noteId: 'note', position, ocrStatus: status });
    }
    await expect(
      insertPageRow(db, { id: 'bad', noteId: 'note', position: 99, ocrStatus: 'unknown' }),
    ).rejects.toThrow(/CHECK/);
  });

  test('DDL の CHECK 制約の値の並びが OCR_STATUSES と一致する（知識の二重化をテストで縛る）', async () => {
    const db = await createMigratedTestDb();
    const table = await db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
    );
    const checkList = table?.sql.match(/ocr_status IN \(([^)]*)\)/)?.[1] ?? '';
    const statusesInDdl = [...checkList.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(statusesInDdl).toEqual([...OCR_STATUSES]);
  });
});

describe('検索索引の同期（トリガー）', () => {
  async function readIndexRow(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
    return db.get<{ title: string; ocr_text: string }>(
      "SELECT title, ocr_text FROM pages_fts WHERE page_id = 'page'",
    );
  }

  test('ページを追加すると、ノートのタイトルと OCR テキストが索引に入る', async () => {
    const db = await createMigratedTestDb();
    await insertNoteRow(db, { id: 'note', title: '第3回 固有値' });
    await insertPageRow(db, { id: 'page', noteId: 'note', position: 0, ocrText: 'Ax = λx' });
    expect(await readIndexRow(db)).toEqual({ title: '第3回 固有値', ocr_text: 'Ax = λx' });
  });

  test('OCR テキストを更新すると索引も更新される', async () => {
    const db = await createMigratedTestDb();
    await insertNoteRow(db, { id: 'note', title: 'メモ' });
    await insertPageRow(db, { id: 'page', noteId: 'note', position: 0 });
    await db.run("UPDATE pages SET ocr_text = '認識結果' WHERE id = 'page'");
    expect((await readIndexRow(db))?.ocr_text).toBe('認識結果');
  });

  test('ノートのタイトルを変更すると、そのノートの全ページの索引が更新される', async () => {
    const db = await createMigratedTestDb();
    await insertNoteRow(db, { id: 'note', title: '旧タイトル' });
    await insertPageRow(db, { id: 'page', noteId: 'note', position: 0 });
    await insertPageRow(db, { id: 'page2', noteId: 'note', position: 1 });
    await db.run("UPDATE notes SET title = '新タイトル' WHERE id = 'note'");
    const titles = await db.all<{ title: string }>('SELECT title FROM pages_fts');
    expect(titles.map((row) => row.title)).toEqual(['新タイトル', '新タイトル']);
  });

  test('ページを削除すると索引からも消える', async () => {
    const db = await createMigratedTestDb();
    await insertNoteRow(db, { id: 'note', title: 'メモ' });
    await insertPageRow(db, { id: 'page', noteId: 'note', position: 0 });
    await db.run("DELETE FROM pages WHERE id = 'page'");
    expect(await readIndexRow(db)).toBeNull();
  });
});
