import fs from 'node:fs';
import path from 'node:path';

import { Directory, File, Paths } from 'expo-file-system';

import { findNote } from '@/db/noteRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import { isAppError, type AppErrorKind } from '@/domain/errors';
import type { CapturedImage, NotebookId, NoteId, PageId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest, type NoteManifest } from '@/storage/manifest';
import { thumbnailFile } from '@/storage/paths';

import { asPageId } from '../../test/builders';
import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf } from '../../test/testShelf';
import { createNoteFromCapture } from './capture';
import { createNotebook } from './notebooks';
import { deleteNote, deletePage, moveNote, renameNote, reorderPages } from './notes';

let mockIdCount = 0;
jest.mock('@/native/randomId', () => ({
  newNotebookId: () => `notebook-${++mockIdCount}`,
  newNoteId: () => `note-${++mockIdCount}`,
  newPageId: () => `page-${++mockIdCount}`,
}));
jest.mock('./ocrQueue', () => ({ enqueueOcr: jest.fn() }));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

const LATER = '2030-01-01T00:00:00.000Z';

let shelf: OpenShelf;
/** ライブラリ直下のノート「講義」。ページ画像の中身は順に a, b, c */
let noteId: NoteId;
let pageIds: PageId[];

beforeEach(async () => {
  mockIdCount = 0;
  shelf = await createTestShelf();
  noteId = await captureNote('講義', ['a', 'b', 'c'], null);
  pageIds = (await listPagesOfNote(shelf.db, noteId)).map((page) => page.id);
  mockNotify.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---- 道具 ----

const shelfPath = (...parts: string[]) => path.join(nodePathOf(shelf.directory.uri), ...parts);
const entriesOf = (...parts: string[]) => fs.readdirSync(shelfPath(...parts)).sort();
const noteManifestOf = (...parts: string[]) =>
  readManifest(new Directory(shelf.directory, ...parts)) as NoteManifest;
const contentOf = (...parts: string[]) => fs.readFileSync(shelfPath(...parts), 'utf8');

/** 準備で作ったものより後の日時にする（更新日時が進んだことを確かめるため） */
function advanceClock(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'queueMicrotask'] });
  jest.setSystemTime(new Date(LATER));
}

async function captureNote(
  title: string,
  pageContents: string[],
  notebookId: NotebookId | null,
): Promise<NoteId> {
  const images: CapturedImage[] = pageContents.map((content, index) => {
    const file = new File(Paths.cache, `${title}-${index}.jpg`);
    file.write(content);
    return { uri: file.uri, width: 3000, height: 4000 };
  });
  return createNoteFromCapture(shelf, { images, title, notebookId });
}

async function pageOrder(id = noteId): Promise<[PageId, number][]> {
  const pages = await listPagesOfNote(shelf.db, id);
  return pages.map((page) => [page.id, page.position]);
}

async function expectAppErrorWithoutChange(
  operation: () => Promise<unknown>,
  kind: AppErrorKind,
): Promise<void> {
  const foldersBefore = fs.readdirSync(shelfPath(), { recursive: true }).sort();
  const noteBefore = await findNote(shelf.db, noteId);
  await expect(operation()).rejects.toMatchObject({ name: 'AppError', kind });
  expect(fs.readdirSync(shelfPath(), { recursive: true }).sort()).toEqual(foldersBefore);
  expect(await findNote(shelf.db, noteId)).toEqual(noteBefore);
  expect(mockNotify).not.toHaveBeenCalled();
}

// ---- テスト ----

describe('renameNote', () => {
  test('前後の空白を除いた名前にフォルダを変えてから DB を変え、更新日時を進めて通知する', async () => {
    advanceClock();

    await renameNote(shelf, noteId, '  線形代数 第3回  ');

    const note = await findNote(shelf.db, noteId);
    expect(note?.title).toBe('線形代数 第3回');
    expect(note?.updatedAt).toBe(LATER);
    expect(entriesOf()).toEqual(['.leaves.json', '線形代数 第3回']);
    expect(entriesOf('線形代数 第3回')).toEqual(['.leaves.json', '001.jpg', '002.jpg', '003.jpg']);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('大文字・小文字だけの変更はできる', async () => {
    const id = await captureNote('memo', ['x'], null);

    await renameNote(shelf, id, 'Memo');

    expect((await findNote(shelf.db, id))?.title).toBe('Memo');
    expect(entriesOf()).toContain('Memo');
    expect(entriesOf()).not.toContain('memo');
  });

  test('空白だけの名前は invalidName で拒否し、何も変えない', async () => {
    const error = await renameNote(shelf, noteId, '   ').catch((e: unknown) => e);

    expect(isAppError(error, 'invalidName')).toBe(true);
    expect((await findNote(shelf.db, noteId))?.title).toBe('講義');
    expect(entriesOf()).toEqual(['.leaves.json', '講義']);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  test('同じ場所に同名のノート・ノートブック（大文字・小文字の違いを含む）があれば duplicateName', async () => {
    await captureNote('復習', ['x'], null);
    await createNotebook(shelf, 'Math', null);
    mockNotify.mockClear();

    await expectAppErrorWithoutChange(() => renameNote(shelf, noteId, '復習'), 'duplicateName');
    await expectAppErrorWithoutChange(() => renameNote(shelf, noteId, 'math'), 'duplicateName');
  });
});

describe('moveNote', () => {
  test('ノートブックへフォルダを移し、null ならライブラリ直下へ戻す', async () => {
    const math = await createNotebook(shelf, '数学', null);
    mockNotify.mockClear();

    await moveNote(shelf, noteId, math);
    expect((await findNote(shelf.db, noteId))?.notebookId).toBe(math);
    expect(entriesOf()).toEqual(['.leaves.json', '数学']);
    expect(entriesOf('数学', '講義')).toEqual(['.leaves.json', '001.jpg', '002.jpg', '003.jpg']);

    await moveNote(shelf, noteId, null);
    expect((await findNote(shelf.db, noteId))?.notebookId).toBeNull();
    expect(entriesOf()).toEqual(['.leaves.json', '数学', '講義']);
    expect(entriesOf('数学')).toEqual(['.leaves.json']);
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  test('移動先に同名があれば duplicateName', async () => {
    const math = await createNotebook(shelf, '数学', null);
    await createNotebook(shelf, '講義', math);
    mockNotify.mockClear();

    await expectAppErrorWithoutChange(() => moveNote(shelf, noteId, math), 'duplicateName');
  });
});

test('deleteNote: フォルダを消してから DB のノートとページを消し、サムネイルを消す', async () => {
  const otherId = await captureNote('別のノート', ['x'], null);
  const [otherPage] = await listPagesOfNote(shelf.db, otherId);
  mockNotify.mockClear();

  await deleteNote(shelf, noteId);

  expect(entriesOf()).toEqual(['.leaves.json', '別のノート']);
  expect(await findNote(shelf.db, noteId)).toBeNull();
  expect(await listPagesOfNote(shelf.db, noteId)).toEqual([]);
  for (const pageId of pageIds) expect(thumbnailFile(shelf.id, pageId).exists).toBe(false);
  expect(thumbnailFile(shelf.id, otherPage!.id).exists).toBe(true);
  expect(mockNotify).toHaveBeenCalledTimes(1);
});

describe('reorderPages', () => {
  test('画像を新しい順番のファイル名に付け直し、.leaves.json と DB の順番を変える', async () => {
    const [p0, p1, p2] = pageIds as [PageId, PageId, PageId];
    advanceClock();

    await reorderPages(shelf, noteId, [p2, p0, p1]);

    expect(entriesOf('講義')).toEqual(['.leaves.json', '001.jpg', '002.jpg', '003.jpg']);
    expect(['001.jpg', '002.jpg', '003.jpg'].map((file) => contentOf('講義', file))).toEqual([
      'c',
      'a',
      'b',
    ]);
    const manifest = noteManifestOf('講義');
    expect(manifest.pages.map((page) => [page.id, page.file])).toEqual([
      [p2, '001.jpg'],
      [p0, '002.jpg'],
      [p1, '003.jpg'],
    ]);
    expect(manifest.updatedAt).toBe(LATER);
    expect(await pageOrder()).toEqual([
      [p2, 0],
      [p0, 1],
      [p1, 2],
    ]);
    expect((await findNote(shelf.db, noteId))?.updatedAt).toBe(LATER);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['足りない', [0, 1]],
    ['余分がある', [0, 1, 2, 'other']],
    ['重複がある', [0, 1, 1]],
  ] as const)(
    'ID の集合がノートのページと一致しない（%s）と例外になり、ファイルも順番も変わらない',
    async (_, indexes) => {
      const ids = indexes.map((index) =>
        typeof index === 'number' ? pageIds[index]! : asPageId(index),
      );

      const error = await reorderPages(shelf, noteId, ids).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(isAppError(error)).toBe(false);
      expect(['001.jpg', '002.jpg', '003.jpg'].map((file) => contentOf('講義', file))).toEqual([
        'a',
        'b',
        'c',
      ]);
      expect(noteManifestOf('講義').pages.map((page) => page.id)).toEqual(pageIds);
      expect(await pageOrder()).toEqual(pageIds.map((id, position) => [id, position]));
      expect(mockNotify).not.toHaveBeenCalled();
    },
  );
});

describe('deletePage', () => {
  test('途中のページを消すと、画像を消して残りを 001.jpg から付け直し、.leaves.json と DB を詰める', async () => {
    const [p0, p1, p2] = pageIds as [PageId, PageId, PageId];
    advanceClock();

    const result = await deletePage(shelf, p1);

    expect(result).toEqual({ noteDeleted: false });
    expect(entriesOf('講義')).toEqual(['.leaves.json', '001.jpg', '002.jpg']);
    expect(contentOf('講義', '001.jpg')).toBe('a');
    expect(contentOf('講義', '002.jpg')).toBe('c');
    expect(noteManifestOf('講義').pages.map((page) => [page.id, page.file])).toEqual([
      [p0, '001.jpg'],
      [p2, '002.jpg'],
    ]);
    expect(await pageOrder()).toEqual([
      [p0, 0],
      [p2, 1],
    ]);
    expect((await findNote(shelf.db, noteId))?.updatedAt).toBe(LATER);
    expect(thumbnailFile(shelf.id, p1).exists).toBe(false);
    expect(thumbnailFile(shelf.id, p0).exists).toBe(true);
    expect(thumbnailFile(shelf.id, p2).exists).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  test('最後の1ページを消すとノートごと消える', async () => {
    const onlyNoteId = await captureNote('1枚だけ', ['x'], null);
    const [only] = await listPagesOfNote(shelf.db, onlyNoteId);
    mockNotify.mockClear();

    const result = await deletePage(shelf, only!.id);

    expect(result).toEqual({ noteDeleted: true });
    expect(entriesOf()).toEqual(['.leaves.json', '講義']);
    expect(await findNote(shelf.db, onlyNoteId)).toBeNull();
    expect(thumbnailFile(shelf.id, only!.id).exists).toBe(false);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});
