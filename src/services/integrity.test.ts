import { insertNote } from '@/db/noteRepository';
import { insertPage } from '@/db/pageRepository';

import { buildNote, buildPage } from '../../test/builders';
import { fakeFiles } from '../../test/fakeFileSystem';
import { createMigratedTestDb } from '../../test/migratedTestDb';
import { removeOrphanPageImages, runStartupMaintenance } from './integrity';

jest.mock('expo-file-system', () => jest.requireActual('../../test/fakeFileSystem'));
const mockStartOcrQueue = jest.fn();
jest.mock('./ocrQueue', () => ({ startOcrQueue: () => mockStartOcrQueue() }));

async function createDbWithPage(pageId: string) {
  const db = await createMigratedTestDb();
  await insertNote(db, buildNote({ id: 'note' }));
  await insertPage(db, buildPage({ id: pageId, noteId: 'note' }));
  return db;
}

beforeEach(() => fakeFiles.clear());

test('DB にないページの画像だけを消し、DB にあるページの画像は残す', async () => {
  const db = await createDbWithPage('kept');
  fakeFiles.add('doc/pages/kept.jpg');
  fakeFiles.add('doc/thumbs/kept.jpg');
  fakeFiles.add('doc/pages/orphan.jpg');
  fakeFiles.add('doc/thumbs/orphan.jpg');

  expect(await removeOrphanPageImages(db)).toBe(1);
  expect([...fakeFiles].sort()).toEqual(['doc/pages/kept.jpg', 'doc/thumbs/kept.jpg']);
});

test('画像のない DB 上のページは消さない', async () => {
  const db = await createDbWithPage('without-image');
  expect(await removeOrphanPageImages(db)).toBe(0);
  const row = await db.get<{ count: number }>('SELECT count(*) AS count FROM pages');
  expect(row?.count).toBe(1);
});

test('runStartupMaintenance: 孤立画像と書き出しの残骸を消してから OCR キューを始める', async () => {
  const db = await createDbWithPage('kept');
  fakeFiles.add('doc/pages/orphan.jpg');
  fakeFiles.add('cache/export/old.pdf');
  await runStartupMaintenance(db);
  expect([...fakeFiles]).toEqual([]);
  expect(mockStartOcrQueue).toHaveBeenCalledTimes(1);
});
