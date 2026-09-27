import { findNote } from '@/db/noteRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import type { Db } from '@/db/db';
import { isAppError } from '@/domain/errors';

import { asNoteId, asNotebookId, asPageId } from '../../test/builders';
import {
  createMigratedTestDb,
  insertNotebookRow,
  insertNoteRow,
  insertPageRow,
  TEST_NOW,
} from '../../test/migratedTestDb';
import { deleteNote, deletePage, moveNote, renameNote, reorderPages } from './notes';

// 画像ファイルの削除は storage のテストで確かめたので、ここでは渡された ID だけを見る
const mockDeletedImages: string[][] = [];
jest.mock('@/storage/pageImages', () => ({
  deletePageImages: (ids: string[]) => mockDeletedImages.push(ids),
}));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

beforeEach(() => {
  mockDeletedImages.length = 0;
  mockNotify.mockClear();
});

/** ノート 'note' にページ p0, p1, p2 を順に入れた DB */
async function createDbWithThreePages(): Promise<Db> {
  const db = await createMigratedTestDb();
  await insertNoteRow(db, { id: 'note', title: '講義' });
  for (const [position, id] of ['p0', 'p1', 'p2'].entries()) {
    await insertPageRow(db, { id, noteId: 'note', position });
  }
  return db;
}

async function pageOrder(db: Db): Promise<[string, number][]> {
  const pages = await listPagesOfNote(db, asNoteId('note'));
  return pages.map((page) => [page.id, page.position]);
}

test('renameNote: 前後の空白を除いて保存し、更新日時を進めて通知する', async () => {
  const db = await createDbWithThreePages();

  await renameNote(db, asNoteId('note'), '  線形代数 第3回  ');

  const note = await findNote(db, asNoteId('note'));
  expect(note?.title).toBe('線形代数 第3回');
  expect(note?.updatedAt).not.toBe(TEST_NOW);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

test('renameNote: 空白だけの名前は invalidName で拒否し、何も変えない', async () => {
  const db = await createDbWithThreePages();

  const error = await renameNote(db, asNoteId('note'), '   ').catch((e: unknown) => e);

  expect(isAppError(error, 'invalidName')).toBe(true);
  expect((await findNote(db, asNoteId('note')))?.title).toBe('講義');
  expect(mockNotify).not.toHaveBeenCalled();
});

test('moveNote: ノートブックへ移し、null ならライブラリ直下へ戻す', async () => {
  const db = await createDbWithThreePages();
  await insertNotebookRow(db, { id: 'math', name: '数学' });

  await moveNote(db, asNoteId('note'), asNotebookId('math'));
  expect((await findNote(db, asNoteId('note')))?.notebookId).toBe('math');

  await moveNote(db, asNoteId('note'), null);
  expect((await findNote(db, asNoteId('note')))?.notebookId).toBeNull();
  expect(mockNotify).toHaveBeenCalledTimes(2);
});

test('deleteNote: ノートとページを消し、そのページの画像を消す', async () => {
  const db = await createDbWithThreePages();

  await deleteNote(db, asNoteId('note'));

  expect(await findNote(db, asNoteId('note'))).toBeNull();
  expect(await listPagesOfNote(db, asNoteId('note'))).toEqual([]);
  expect(mockDeletedImages.map((ids) => [...ids].sort())).toEqual([['p0', 'p1', 'p2']]);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

test('reorderPages: 渡した順に position を振り直し、ノートの更新日時を進める', async () => {
  const db = await createDbWithThreePages();

  await reorderPages(db, asNoteId('note'), ['p2', 'p0', 'p1'].map(asPageId));

  expect(await pageOrder(db)).toEqual([
    ['p2', 0],
    ['p0', 1],
    ['p1', 2],
  ]);
  expect((await findNote(db, asNoteId('note')))?.updatedAt).not.toBe(TEST_NOW);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

test.each([
  ['足りない', ['p0', 'p1']],
  ['余分がある', ['p0', 'p1', 'p2', 'other']],
  ['重複がある', ['p0', 'p1', 'p1']],
])(
  'reorderPages: ID の集合がノートのページと一致しない（%s）と例外になり、順番は変わらない',
  async (_, ids) => {
    const db = await createDbWithThreePages();

    const error = await reorderPages(db, asNoteId('note'), ids.map(asPageId)).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect(isAppError(error)).toBe(false);
    expect(await pageOrder(db)).toEqual([
      ['p0', 0],
      ['p1', 1],
      ['p2', 2],
    ]);
    expect(mockNotify).not.toHaveBeenCalled();
  },
);

test('deletePage: 途中のページを消すと、残りを 0 から詰め直して画像を消す', async () => {
  const db = await createDbWithThreePages();

  const result = await deletePage(db, asPageId('p1'));

  expect(result).toEqual({ noteDeleted: false });
  expect(await pageOrder(db)).toEqual([
    ['p0', 0],
    ['p2', 1],
  ]);
  expect((await findNote(db, asNoteId('note')))?.updatedAt).not.toBe(TEST_NOW);
  expect(mockDeletedImages).toEqual([['p1']]);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

test('deletePage: 最後の1ページを消すとノートごと消える', async () => {
  const db = await createMigratedTestDb();
  await insertNoteRow(db, { id: 'note', title: '1枚だけ' });
  await insertPageRow(db, { id: 'only', noteId: 'note', position: 0 });

  const result = await deletePage(db, asPageId('only'));

  expect(result).toEqual({ noteDeleted: true });
  expect(await findNote(db, asNoteId('note'))).toBeNull();
  expect(mockDeletedImages).toEqual([['only']]);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});
