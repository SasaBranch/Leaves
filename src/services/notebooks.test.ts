import fs from 'node:fs';
import path from 'node:path';

import { Directory, File, Paths } from 'expo-file-system';

import { NOTEBOOK_COLORS } from '@/config';
import { findNotebook, listAllNotebooks } from '@/db/notebookRepository';
import { findNote } from '@/db/noteRepository';
import { findPage, listPageIdsOfNote } from '@/db/pageRepository';
import type { AppErrorKind } from '@/domain/errors';
import type { CapturedImage, NotebookId, NoteId, PageId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest } from '@/storage/manifest';
import { thumbnailFile } from '@/storage/paths';

import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf } from '../../test/testShelf';
import { createNoteFromCapture } from './capture';
import {
  changeNotebookColor,
  createNotebook,
  deleteNotebookWithContents,
  moveNotebook,
  renameNotebook,
} from './notebooks';

let mockIdCount = 0;
jest.mock('@/native/randomId', () => ({
  newNotebookId: () => `notebook-${++mockIdCount}`,
  newNoteId: () => `note-${++mockIdCount}`,
  newPageId: () => `page-${++mockIdCount}`,
}));
jest.mock('./ocrQueue', () => ({ enqueueOcr: jest.fn() }));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

let shelf: OpenShelf;
/** 大学 > 線形代数 > 演習、と ライブラリ直下の 趣味 */
let tree: { univ: NotebookId; linear: NotebookId; exercise: NotebookId; hobby: NotebookId };

beforeEach(async () => {
  mockIdCount = 0;
  shelf = await createTestShelf();
  const univ = await createNotebook(shelf, '大学', null);
  const linear = await createNotebook(shelf, '線形代数', univ);
  const exercise = await createNotebook(shelf, '演習', linear);
  const hobby = await createNotebook(shelf, '趣味', null);
  tree = { univ, linear, exercise, hobby };
  mockNotify.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---- 道具 ----

const shelfPath = (...parts: string[]) => path.join(nodePathOf(shelf.directory.uri), ...parts);
const entriesOf = (...parts: string[]) => fs.readdirSync(shelfPath(...parts)).sort();
const manifestOf = (...parts: string[]) => readManifest(new Directory(shelf.directory, ...parts));

/** 準備で作ったものより後の日時にする（更新日時が進んだことを確かめるため） */
function advanceClock(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
}

async function captureNote(
  title: string,
  notebookId: NotebookId | null,
): Promise<{ noteId: NoteId; pageIds: PageId[] }> {
  const file = new File(Paths.cache, `${title}.jpg`);
  file.write(title);
  const images: CapturedImage[] = [{ uri: file.uri, width: 3000, height: 4000 }];
  const noteId = await createNoteFromCapture(shelf, { images, title, notebookId });
  return { noteId, pageIds: await listPageIdsOfNote(shelf.db, noteId) };
}

/** 失敗したら、フォルダも DB も変わらず通知もしない */
async function expectRejectedWithoutChange(
  operation: () => Promise<unknown>,
  kind: AppErrorKind,
): Promise<void> {
  const foldersBefore = fs.readdirSync(shelfPath(), { recursive: true }).sort();
  const notebooksBefore = await listAllNotebooks(shelf.db);
  await expect(operation()).rejects.toMatchObject({ name: 'AppError', kind });
  expect(fs.readdirSync(shelfPath(), { recursive: true }).sort()).toEqual(foldersBefore);
  expect(await listAllNotebooks(shelf.db)).toEqual(notebooksBefore);
  expect(mockNotify).not.toHaveBeenCalled();
}

// ---- テスト ----

describe('createNotebook', () => {
  test('前後の空白を除いた名前でフォルダと .leaves.json を作ってから DB に登録し、通知する', async () => {
    const id = await createNotebook(shelf, '  統計学 ', tree.univ);

    const notebook = await findNotebook(shelf.db, id);
    expect(notebook).toMatchObject({ name: '統計学', parentId: tree.univ });
    expect(entriesOf('大学')).toEqual(['.leaves.json', '統計学', '線形代数']);
    expect(manifestOf('大学', '統計学')).toMatchObject({
      kind: 'notebook',
      id,
      color: notebook?.color,
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('表紙色は同じ親の下のノートブック数で順番に割り当て、一巡したら先頭に戻る', async () => {
    shelf = await createTestShelf();

    const ids: NotebookId[] = [];
    for (let i = 0; i <= NOTEBOOK_COLORS.length; i++) {
      ids.push(await createNotebook(shelf, `ノートブック${i}`, null));
    }
    const childId = await createNotebook(shelf, '子', ids[0]!);

    const colors = await Promise.all(
      ids.map(async (id) => (await findNotebook(shelf.db, id))?.color),
    );
    expect(colors).toEqual([...NOTEBOOK_COLORS, NOTEBOOK_COLORS[0]]);
    expect((await findNotebook(shelf.db, childId))?.color).toBe(NOTEBOOK_COLORS[0]);
    expect(manifestOf('ノートブック1')).toMatchObject({ color: NOTEBOOK_COLORS[1] });
    expect(manifestOf('ノートブック0', '子')).toMatchObject({ color: NOTEBOOK_COLORS[0] });
  });

  test.each(['', '   '])('名前が「%s」なら invalidName', async (name) => {
    await expectRejectedWithoutChange(() => createNotebook(shelf, name, null), 'invalidName');
  });

  test.each(['a/b', '時刻 10:30', '.hidden'])(
    '名前が「%s」なら invalidNameCharacters',
    async (name) => {
      await expectRejectedWithoutChange(
        () => createNotebook(shelf, name, null),
        'invalidNameCharacters',
      );
    },
  );

  test('ライブラリ直下に同名があれば duplicateName', async () => {
    await expectRejectedWithoutChange(() => createNotebook(shelf, ' 趣味 ', null), 'duplicateName');
  });

  test('同じ場所に同名のノートのフォルダがあっても duplicateName', async () => {
    await captureNote('講義', tree.univ);
    mockNotify.mockClear();
    await expectRejectedWithoutChange(
      () => createNotebook(shelf, '講義', tree.univ),
      'duplicateName',
    );
  });

  test('大文字・小文字だけが違う名前も duplicateName', async () => {
    await createNotebook(shelf, 'Math', null);
    mockNotify.mockClear();
    await expectRejectedWithoutChange(() => createNotebook(shelf, 'math', null), 'duplicateName');
  });

  test('同じ親の下に同名があれば duplicateName。別の親の下なら作成できる', async () => {
    await expectRejectedWithoutChange(
      () => createNotebook(shelf, '線形代数', tree.univ),
      'duplicateName',
    );

    await createNotebook(shelf, '線形代数', null);
    expect(await listAllNotebooks(shelf.db)).toHaveLength(5);
    expect(entriesOf()).toEqual(['.leaves.json', '大学', '線形代数', '趣味']);
  });
});

describe('renameNotebook', () => {
  test('フォルダの名前を変えてから DB を変え、更新日時を進めて通知する', async () => {
    advanceClock();

    await renameNotebook(shelf, tree.linear, ' 線形代数 I ');

    const notebook = await findNotebook(shelf.db, tree.linear);
    expect(notebook).toMatchObject({ name: '線形代数 I' });
    expect(notebook?.updatedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(entriesOf('大学')).toEqual(['.leaves.json', '線形代数 I']);
    // 中身ごと付いてくる
    expect(entriesOf('大学', '線形代数 I')).toEqual(['.leaves.json', '演習']);
    expect(manifestOf('大学', '線形代数 I')).toMatchObject({ kind: 'notebook', id: tree.linear });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('大文字・小文字だけの変更はできる', async () => {
    const id = await createNotebook(shelf, 'math', null);

    await renameNotebook(shelf, id, 'Math');

    expect((await findNotebook(shelf.db, id))?.name).toBe('Math');
    expect(entriesOf()).toContain('Math');
    expect(entriesOf()).not.toContain('math');
  });

  test('空白だけの名前なら invalidName', async () => {
    await expectRejectedWithoutChange(() => renameNotebook(shelf, tree.linear, ' '), 'invalidName');
  });

  test('使えない文字を含む名前なら invalidNameCharacters', async () => {
    await expectRejectedWithoutChange(
      () => renameNotebook(shelf, tree.linear, '線形/代数'),
      'invalidNameCharacters',
    );
  });

  test('同じ親の下に同名（大文字・小文字の違いを含む）があれば duplicateName', async () => {
    await expectRejectedWithoutChange(
      () => renameNotebook(shelf, tree.hobby, '大学'),
      'duplicateName',
    );
    const other = await createNotebook(shelf, 'Math', null);
    mockNotify.mockClear();
    await expectRejectedWithoutChange(
      () => renameNotebook(shelf, tree.hobby, 'MATH'),
      'duplicateName',
    );
    expect((await findNotebook(shelf.db, other))?.name).toBe('Math');
  });

  test('同じ親の下に同名のノートがあれば duplicateName', async () => {
    await captureNote('講義', null);
    mockNotify.mockClear();
    await expectRejectedWithoutChange(
      () => renameNotebook(shelf, tree.hobby, '講義'),
      'duplicateName',
    );
  });
});

test('changeNotebookColor: .leaves.json と DB の色を変えて通知する', async () => {
  await changeNotebookColor(shelf, tree.hobby, NOTEBOOK_COLORS[5]);

  expect((await findNotebook(shelf.db, tree.hobby))?.color).toBe(NOTEBOOK_COLORS[5]);
  expect(manifestOf('趣味')).toMatchObject({
    kind: 'notebook',
    id: tree.hobby,
    color: NOTEBOOK_COLORS[5],
  });
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

describe('moveNotebook', () => {
  test('別のノートブックの下へ、中身ごとフォルダを移してから DB を変え、通知する', async () => {
    await moveNotebook(shelf, tree.linear, tree.hobby);

    expect((await findNotebook(shelf.db, tree.linear))?.parentId).toBe(tree.hobby);
    expect(entriesOf('大学')).toEqual(['.leaves.json']);
    expect(entriesOf('趣味', '線形代数')).toEqual(['.leaves.json', '演習']);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('ライブラリ直下へ移動できる', async () => {
    await moveNotebook(shelf, tree.exercise, null);

    expect((await findNotebook(shelf.db, tree.exercise))?.parentId).toBeNull();
    expect(entriesOf()).toEqual(['.leaves.json', '大学', '演習', '趣味']);
    expect(entriesOf('大学', '線形代数')).toEqual(['.leaves.json']);
  });

  test.each([
    ['自分自身', 'linear'],
    ['子孫', 'exercise'],
  ] as const)('%sの下へは移動できず invalidMove', async (_, target) => {
    await expectRejectedWithoutChange(
      () => moveNotebook(shelf, tree.linear, tree[target]),
      'invalidMove',
    );
  });

  test('移動先に同名があれば duplicateName', async () => {
    const other = await createNotebook(shelf, '演習', tree.hobby);
    mockNotify.mockClear();
    await expectRejectedWithoutChange(
      () => moveNotebook(shelf, other, tree.linear),
      'duplicateName',
    );
  });

  test('ライブラリ直下に同名（ノートを含む）があれば duplicateName', async () => {
    const nestedHobby = await createNotebook(shelf, '趣味', tree.univ);
    await captureNote('講義', null);
    const nestedLecture = await createNotebook(shelf, '講義', tree.univ);
    mockNotify.mockClear();

    await expectRejectedWithoutChange(
      () => moveNotebook(shelf, nestedHobby, null),
      'duplicateName',
    );
    await expectRejectedWithoutChange(
      () => moveNotebook(shelf, nestedLecture, null),
      'duplicateName',
    );
  });
});

test('deleteNotebookWithContents: フォルダを中身ごと消し、子孫ごと DB から消し、サムネイルを消して通知する', async () => {
  const linearNote = await captureNote('第1回', tree.linear);
  const exerciseNote = await captureNote('演習1', tree.exercise);
  const hobbyNote = await captureNote('料理', tree.hobby);
  const pageIds = [...linearNote.pageIds, ...exerciseNote.pageIds];
  for (const pageId of pageIds) expect(thumbnailFile(shelf.id, pageId).exists).toBe(true);
  mockNotify.mockClear();

  await deleteNotebookWithContents(shelf, tree.linear);

  expect(entriesOf('大学')).toEqual(['.leaves.json']);
  expect((await listAllNotebooks(shelf.db)).map((notebook) => notebook.id).sort()).toEqual(
    [tree.univ, tree.hobby].sort(),
  );
  expect(await findNote(shelf.db, exerciseNote.noteId)).toBeNull();
  expect(await findNote(shelf.db, linearNote.noteId)).toBeNull();
  for (const pageId of pageIds) {
    expect(await findPage(shelf.db, pageId)).toBeNull();
    expect(thumbnailFile(shelf.id, pageId).exists).toBe(false);
  }
  // 関係のないノートは残る
  expect(await findPage(shelf.db, hobbyNote.pageIds[0]!)).not.toBeNull();
  expect(thumbnailFile(shelf.id, hobbyNote.pageIds[0]!).exists).toBe(true);
  expect(entriesOf('趣味', '料理')).toEqual(['.leaves.json', '001.jpg']);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});
