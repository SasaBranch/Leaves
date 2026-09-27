import { asNoteId, asNotebookId, asPageId, buildNote, buildPage } from '../../test/builders';
import { createMigratedTestDb, insertNotebookRow } from '../../test/migratedTestDb';
import { insertNote } from './noteRepository';
import {
  deletePage,
  findPage,
  getNextPagePosition,
  insertPage,
  listAllPageIds,
  listPageIdsByOcrStatus,
  listPageIdsInNotebooks,
  listPageIdsOfNote,
  listPagesOfNote,
  resetInterruptedOcr,
  saveOcrResult,
  updateOcrStatus,
  updatePagePositions,
} from './pageRepository';

const LATER = '2026-09-29T00:00:00.000Z';

async function createNoteWithPages(pageCount: number) {
  const db = await createMigratedTestDb();
  await insertNote(db, buildNote({ id: 'note' }));
  for (let position = 0; position < pageCount; position++) {
    await insertPage(db, buildPage({ id: `p${position}`, noteId: 'note', position }));
  }
  return db;
}

async function pageOrder(db: Awaited<ReturnType<typeof createNoteWithPages>>) {
  return (await listPagesOfNote(db, asNoteId('note'))).map((page) => page.id);
}

test('登録したページを取得でき、OCR の行情報も復元される', async () => {
  const db = await createMigratedTestDb();
  await insertNote(db, buildNote({ id: 'note' }));
  const page = buildPage({
    id: 'p0',
    noteId: 'note',
    ocrLines: [{ text: '固有値', x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
  });
  await insertPage(db, page);
  expect(await findPage(db, asPageId('p0'))).toEqual(page);
});

test('getNextPagePosition: ページがなければ 0、あれば最大の次', async () => {
  const empty = await createNoteWithPages(0);
  expect(await getNextPagePosition(empty, asNoteId('note'))).toBe(0);
  const three = await createNoteWithPages(3);
  expect(await getNextPagePosition(three, asNoteId('note'))).toBe(3);
});

test('updatePagePositions: UNIQUE 制約に当たらずに並べ替えられる', async () => {
  const db = await createNoteWithPages(3);
  await updatePagePositions(db, asNoteId('note'), ['p2', 'p0', 'p1'].map(asPageId), LATER);
  expect(await pageOrder(db)).toEqual(['p2', 'p0', 'p1']);
  const positions = (await listPagesOfNote(db, asNoteId('note'))).map((page) => page.position);
  expect(positions).toEqual([0, 1, 2]);
});

test('updatePagePositions: 外側のトランザクションが失敗したら並び順は元のまま', async () => {
  const db = await createNoteWithPages(3);
  // 並べ替えがトランザクションに合流し、負の位置への退避も含めて取り消されることを確かめる
  await expect(
    db.transaction(async (tx) => {
      await updatePagePositions(tx, asNoteId('note'), ['p2', 'p1', 'p0'].map(asPageId), LATER);
      throw new Error('後続の処理で失敗');
    }),
  ).rejects.toThrow('後続の処理で失敗');
  expect(await pageOrder(db)).toEqual(['p0', 'p1', 'p2']);
});

test('OCR の状態更新・結果保存・状態での検索', async () => {
  const db = await createNoteWithPages(3);
  await updateOcrStatus(db, asPageId('p0'), 'processing', LATER);
  await saveOcrResult(
    db,
    asPageId('p1'),
    { text: '認識結果', lines: [{ text: '認識結果', x: 0, y: 0, width: 1, height: 0.1 }] },
    LATER,
  );
  expect(await listPageIdsByOcrStatus(db, 'processing')).toEqual(['p0']);
  expect(await listPageIdsByOcrStatus(db, 'pending')).toEqual(['p2']);
  expect(await findPage(db, asPageId('p1'))).toMatchObject({
    ocrStatus: 'done',
    ocrText: '認識結果',
    updatedAt: LATER,
  });
});

test('resetInterruptedOcr: processing だけを pending に戻す', async () => {
  const db = await createNoteWithPages(3);
  await updateOcrStatus(db, asPageId('p0'), 'processing', LATER);
  await updateOcrStatus(db, asPageId('p1'), 'failed', LATER);
  await resetInterruptedOcr(db, LATER);
  expect(await listPageIdsByOcrStatus(db, 'processing')).toEqual([]);
  expect((await findPage(db, asPageId('p0')))?.ocrStatus).toBe('pending');
  expect((await findPage(db, asPageId('p1')))?.ocrStatus).toBe('failed');
});

test('ページ ID の一覧（全体・ノート単位・ノートブック単位）と削除', async () => {
  const db = await createMigratedTestDb();
  await insertNotebookRow(db, { id: 'nb', name: '大学' });
  await insertNote(db, buildNote({ id: 'inside', notebookId: asNotebookId('nb') }));
  await insertNote(db, buildNote({ id: 'outside' }));
  await insertPage(db, buildPage({ id: 'i0', noteId: 'inside' }));
  await insertPage(db, buildPage({ id: 'o0', noteId: 'outside' }));

  expect([...(await listAllPageIds(db))].sort()).toEqual(['i0', 'o0']);
  expect(await listPageIdsOfNote(db, asNoteId('outside'))).toEqual(['o0']);
  expect(await listPageIdsInNotebooks(db, [asNotebookId('nb')])).toEqual(['i0']);
  expect(await listPageIdsInNotebooks(db, [])).toEqual([]);

  await deletePage(db, asPageId('o0'));
  expect(await listAllPageIds(db)).toEqual(['i0']);
});
