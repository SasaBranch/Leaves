import { findNote, listNoteSummaries, insertNote } from '@/db/noteRepository';
import { insertPage, listPagesOfNote } from '@/db/pageRepository';
import type { CapturedImage } from '@/domain/types';

import { asNoteId, asNotebookId, buildNote, buildPage } from '../../test/builders';
import { createMigratedTestDb, insertNotebookRow, TEST_NOW } from '../../test/migratedTestDb';
import { addPagesToNote, createNoteFromCapture } from './capture';

// 画像の保存は storage のテストで確かめたので、ここでは呼ばれ方と順番だけを見る
const mockStorage = {
  storedCount: 0,
  deleted: [] as string[][],
  discarded: [] as CapturedImage[][],
};
jest.mock('@/storage/pageImages', () => ({
  storePageImages: async (images: CapturedImage[]) =>
    images.map(() => ({ id: `stored${mockStorage.storedCount++}`, width: 1800, height: 2400 })),
  deletePageImages: (ids: string[]) => mockStorage.deleted.push(ids),
  discardCapturedImages: (images: CapturedImage[]) => mockStorage.discarded.push(images),
}));
jest.mock('@/native/randomId', () => ({ newNoteId: () => 'new-note' }));
const mockEnqueueOcr = jest.fn();
jest.mock('./ocrQueue', () => ({ enqueueOcr: (ids: string[]) => mockEnqueueOcr(ids) }));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

const images: CapturedImage[] = [
  { uri: 'cache/a.jpg', width: 3000, height: 4000 },
  { uri: 'cache/b.jpg', width: 3000, height: 4000 },
];

beforeEach(() => {
  mockStorage.storedCount = 0;
  mockStorage.deleted.length = 0;
  mockStorage.discarded.length = 0;
  mockEnqueueOcr.mockClear();
  mockNotify.mockClear();
});

test('createNoteFromCapture: ノートとページを登録し、一時画像の削除・通知・OCR 投入を行う', async () => {
  const db = await createMigratedTestDb();
  await insertNotebookRow(db, { id: 'linear', name: '線形代数' });

  const noteId = await createNoteFromCapture(db, {
    images,
    title: '2026-09-28 10:30',
    notebookId: asNotebookId('linear'),
  });

  expect(noteId).toBe('new-note');
  const [summary] = await listNoteSummaries(db, asNotebookId('linear'), 'updatedAt');
  expect(summary).toMatchObject({
    title: '2026-09-28 10:30',
    pageCount: 2,
    coverPageId: 'stored0',
  });
  const pages = await listPagesOfNote(db, noteId);
  expect(pages.map((page) => [page.id, page.position, page.ocrStatus])).toEqual([
    ['stored0', 0, 'pending'],
    ['stored1', 1, 'pending'],
  ]);
  expect(mockStorage.discarded).toEqual([images]);
  expect(mockNotify).toHaveBeenCalledTimes(1);
  expect(mockEnqueueOcr).toHaveBeenCalledWith(['stored0', 'stored1']);
});

test('createNoteFromCapture: DB 登録に失敗したら保存した画像を消し、通知も OCR 投入もしない', async () => {
  const db = await createMigratedTestDb();
  await expect(
    createNoteFromCapture(db, {
      images,
      title: 'x',
      notebookId: asNotebookId('missing-notebook'), // 外部キー違反で失敗させる
    }),
  ).rejects.toThrow(/FOREIGN KEY/);

  expect(mockStorage.deleted).toEqual([['stored0', 'stored1']]);
  expect(await findNote(db, asNoteId('new-note'))).toBeNull();
  expect(mockNotify).not.toHaveBeenCalled();
  expect(mockEnqueueOcr).not.toHaveBeenCalled();
});

test('addPagesToNote: 既存ページの後ろに追加し、ノートの更新日時を進める', async () => {
  const db = await createMigratedTestDb();
  await insertNote(db, buildNote({ id: 'note' }));
  await insertPage(db, buildPage({ id: 'existing', noteId: 'note', position: 0 }));

  await addPagesToNote(db, asNoteId('note'), images);

  const pages = await listPagesOfNote(db, asNoteId('note'));
  expect(pages.map((page) => [page.id, page.position])).toEqual([
    ['existing', 0],
    ['stored0', 1],
    ['stored1', 2],
  ]);
  expect((await findNote(db, asNoteId('note')))?.updatedAt).not.toBe(TEST_NOW);
  expect(mockEnqueueOcr).toHaveBeenCalledWith(['stored0', 'stored1']);
});
