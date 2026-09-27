import { NOTEBOOK_COLORS } from '@/config';
import type { Db } from '@/db/db';
import { findNotebook, listAllNotebooks } from '@/db/notebookRepository';
import { findNote } from '@/db/noteRepository';
import { findPage } from '@/db/pageRepository';
import type { AppErrorKind } from '@/domain/errors';
import type { NotebookId } from '@/domain/types';

import { asNoteId, asNotebookId, asPageId } from '../../test/builders';
import {
  createMigratedTestDb,
  insertNotebookRow,
  insertNoteRow,
  insertPageRow,
  TEST_NOW,
} from '../../test/migratedTestDb';
import {
  changeNotebookColor,
  createNotebook,
  deleteNotebookWithContents,
  moveNotebook,
  renameNotebook,
} from './notebooks';

const mockDeletedImages: string[][] = [];
jest.mock('@/storage/pageImages', () => ({
  deletePageImages: (ids: string[]) => mockDeletedImages.push(ids),
  withImageOperation: (operation: () => Promise<unknown>) => operation(),
}));
let mockNotebookCount = 0;
jest.mock('@/native/randomId', () => ({ newNotebookId: () => `new${mockNotebookCount++}` }));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

beforeEach(() => {
  mockDeletedImages.length = 0;
  mockNotebookCount = 0;
  mockNotify.mockClear();
});

/** 大学 > 線形代数 > 演習、と ライブラリ直下の 趣味 */
async function createTreeDb(): Promise<Db> {
  const db = await createMigratedTestDb();
  await insertNotebookRow(db, { id: 'univ', name: '大学' });
  await insertNotebookRow(db, { id: 'linear', parentId: 'univ', name: '線形代数' });
  await insertNotebookRow(db, { id: 'exercise', parentId: 'linear', name: '演習' });
  await insertNotebookRow(db, { id: 'hobby', name: '趣味' });
  return db;
}

async function expectAppError(promise: Promise<unknown>, kind: AppErrorKind): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'AppError', kind });
  expect(mockNotify).not.toHaveBeenCalled();
}

describe('createNotebook', () => {
  test('前後の空白を除いた名前で作成し、通知する', async () => {
    const db = await createTreeDb();

    const id = await createNotebook(db, '  統計学 ', asNotebookId('univ'));

    expect(await findNotebook(db, id)).toMatchObject({ name: '統計学', parentId: 'univ' });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('表紙色は同じ親の下のノートブック数で順番に割り当て、一巡したら先頭に戻る', async () => {
    const db = await createMigratedTestDb();

    const ids: NotebookId[] = [];
    for (let i = 0; i <= NOTEBOOK_COLORS.length; i++) {
      ids.push(await createNotebook(db, `ノートブック${i}`, null));
    }
    const childId = await createNotebook(db, '子', ids[0]!);

    const colors = await Promise.all(ids.map(async (id) => (await findNotebook(db, id))?.color));
    expect(colors).toEqual([...NOTEBOOK_COLORS, NOTEBOOK_COLORS[0]]);
    expect((await findNotebook(db, childId))?.color).toBe(NOTEBOOK_COLORS[0]);
  });

  test.each(['', '   '])('名前が「%s」なら invalidName', async (name) => {
    const db = await createTreeDb();
    await expectAppError(createNotebook(db, name, null), 'invalidName');
  });

  test('ライブラリ直下に同名があれば duplicateName', async () => {
    const db = await createTreeDb();
    await expectAppError(createNotebook(db, ' 趣味 ', null), 'duplicateName');
  });

  test('同じ親の下に同名があれば duplicateName。別の親の下なら作成できる', async () => {
    const db = await createTreeDb();
    await expectAppError(createNotebook(db, '線形代数', asNotebookId('univ')), 'duplicateName');

    await createNotebook(db, '線形代数', null);
    expect(await listAllNotebooks(db)).toHaveLength(5);
  });
});

describe('renameNotebook', () => {
  test('前後の空白を除いた名前に変え、更新日時を進めて通知する', async () => {
    const db = await createTreeDb();

    await renameNotebook(db, asNotebookId('linear'), ' 線形代数 I ');

    const notebook = await findNotebook(db, asNotebookId('linear'));
    expect(notebook).toMatchObject({ name: '線形代数 I' });
    expect(notebook?.updatedAt).not.toBe(TEST_NOW);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('空白だけの名前なら invalidName', async () => {
    const db = await createTreeDb();
    await expectAppError(renameNotebook(db, asNotebookId('linear'), ' '), 'invalidName');
  });

  test('同じ親の下に同名があれば duplicateName', async () => {
    const db = await createTreeDb();
    await expectAppError(renameNotebook(db, asNotebookId('hobby'), '大学'), 'duplicateName');
    expect((await findNotebook(db, asNotebookId('hobby')))?.name).toBe('趣味');
  });
});

test('changeNotebookColor: 色を変えて通知する', async () => {
  const db = await createTreeDb();

  await changeNotebookColor(db, asNotebookId('hobby'), NOTEBOOK_COLORS[5]);

  expect((await findNotebook(db, asNotebookId('hobby')))?.color).toBe(NOTEBOOK_COLORS[5]);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

describe('moveNotebook', () => {
  test('別のノートブックの下へ移動して通知する', async () => {
    const db = await createTreeDb();

    await moveNotebook(db, asNotebookId('linear'), asNotebookId('hobby'));

    expect((await findNotebook(db, asNotebookId('linear')))?.parentId).toBe('hobby');
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('ライブラリ直下へ移動できる', async () => {
    const db = await createTreeDb();

    await moveNotebook(db, asNotebookId('exercise'), null);

    expect((await findNotebook(db, asNotebookId('exercise')))?.parentId).toBeNull();
  });

  test.each([
    ['自分自身', 'linear'],
    ['子孫', 'exercise'],
  ])('%sの下へは移動できず invalidMove', async (_, newParentId) => {
    const db = await createTreeDb();
    await expectAppError(
      moveNotebook(db, asNotebookId('linear'), asNotebookId(newParentId)),
      'invalidMove',
    );
    expect((await findNotebook(db, asNotebookId('linear')))?.parentId).toBe('univ');
  });

  test('移動先に同名があれば duplicateName', async () => {
    const db = await createTreeDb();
    await insertNotebookRow(db, { id: 'other-exercise', parentId: 'hobby', name: '演習' });
    await expectAppError(
      moveNotebook(db, asNotebookId('other-exercise'), asNotebookId('linear')),
      'duplicateName',
    );
  });

  test('ライブラリ直下に同名があれば duplicateName', async () => {
    const db = await createTreeDb();
    await insertNotebookRow(db, { id: 'nested-hobby', parentId: 'univ', name: '趣味' });
    await expectAppError(moveNotebook(db, asNotebookId('nested-hobby'), null), 'duplicateName');
  });
});

test('deleteNotebookWithContents: 子孫ごと DB から消し、含まれるページの画像を消して通知する', async () => {
  const db = await createTreeDb();
  await insertNoteRow(db, { id: 'linear-note', notebookId: 'linear', title: '第1回' });
  await insertPageRow(db, { id: 'p1', noteId: 'linear-note', position: 0 });
  await insertNoteRow(db, { id: 'exercise-note', notebookId: 'exercise', title: '演習1' });
  await insertPageRow(db, { id: 'p2', noteId: 'exercise-note', position: 0 });
  await insertNoteRow(db, { id: 'hobby-note', notebookId: 'hobby', title: '料理' });
  await insertPageRow(db, { id: 'p3', noteId: 'hobby-note', position: 0 });

  await deleteNotebookWithContents(db, asNotebookId('linear'));

  expect((await listAllNotebooks(db)).map((notebook) => notebook.id).sort()).toEqual([
    'hobby',
    'univ',
  ]);
  expect(await findNote(db, asNoteId('exercise-note'))).toBeNull();
  expect(await findPage(db, asPageId('p1'))).toBeNull();
  expect(await findPage(db, asPageId('p3'))).not.toBeNull();
  expect(mockDeletedImages.map((ids) => [...ids].sort())).toEqual([['p1', 'p2']]);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});
