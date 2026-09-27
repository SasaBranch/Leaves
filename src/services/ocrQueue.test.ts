import type { Db } from '@/db/db';
import { findPage, insertPage } from '@/db/pageRepository';
import { insertNote } from '@/db/noteRepository';
import type { OcrStatus } from '@/domain/types';

import { asPageId, buildNote, buildPage } from '../../test/builders';
import { createMigratedTestDb } from '../../test/migratedTestDb';

jest.mock('expo-file-system', () => jest.requireActual('../../test/fakeFileSystem'));

// 認識の偽物: ページごとに結果を決められる。'fail' を含む URI は失敗させる
const mockRecognize = jest.fn(async (uri: string) => {
  if (uri.includes('fail')) throw new Error('認識に失敗');
  return {
    text: `text of ${uri.split('/').at(-1)}`,
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

async function createNoteWithPages(pages: { id: string; ocrStatus?: OcrStatus }[]) {
  const db = await createMigratedTestDb();
  await insertNote(db, buildNote({ id: 'note' }));
  for (const [position, page] of pages.entries()) {
    await insertPage(db, buildPage({ ...page, noteId: 'note', position }));
  }
  return db;
}

/** キューが空になるまで待つ（pending / processing のページがなくなるまで） */
async function waitUntilIdle(db: Db) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const busy = await db.get<{ count: number }>(
      "SELECT count(*) AS count FROM pages WHERE ocr_status IN ('pending', 'processing')",
    );
    if (busy?.count === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('OCR キューが終わらない');
}

const statusOf = async (db: Db, id: string) => (await findPage(db, asPageId(id)))?.ocrStatus;

beforeEach(() => mockRecognize.mockClear());

test('開始すると pending のページを順に認識し、結果を相対座標で保存する', async () => {
  const db = await createNoteWithPages([{ id: 'p1' }, { id: 'p2' }]);
  const queue = loadQueue();
  await queue.startOcrQueue(db);
  await waitUntilIdle(db);

  const page = await findPage(db, asPageId('p1'));
  expect(page).toMatchObject({ ocrStatus: 'done', ocrText: 'text of p1.jpg' });
  expect(page?.ocrLines).toEqual([{ text: '固有値', x: 0.1, y: 0.1, width: 0.5, height: 0.05 }]);
  expect(mockRecognize.mock.calls.map(([uri]) => uri)).toEqual([
    'doc/pages/p1.jpg',
    'doc/pages/p2.jpg',
  ]);
});

test('起動時に processing のまま残ったページも処理し直す（NFR-R-03）', async () => {
  const db = await createNoteWithPages([
    { id: 'p1', ocrStatus: 'processing' },
    { id: 'p2', ocrStatus: 'done' },
  ]);
  await loadQueue().startOcrQueue(db);
  await waitUntilIdle(db);
  expect(await statusOf(db, 'p1')).toBe('done');
  expect(mockRecognize).toHaveBeenCalledTimes(1);
});

test('認識に失敗したページは failed になり、次のページの処理は続く', async () => {
  const db = await createNoteWithPages([{ id: 'fail1' }, { id: 'p2' }]);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await loadQueue().startOcrQueue(db);
  await waitUntilIdle(db);
  expect(await statusOf(db, 'fail1')).toBe('failed');
  expect(await statusOf(db, 'p2')).toBe('done');
  warn.mockRestore();
});

test('開始前に投入されたページは、開始時に処理される', async () => {
  const db = await createNoteWithPages([{ id: 'p1', ocrStatus: 'failed' }]);
  const queue = loadQueue();
  await db.run("UPDATE pages SET ocr_status = 'pending' WHERE id = 'p1'");
  queue.enqueueOcr([asPageId('p1')]);
  expect(mockRecognize).not.toHaveBeenCalled();
  await queue.startOcrQueue(db);
  await waitUntilIdle(db);
  expect(await statusOf(db, 'p1')).toBe('done');
  expect(mockRecognize).toHaveBeenCalledTimes(1); // 二重に投入されても1回だけ
});

test('retryOcr: failed のページを pending に戻して再実行する', async () => {
  const db = await createNoteWithPages([{ id: 'p1', ocrStatus: 'failed' }]);
  const queue = loadQueue();
  await queue.startOcrQueue(db);
  await queue.retryOcr(db, asPageId('p1'));
  await waitUntilIdle(db);
  expect(await statusOf(db, 'p1')).toBe('done');
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
