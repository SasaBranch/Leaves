import fs from 'node:fs';
import path from 'node:path';

import { Directory, File, Paths } from 'expo-file-system';

import { findPage, listPagesOfNote } from '@/db/pageRepository';
import type { NoteId, PageEdit, PageId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest, type NoteManifest } from '@/storage/manifest';
import { originalImageFile, thumbnailFile } from '@/storage/paths';

import { fakeImageManipulator } from '../../test/fakeImageManipulator';
import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf } from '../../test/testShelf';
import { createNoteFromCapture } from './capture';
import { deletePage } from './notes';
import { editPage, findPageEditSource, revertPageEdit } from './pageEdits';
import { syncShelf } from './sync/syncShelf';

// 台形補正の偽物: 元の画像の中身に「補正した」印を付けたものを書く。大きさは回転で入れ替える
let mockCorrectCount = 0;
const mockCorrect = jest.fn(async (sourceUri: string, edit: PageEdit) => {
  const output = new File(Paths.cache, `corrected-${++mockCorrectCount}.jpg`);
  output.write(`corrected(${new File(sourceUri).textSync()},${edit.rotation})`);
  const rotated = edit.rotation % 180 !== 0;
  return { uri: output.uri, width: rotated ? 1200 : 900, height: rotated ? 900 : 1200 };
});
jest.mock('@/native/pageImageEditor', () => ({
  correctPageImage: (...args: [string, PageEdit]) => mockCorrect(...args),
}));
const mockEnqueueOcr = jest.fn();
jest.mock('./ocrQueue', () => ({ enqueueOcr: (ids: unknown) => mockEnqueueOcr(ids) }));
jest.mock('@/native/randomId', () => {
  let count = 0;
  return { newNoteId: () => `note-${++count}`, newPageId: () => `page-${++count}` };
});

const EDIT: PageEdit = {
  corners: [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.05 },
    { x: 0.95, y: 0.9 },
    { x: 0.05, y: 0.95 },
  ],
  rotation: 90,
};

let shelf: OpenShelf;
let noteId: NoteId;
let pageIds: PageId[];
const noteFolder = () => new Directory(shelf.directory, '講義');
const pageContent = (name: string) => new File(noteFolder(), name).textSync();
const manifestPage = (id: PageId) =>
  (readManifest(noteFolder()) as NoteManifest).pages.find((page) => page.id === id)!;

beforeEach(async () => {
  shelf = await createTestShelf();
  mockCorrect.mockClear();
  const images = ['one', 'two'].map((content) => {
    const file = new File(Paths.cache, `${content}.jpg`);
    file.write(content);
    return { uri: file.uri, width: 3000, height: 4000 };
  });
  noteId = await createNoteFromCapture(shelf, { images, title: '講義', notebookId: null });
  pageIds = (await listPagesOfNote(shelf.db, noteId)).map((page) => page.id);
  mockEnqueueOcr.mockClear();
});

test('初めての編集: 元の画像を残し、補正した画像でページを置き換え、文字認識をやり直す', async () => {
  const [first] = pageIds;
  // 大きさは補正後のファイルから読む（画像変換の偽物に、補正後の大きさを教えておく）
  fakeImageManipulator.sizes.set(new File(noteFolder(), '001.jpg').uri, {
    width: 1200,
    height: 900,
  });
  await editPage(shelf, first!, EDIT);

  expect(originalImageFile(noteFolder(), first!).textSync()).toBe('one');
  expect(pageContent('001.jpg')).toBe('corrected(one,90)');
  expect(manifestPage(first!)).toMatchObject({
    edit: EDIT,
    width: 1200,
    height: 900,
    ocrStatus: 'pending',
  });
  expect(await findPage(shelf.db, first!)).toMatchObject({
    width: 1200,
    height: 900,
    ocrStatus: 'pending',
  });
  expect(thumbnailFile(shelf.id, first!).textSync()).toBe('corrected(one,90)');
  expect(mockEnqueueOcr).toHaveBeenCalledWith([first]);
  // ほかのページは変えない
  expect(pageContent('002.jpg')).toBe('two');
});

test('編集し直すときは、補正した画像ではなく元の画像から補正する（画質が落ちない。FR-N-12）', async () => {
  const [first] = pageIds;
  await editPage(shelf, first!, EDIT);
  await editPage(shelf, first!, { ...EDIT, rotation: 180 });
  expect(pageContent('001.jpg')).toBe('corrected(one,180)');
});

test('編集画面には元の画像と前回の編集を出す。未編集ならページ画像と null', async () => {
  const [first, second] = pageIds;
  await editPage(shelf, first!, EDIT);
  const edited = await findPageEditSource(shelf, first!);
  expect(edited.originalImage.uri).toBe(originalImageFile(noteFolder(), first!).uri);
  expect(edited.edit).toEqual(EDIT);
  const unedited = await findPageEditSource(shelf, second!);
  expect(unedited.originalImage.textSync()).toBe('two');
  expect(unedited.edit).toBeNull();
});

test('元に戻す: 取り込んだときの画像に戻し、元の画像と編集の記録を消す', async () => {
  const [first] = pageIds;
  await editPage(shelf, first!, EDIT);
  mockEnqueueOcr.mockClear();
  await revertPageEdit(shelf, first!);

  expect(pageContent('001.jpg')).toBe('one');
  expect(originalImageFile(noteFolder(), first!).exists).toBe(false);
  expect(manifestPage(first!).edit).toBeNull();
  expect(mockEnqueueOcr).toHaveBeenCalledWith([first]);
});

test('編集したことがないページを元に戻しても何もしない', async () => {
  await revertPageEdit(shelf, pageIds[0]!);
  expect(pageContent('001.jpg')).toBe('one');
  expect(mockEnqueueOcr).not.toHaveBeenCalled();
});

test('補正に失敗したら pageEditFailed。ページは変えない', async () => {
  mockCorrect.mockRejectedValueOnce(new Error('補正できない'));
  await expect(editPage(shelf, pageIds[0]!, EDIT)).rejects.toMatchObject({
    kind: 'pageEditFailed',
  });
  expect(pageContent('001.jpg')).toBe('one');
  expect(manifestPage(pageIds[0]!).edit).toBeUndefined();
});

test('ページを削除したら、元の画像も消す', async () => {
  const [first] = pageIds;
  await editPage(shelf, first!, EDIT);
  await deletePage(shelf, first!);
  expect(originalImageFile(noteFolder(), first!).exists).toBe(false);
});

test('外部でページの画像が消されたら、外部変更の反映で元の画像も消す', async () => {
  const [first] = pageIds;
  await editPage(shelf, first!, EDIT);
  await syncShelf(shelf);
  await new Promise((resolve) => setTimeout(resolve, 5));
  fs.rmSync(path.join(nodePathOf(noteFolder().uri), '001.jpg'));
  await syncShelf(shelf);
  expect(originalImageFile(noteFolder(), first!).exists).toBe(false);
});

test('Finder でノートを複製したら、元の画像のファイル名も新しいページ ID に付け直す', async () => {
  const [first] = pageIds;
  await editPage(shelf, first!, EDIT);
  await syncShelf(shelf);
  await new Promise((resolve) => setTimeout(resolve, 5));
  fs.cpSync(
    nodePathOf(noteFolder().uri),
    path.join(nodePathOf(shelf.directory.uri), '講義 のコピー'),
    {
      recursive: true,
    },
  );
  await syncShelf(shelf);

  const copy = new Directory(shelf.directory, '講義 のコピー');
  const copiedPage = (readManifest(copy) as NoteManifest).pages[0]!;
  expect(copiedPage.id).not.toBe(first);
  expect(copiedPage.edit).toEqual(EDIT);
  expect(originalImageFile(copy, copiedPage.id).textSync()).toBe('one');
  expect(originalImageFile(copy, first!).exists).toBe(false);
});
