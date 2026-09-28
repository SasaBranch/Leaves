import { Directory, File } from 'expo-file-system';

import { insertNote } from '@/db/noteRepository';
import { findPage, insertPage } from '@/db/pageRepository';
import type { OcrStatus } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import {
  newNoteManifest,
  readManifest,
  writeManifest,
  type NoteManifest,
  type PageManifest,
} from '@/storage/manifest';

import { asNoteId, asPageId, buildNote, buildPage } from '../../test/builders';
import { TEST_NOW } from '../../test/migratedTestDb';
import { createTestShelf } from '../../test/testShelf';

// 認識の偽物: ページ画像の中身（'fail' を含むものは失敗させる）を結果の文字にする
const mockRecognize = jest.fn(async (uri: string) => {
  const content = new File(uri).textSync();
  if (content.includes('fail')) throw new Error('認識に失敗');
  return {
    text: `text of ${content}`,
    lines: [{ text: '固有値', frame: { left: 180, top: 240, width: 900, height: 120 } }],
  };
});
jest.mock('@/native/textRecognizer', () => ({
  recognizeText: (uri: string) => mockRecognize(uri),
}));

// キューはモジュールの状態を持つため、テストごとに読み込み直す
function loadQueue(): typeof import('./ocrQueue') {
  let queue: typeof import('./ocrQueue') | undefined;
  jest.isolateModules(() => {
    queue = jest.requireActual('./ocrQueue');
  });
  return queue!;
}

const NOTE_TITLE = '講義';

/** 本棚に「講義」ノートのフォルダ（001.jpg … と .leaves.json）と DB の行を作る */
async function createNoteWithPages(pages: { id: string; ocrStatus?: OcrStatus }[]) {
  const shelf = await createTestShelf();
  const folder = new Directory(shelf.directory, NOTE_TITLE);
  folder.create();
  await insertNote(shelf.db, buildNote({ id: 'note', title: NOTE_TITLE }));
  const manifestPages: PageManifest[] = [];
  for (const [position, page] of pages.entries()) {
    const file = new File(folder, `00${position + 1}.jpg`);
    file.write(page.id);
    await insertPage(shelf.db, buildPage({ ...page, noteId: 'note', position }));
    manifestPages.push({
      id: asPageId(page.id),
      file: file.name,
      size: file.size,
      modifiedAt: file.modificationTime ?? 0,
      width: 1800,
      height: 2400,
      ocrStatus: page.ocrStatus === 'done' || page.ocrStatus === 'failed' ? page.ocrStatus : 'pending',
      ocrText: '',
      ocrLines: [],
      createdAt: TEST_NOW,
    });
  }
  writeManifest(folder, newNoteManifest(asNoteId('note'), manifestPages, TEST_NOW));
  return shelf;
}

/** キューが空になるまで待つ（pending / processing のページがなくなるまで） */
async function waitUntilIdle(shelf: OpenShelf) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const busy = await shelf.db.get<{ count: number }>(
      "SELECT count(*) AS count FROM pages WHERE ocr_status IN ('pending', 'processing')",
    );
    if (busy?.count === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('OCR キューが終わらない');
}

const statusOf = async (shelf: OpenShelf, id: string) =>
  (await findPage(shelf.db, asPageId(id)))?.ocrStatus;
const manifestPage = (shelf: OpenShelf, id: string) =>
  (readManifest(new Directory(shelf.directory, NOTE_TITLE)) as NoteManifest).pages.find(
    (page) => page.id === id,
  );

beforeEach(() => mockRecognize.mockClear());

test('開始すると pending のページを順に認識し、結果を .leaves.json と DB に相対座標で保存する', async () => {
  const shelf = await createNoteWithPages([{ id: 'p1' }, { id: 'p2' }]);
  await loadQueue().startOcrQueue(shelf);
  await waitUntilIdle(shelf);

  const page = await findPage(shelf.db, asPageId('p1'));
  expect(page).toMatchObject({ ocrStatus: 'done', ocrText: 'text of p1' });
  expect(page?.ocrLines).toEqual([{ text: '固有値', x: 0.1, y: 0.1, width: 0.5, height: 0.05 }]);
  // DB が失われても OCR をやり直さずに済むよう、ノートのフォルダにも持つ（NFR-R-05）
  expect(manifestPage(shelf, 'p1')).toMatchObject({ ocrStatus: 'done', ocrText: 'text of p1' });
  expect(mockRecognize.mock.calls.map(([uri]) => uri.split('/').at(-1))).toEqual([
    '001.jpg',
    '002.jpg',
  ]);
});

test('開いたときに processing のまま残ったページも処理し直す（NFR-R-03）', async () => {
  const shelf = await createNoteWithPages([
    { id: 'p1', ocrStatus: 'processing' },
    { id: 'p2', ocrStatus: 'done' },
  ]);
  await loadQueue().startOcrQueue(shelf);
  await waitUntilIdle(shelf);
  expect(await statusOf(shelf, 'p1')).toBe('done');
  expect(mockRecognize).toHaveBeenCalledTimes(1);
});

test('認識に失敗したページは failed になり、次のページの処理は続く', async () => {
  const shelf = await createNoteWithPages([{ id: 'fail1' }, { id: 'p2' }]);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await loadQueue().startOcrQueue(shelf);
  await waitUntilIdle(shelf);
  expect(await statusOf(shelf, 'fail1')).toBe('failed');
  expect(manifestPage(shelf, 'fail1')?.ocrStatus).toBe('failed');
  expect(await statusOf(shelf, 'p2')).toBe('done');
  warn.mockRestore();
});

test('開始前に投入されたページは、開始時に処理される', async () => {
  const shelf = await createNoteWithPages([{ id: 'p1' }]);
  const queue = loadQueue();
  queue.enqueueOcr([asPageId('p1')]);
  expect(mockRecognize).not.toHaveBeenCalled();
  await queue.startOcrQueue(shelf);
  await waitUntilIdle(shelf);
  expect(await statusOf(shelf, 'p1')).toBe('done');
  expect(mockRecognize).toHaveBeenCalledTimes(1); // 二重に投入されても1回だけ
});

test('retryOcr: failed のページを pending に戻して再実行する', async () => {
  const shelf = await createNoteWithPages([{ id: 'p1', ocrStatus: 'failed' }]);
  const queue = loadQueue();
  await queue.startOcrQueue(shelf);
  await queue.retryOcr(shelf, asPageId('p1'));
  await waitUntilIdle(shelf);
  expect(await statusOf(shelf, 'p1')).toBe('done');
});

test('止めた後は、待っていたページを処理しない（閉じた本棚に書かない）', async () => {
  const shelf = await createNoteWithPages([{ id: 'p1', ocrStatus: 'failed' }]);
  const queue = loadQueue();
  queue.stopOcrQueue();
  queue.enqueueOcr([asPageId('p1')]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mockRecognize).not.toHaveBeenCalled();
  expect(await statusOf(shelf, 'p1')).toBe('failed');
});

test('toRelativeOcrLines: 画像サイズで割り、はみ出しは 0〜1 に収める', () => {
  const { toRelativeOcrLines } = loadQueue();
  expect(
    toRelativeOcrLines([{ text: 'a', frame: { left: -10, top: 100, width: 300, height: 50 } }], {
      width: 200,
      height: 400,
    }),
  ).toEqual([{ text: 'a', x: 0, y: 0.25, width: 1, height: 0.125 }]);
});
