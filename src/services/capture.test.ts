import fs from 'node:fs';
import path from 'node:path';

import { Directory, File, Paths } from 'expo-file-system';

import { findNote, listNoteSummaries } from '@/db/noteRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import type { CapturedImage, NotebookId, PageId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest, type NoteManifest } from '@/storage/manifest';
import { thumbnailFile, thumbnailsDirectory, workDirectory } from '@/storage/paths';

import { fakeImageManipulator } from '../../test/fakeImageManipulator';
import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf } from '../../test/testShelf';
import { addPagesToNote, createNoteFromCapture } from './capture';
import { createNotebook } from './notebooks';

let mockIdCount = 0;
jest.mock('@/native/randomId', () => ({
  newNotebookId: () => `notebook-${++mockIdCount}`,
  newNoteId: () => `note-${++mockIdCount}`,
  newPageId: () => `page-${++mockIdCount}`,
}));
const mockEnqueueOcr = jest.fn();
jest.mock('./ocrQueue', () => ({ enqueueOcr: (ids: string[]) => mockEnqueueOcr(ids) }));
const mockNotify = jest.fn();
jest.mock('@/state/dataChanges', () => ({ notifyDataChanged: () => mockNotify() }));

const LATER = '2030-01-01T00:00:00.000Z';

let shelf: OpenShelf;
let linear: NotebookId;

beforeEach(async () => {
  mockIdCount = 0;
  fakeImageManipulator.reset();
  shelf = await createTestShelf();
  linear = await createNotebook(shelf, '線形代数', null);
  mockEnqueueOcr.mockClear();
  mockNotify.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---- 道具 ----

const shelfPath = (...parts: string[]) => path.join(nodePathOf(shelf.directory.uri), ...parts);
const entriesOf = (...parts: string[]) => fs.readdirSync(shelfPath(...parts)).sort();
const contentOf = (...parts: string[]) => fs.readFileSync(shelfPath(...parts), 'utf8');
const noteManifestOf = (...parts: string[]) =>
  readManifest(new Directory(shelf.directory, ...parts)) as NoteManifest;
const workEntries = () =>
  workDirectory(shelf.directory).exists ? workDirectory(shelf.directory).list() : [];
const thumbnailEntries = () =>
  thumbnailsDirectory(shelf.id).exists ? thumbnailsDirectory(shelf.id).list() : [];

/** スキャナ・写真選択が作る一時画像（中身はページの区別に使う） */
function capturedImages(...contents: string[]): CapturedImage[] {
  return contents.map((content) => {
    const file = new File(Paths.cache, `captured-${content}.jpg`);
    file.write(content);
    return { uri: file.uri, width: 3000, height: 4000 };
  });
}

const existsAll = (images: CapturedImage[]) => images.map((image) => new File(image.uri).exists);

// ---- テスト ----

describe('createNoteFromCapture', () => {
  test('ノートブックのフォルダに 001.jpg… と .leaves.json を持つノートを置き、DB に登録する', async () => {
    const images = capturedImages('a', 'b');

    const noteId = await createNoteFromCapture(shelf, {
      images,
      title: '2026-09-28 10.30',
      notebookId: linear,
    });

    expect(entriesOf('線形代数')).toEqual(['.leaves.json', '2026-09-28 10.30']);
    expect(entriesOf('線形代数', '2026-09-28 10.30')).toEqual([
      '.leaves.json',
      '001.jpg',
      '002.jpg',
    ]);
    expect(contentOf('線形代数', '2026-09-28 10.30', '001.jpg')).toBe('a');
    expect(contentOf('線形代数', '2026-09-28 10.30', '002.jpg')).toBe('b');

    const manifest = noteManifestOf('線形代数', '2026-09-28 10.30');
    expect(manifest).toMatchObject({ kind: 'note', id: noteId });
    const pageIds = manifest.pages.map((page) => page.id);
    expect(
      manifest.pages.map((page) => [page.file, page.ocrStatus, page.width, page.height]),
    ).toEqual([
      ['001.jpg', 'pending', 1800, 2400],
      ['002.jpg', 'pending', 1800, 2400],
    ]);

    const [summary] = await listNoteSummaries(shelf.db, linear, 'updatedAt');
    expect(summary).toMatchObject({
      id: noteId,
      title: '2026-09-28 10.30',
      pageCount: 2,
      coverPageId: pageIds[0],
    });
    const pages = await listPagesOfNote(shelf.db, noteId);
    expect(pages.map((page) => [page.id, page.position, page.ocrStatus])).toEqual([
      [pageIds[0], 0, 'pending'],
      [pageIds[1], 1, 'pending'],
    ]);
    for (const pageId of pageIds) expect(thumbnailFile(shelf.id, pageId).exists).toBe(true);
  });

  test('一時画像を消し、作業用フォルダを残さず、通知して OCR に投入する', async () => {
    const images = capturedImages('a', 'b');

    const noteId = await createNoteFromCapture(shelf, { images, title: '講義', notebookId: null });

    expect(existsAll(images)).toEqual([false, false]);
    expect(workEntries()).toEqual([]);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const pageIds = (await listPagesOfNote(shelf.db, noteId)).map((page) => page.id);
    expect(mockEnqueueOcr).toHaveBeenCalledWith(pageIds);
  });

  test('ライブラリ直下（null）にも作れる', async () => {
    const noteId = await createNoteFromCapture(shelf, {
      images: capturedImages('a'),
      title: '講義',
      notebookId: null,
    });

    expect(entriesOf()).toEqual(['.leaves.json', '線形代数', '講義']);
    expect(await findNote(shelf.db, noteId)).toMatchObject({ title: '講義', notebookId: null });
  });

  test('保存先に同名（ノートブック・大文字小文字の違いを含む）があれば " (2)"… を付ける（FR-S-07）', async () => {
    const capture = (content: string, title: string) =>
      createNoteFromCapture(shelf, { images: capturedImages(content), title, notebookId: null });

    const first = await capture('a', '線形代数');
    const second = await capture('b', '線形代数');
    const lower = await capture('c', 'memo');
    const upper = await capture('d', 'MEMO');

    expect((await findNote(shelf.db, first))?.title).toBe('線形代数 (2)');
    expect((await findNote(shelf.db, second))?.title).toBe('線形代数 (3)');
    expect((await findNote(shelf.db, lower))?.title).toBe('memo');
    expect((await findNote(shelf.db, upper))?.title).toBe('MEMO (2)');
    expect(entriesOf()).toEqual([
      '.leaves.json',
      'MEMO (2)',
      'memo',
      '線形代数',
      '線形代数 (2)',
      '線形代数 (3)',
    ]);
    expect(contentOf('線形代数 (3)', '001.jpg')).toBe('b');
    expect(contentOf('MEMO (2)', '001.jpg')).toBe('d');
  });

  test('画像の変換に失敗したら、本棚にも DB にも何も作らず、作業用フォルダとサムネイルを残さない', async () => {
    const images = capturedImages('a', 'b');
    // 1枚目のページ画像・サムネイルの後、2枚目のページ画像で失敗させる
    fakeImageManipulator.failOnSave = 3;

    await expect(
      createNoteFromCapture(shelf, { images, title: '講義', notebookId: linear }),
    ).rejects.toThrow('変換に失敗');

    expect(entriesOf()).toEqual(['.leaves.json', '線形代数']);
    expect(entriesOf('線形代数')).toEqual(['.leaves.json']);
    expect(await listNoteSummaries(shelf.db, linear, 'updatedAt')).toEqual([]);
    expect(workEntries()).toEqual([]);
    expect(thumbnailEntries()).toEqual([]);
    // 取り込み直せるよう、一時画像は残す
    expect(existsAll(images)).toEqual([true, true]);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockEnqueueOcr).not.toHaveBeenCalled();
  });
});

describe('addPagesToNote', () => {
  test('既存ページの後ろに 003.jpg… を書き、.leaves.json と DB に追加し、ノートの更新日時を進める', async () => {
    const noteId = await createNoteFromCapture(shelf, {
      images: capturedImages('a', 'b'),
      title: '講義',
      notebookId: linear,
    });
    const existingIds = (await listPagesOfNote(shelf.db, noteId)).map((page) => page.id);
    mockEnqueueOcr.mockClear();
    mockNotify.mockClear();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'queueMicrotask'] });
    jest.setSystemTime(new Date(LATER));
    const images = capturedImages('c', 'd');

    await addPagesToNote(shelf, noteId, images);

    expect(entriesOf('線形代数', '講義')).toEqual([
      '.leaves.json',
      '001.jpg',
      '002.jpg',
      '003.jpg',
      '004.jpg',
    ]);
    expect(contentOf('線形代数', '講義', '003.jpg')).toBe('c');
    expect(contentOf('線形代数', '講義', '004.jpg')).toBe('d');

    const manifest = noteManifestOf('線形代数', '講義');
    expect(manifest.updatedAt).toBe(LATER);
    expect(manifest.pages.map((page) => page.file)).toEqual([
      '001.jpg',
      '002.jpg',
      '003.jpg',
      '004.jpg',
    ]);
    const addedIds = manifest.pages.slice(2).map((page) => page.id);
    expect(manifest.pages.slice(0, 2).map((page) => page.id)).toEqual(existingIds);

    const pages = await listPagesOfNote(shelf.db, noteId);
    expect(pages.map((page) => [page.id, page.position])).toEqual(
      [...existingIds, ...addedIds].map((id, position): [PageId, number] => [id, position]),
    );
    expect((await findNote(shelf.db, noteId))?.updatedAt).toBe(LATER);
    for (const pageId of addedIds) expect(thumbnailFile(shelf.id, pageId).exists).toBe(true);
    expect(existsAll(images)).toEqual([false, false]);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockEnqueueOcr).toHaveBeenCalledWith(addedIds);
  });
});
