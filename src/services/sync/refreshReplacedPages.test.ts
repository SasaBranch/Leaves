import fs from 'node:fs';
import path from 'node:path';

import { File, Paths } from 'expo-file-system';

import { findNote } from '@/db/noteRepository';
import { findPage, listPagesOfNote, saveOcrResult } from '@/db/pageRepository';
import type { NoteId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest, type NoteManifest } from '@/storage/manifest';
import { thumbnailFile } from '@/storage/paths';

import { fakeImageManipulator } from '../../../test/fakeImageManipulator';
import { nodePathOf } from '../../../test/nodeFileSystem';
import { createTestShelf } from '../../../test/testShelf';
import { createNoteFromCapture } from '../capture';

import { refreshReplacedPages } from './refreshReplacedPages';

const mockEnqueueOcr = jest.fn();
jest.mock('../ocrQueue', () => ({ enqueueOcr: (ids: unknown) => mockEnqueueOcr(ids) }));
jest.mock('@/native/randomId', () => {
  let count = 0;
  return { newNoteId: () => `note-${++count}`, newPageId: () => `page-${++count}` };
});

let shelf: OpenShelf;
let noteId: NoteId;
const notePath = (...parts: string[]) =>
  path.join(nodePathOf(shelf.directory.uri), '講義', ...parts);

beforeEach(async () => {
  shelf = await createTestShelf();
  fakeImageManipulator.reset();
  mockEnqueueOcr.mockClear();
  const images = ['one', 'two'].map((content) => {
    const file = new File(Paths.cache, `${content}.jpg`);
    file.write(content);
    return { uri: file.uri, width: 3000, height: 4000 };
  });
  noteId = await createNoteFromCapture(shelf, { images, title: '講義', notebookId: null });
  // 文字認識が済んだ状態にする
  const [first, second] = await listPagesOfNote(shelf.db, noteId);
  for (const page of [first!, second!]) {
    await saveOcrResult(shelf.db, page.id, { text: `古い ${page.id}`, lines: [] }, 'x');
  }
  mockEnqueueOcr.mockClear();
});

/** 上書きではフォルダの更新日時は変わらないが、ファイルのサイズ・更新日時は変わる */
async function overwriteExternally(fileName: string, content: string) {
  await new Promise((resolve) => setTimeout(resolve, 5));
  fs.writeFileSync(notePath(fileName), content);
}

test('上書きされたページだけ、サムネイルを作り直して文字認識をやり直す', async () => {
  const [first, second] = await listPagesOfNote(shelf.db, noteId);
  const noteBefore = await findNote(shelf.db, noteId);
  fakeImageManipulator.sizes.set(new File(shelf.directory, '講義', '002.jpg').uri, {
    width: 1000,
    height: 500,
  });
  await overwriteExternally('002.jpg', '差し替えた画像');

  expect(await refreshReplacedPages(shelf, noteId)).toEqual([second!.id]);

  expect(await findPage(shelf.db, second!.id)).toMatchObject({
    ocrStatus: 'pending',
    ocrText: '',
    width: 1000,
    height: 500,
  });
  expect((await findPage(shelf.db, first!.id))?.ocrText).toBe(`古い ${first!.id}`);
  expect(new File(thumbnailFile(shelf.id, second!.id).uri).textSync()).toBe('差し替えた画像');
  expect(mockEnqueueOcr).toHaveBeenCalledWith([second!.id]);
  // 画像のキャッシュのキーに使うため、ノートの更新日時が進む
  expect((await findNote(shelf.db, noteId))?.updatedAt).not.toBe(noteBefore?.updatedAt);
});

test('.leaves.json にも新しいサイズ・更新日時を控え、次に開いたときは何もしない', async () => {
  await overwriteExternally('001.jpg', '差し替え');
  await refreshReplacedPages(shelf, noteId);
  const folder = new File(shelf.directory, '講義', '001.jpg').parentDirectory;
  const page = (readManifest(folder) as NoteManifest).pages[0]!;
  expect(page).toMatchObject({ size: '差し替え'.length * 3, ocrStatus: 'pending', ocrText: '' });

  mockEnqueueOcr.mockClear();
  expect(await refreshReplacedPages(shelf, noteId)).toEqual([]);
  expect(mockEnqueueOcr).not.toHaveBeenCalled();
});

test('上書きがなければ何も変えない（ファイルも書かない）', async () => {
  const folder = new File(shelf.directory, '講義', '001.jpg').parentDirectory;
  const manifestBefore = fs.statSync(path.join(nodePathOf(folder.uri), '.leaves.json')).mtimeMs;
  expect(await refreshReplacedPages(shelf, noteId)).toEqual([]);
  expect(fs.statSync(path.join(nodePathOf(folder.uri), '.leaves.json')).mtimeMs).toBe(
    manifestBefore,
  );
});
