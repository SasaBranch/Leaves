import { asNoteId, asNotebookId, buildNote, buildPage } from '../../test/builders';
import { createMigratedTestDb, insertNotebookRow, TEST_NOW } from '../../test/migratedTestDb';
import {
  deleteNote,
  findNote,
  insertNote,
  listNoteSummaries,
  listRecentNoteSummaries,
  markNoteUpdated,
  updateNoteNotebook,
  updateNoteTitle,
} from './noteRepository';
import { insertPage, listPagesOfNote } from './pageRepository';

const DAY2 = '2026-09-29T00:00:00.000Z';
const DAY3 = '2026-09-30T00:00:00.000Z';

async function createNotes() {
  const db = await createMigratedTestDb();
  await insertNotebookRow(db, { id: 'linear', name: '線形代数' });
  // 更新順（b → a）と名前順（a → b）が逆になるようにする
  await insertNote(
    db,
    buildNote({ id: 'a', notebookId: asNotebookId('linear'), title: 'A 第1回' }),
  );
  await insertNote(
    db,
    buildNote({ id: 'b', notebookId: asNotebookId('linear'), title: 'B 第2回', updatedAt: DAY2 }),
  );
  await insertNote(db, buildNote({ id: 'loose', title: 'ライブラリ直下', updatedAt: DAY3 }));
  // a は3ページ（登録順をばらして、表紙が position 0 になることを確かめる）
  await insertPage(db, buildPage({ id: 'a2', noteId: 'a', position: 2 }));
  await insertPage(db, buildPage({ id: 'a0', noteId: 'a', position: 0 }));
  await insertPage(db, buildPage({ id: 'a1', noteId: 'a', position: 1 }));
  await insertPage(db, buildPage({ id: 'b0', noteId: 'b', position: 0 }));
  await insertPage(db, buildPage({ id: 'l0', noteId: 'loose', position: 0 }));
  return db;
}

test('listNoteSummaries: ページ数と1ページ目を返し、並び順を切り替えられる', async () => {
  const db = await createNotes();
  const byUpdated = await listNoteSummaries(db, asNotebookId('linear'), 'updatedAt');
  expect(byUpdated.map((n) => [n.id, n.pageCount, n.coverPageId])).toEqual([
    ['b', 1, 'b0'],
    ['a', 3, 'a0'],
  ]);
  const byName = await listNoteSummaries(db, asNotebookId('linear'), 'name');
  expect(byName.map((n) => n.id)).toEqual(['a', 'b']);
});

test('listNoteSummaries: null はライブラリ直下のノートだけを返す', async () => {
  const db = await createNotes();
  const loose = await listNoteSummaries(db, null, 'updatedAt');
  expect(loose.map((n) => n.id)).toEqual(['loose']);
});

test('listRecentNoteSummaries: ノートブックを問わず更新が新しい順に件数分', async () => {
  const db = await createNotes();
  const recent = await listRecentNoteSummaries(db, 2);
  expect(recent.map((n) => n.id)).toEqual(['loose', 'b']);
});

test('タイトル・所属の変更と更新日時の更新', async () => {
  const db = await createNotes();
  await updateNoteTitle(db, asNoteId('a'), '新しいタイトル', DAY2);
  await updateNoteNotebook(db, asNoteId('a'), null, DAY3);
  expect(await findNote(db, asNoteId('a'))).toMatchObject({
    title: '新しいタイトル',
    notebookId: null,
    updatedAt: DAY3,
  });
  await markNoteUpdated(db, asNoteId('b'), DAY3);
  expect((await findNote(db, asNoteId('b')))?.updatedAt).toBe(DAY3);
});

test('deleteNote: ノートとそのページが消える', async () => {
  const db = await createNotes();
  await deleteNote(db, asNoteId('a'));
  expect(await findNote(db, asNoteId('a'))).toBeNull();
  expect(await listPagesOfNote(db, asNoteId('a'))).toEqual([]);
  expect((await findNote(db, asNoteId('b')))?.createdAt).toBe(TEST_NOW);
});
