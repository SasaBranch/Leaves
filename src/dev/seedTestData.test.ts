import { listNoteSummaries } from '@/db/noteRepository';
import { listChildNotebooks } from '@/db/notebookRepository';
import { listPageIdsByOcrStatus } from '@/db/pageRepository';
import { searchPages } from '@/db/searchRepository';
import type { Db } from '@/db/db';

import { fakeFiles } from '../../test/fakeFileSystem';
import { createMigratedTestDb, insertNoteRow, insertPageRow } from '../../test/migratedTestDb';
import { ROOT_NOTEBOOK_NAME, seedTestData } from './seedTestData';

// 共通の偽物には copy がないため、ここでだけ「複製先のファイルができる」ことを足す
jest.mock('expo-file-system', () => {
  const fake = jest.requireActual('../../test/fakeFileSystem');
  class File extends fake.File {
    async copy(destination: { uri: string }) {
      fake.fakeFiles.add(destination.uri);
    }
  }
  return { ...fake, File };
});
let mockIdCount = 0;
jest.mock('@/native/randomId', () => ({
  newNotebookId: () => `notebook${mockIdCount++}`,
  newNoteId: () => `note${mockIdCount++}`,
  newPageId: () => `page${mockIdCount++}`,
}));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

const SMALL_SEED = { noteCount: 20, pagesPerNote: 3 };

beforeEach(() => {
  fakeFiles.clear();
  mockNotify.mockClear();
});

async function findRootNotebook(db: Db) {
  const roots = await listChildNotebooks(db, null, 'name');
  return roots.find((notebook) => notebook.name === ROOT_NOTEBOOK_NAME);
}

test('seedTestData: テストデータの下に子ノートブック・ノート・OCR 済みのページを作り、1回通知する', async () => {
  const db = await createMigratedTestDb();

  await seedTestData(db, SMALL_SEED);

  const root = await findRootNotebook(db);
  const children = await listChildNotebooks(db, root!.id, 'name');
  expect(children).toHaveLength(10);
  expect(children.reduce((sum, child) => sum + child.noteCount, 0)).toBe(20);
  const notes = await listNoteSummaries(db, children[0]!.id, 'updatedAt');
  expect(notes.every((note) => note.pageCount === 3)).toBe(true);
  expect(new Set(notes.map((note) => note.updatedAt)).size).toBe(notes.length);
  expect(await listPageIdsByOcrStatus(db, 'done')).toHaveLength(60);
  expect(await listPageIdsByOcrStatus(db, 'pending')).toHaveLength(0);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

test('seedTestData: 生成した本文が検索で見つかる', async () => {
  const db = await createMigratedTestDb();

  await seedTestData(db, SMALL_SEED);

  const hits = await searchPages(db, { keyword: '固有値', scopeNotebookId: null });
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0]!.notebookPath[0]).toBe(ROOT_NOTEBOOK_NAME);
});

test('seedTestData: 既存ページのサムネイルがあれば、生成した全ページに複製する', async () => {
  const db = await createMigratedTestDb();
  await insertNoteRow(db, { id: 'existing-note', title: '既存' });
  await insertPageRow(db, { id: 'existing-page', noteId: 'existing-note', position: 0 });
  fakeFiles.add('doc/thumbs/existing-page.jpg');

  await seedTestData(db, SMALL_SEED);

  expect([...fakeFiles].filter((file) => file.startsWith('doc/thumbs/page'))).toHaveLength(60);
});

test('seedTestData: テストデータが既にあれば、何も作らずに失敗する', async () => {
  const db = await createMigratedTestDb();
  await seedTestData(db, SMALL_SEED);
  mockNotify.mockClear();

  await expect(seedTestData(db, SMALL_SEED)).rejects.toThrow(/既にあります/);

  expect(await listPageIdsByOcrStatus(db, 'done')).toHaveLength(60);
  expect(mockNotify).not.toHaveBeenCalled();
});
