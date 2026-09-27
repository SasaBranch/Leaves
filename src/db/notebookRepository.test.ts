import type { Notebook, NotebookId } from '@/domain/types';

import { createMigratedTestDb, insertNoteRow, TEST_NOW } from '../../test/migratedTestDb';
import {
  countNotebookContents,
  deleteNotebookWithContents,
  findNotebook,
  insertNotebook,
  listAllNotebooks,
  listChildNotebooks,
  listNotebookSubtreeIds,
  updateNotebookColor,
  updateNotebookName,
  updateNotebookParent,
} from './notebookRepository';

const LATER = '2026-09-29T00:00:00.000Z';

function notebook(
  id: string,
  name: string,
  parentId: string | null = null,
  updatedAt = TEST_NOW,
): Notebook {
  return {
    id: id as NotebookId,
    parentId: parentId as NotebookId | null,
    name,
    color: '#2F5D45',
    createdAt: TEST_NOW,
    updatedAt,
  };
}

// 大学 ─┬─ 線形代数 ── 演習問題
//       └─ 英語
// 仕事
async function createTree() {
  const db = await createMigratedTestDb();
  // 更新順（大学 → 仕事）と名前順（仕事 → 大学、コードポイント順）が逆になるようにする
  await insertNotebook(db, notebook('univ', '大学', null, LATER));
  await insertNotebook(db, notebook('work', '仕事'));
  await insertNotebook(db, notebook('linear', '線形代数', 'univ'));
  await insertNotebook(db, notebook('english', '英語', 'univ'));
  await insertNotebook(db, notebook('exercise', '演習問題', 'linear'));
  return db;
}

const id = (value: string) => value as NotebookId;

test('登録したノートブックを ID で取得でき、ない ID は null', async () => {
  const db = await createTree();
  expect(await findNotebook(db, id('linear'))).toEqual(notebook('linear', '線形代数', 'univ'));
  expect(await findNotebook(db, id('missing'))).toBeNull();
});

test('listChildNotebooks: ライブラリ直下を並び順どおりに返す', async () => {
  const db = await createTree();
  const byUpdated = await listChildNotebooks(db, null, 'updatedAt');
  expect(byUpdated.map((n) => n.name)).toEqual(['大学', '仕事']);
  const byName = await listChildNotebooks(db, null, 'name');
  expect(byName.map((n) => n.name)).toEqual(['仕事', '大学']);
});

test('listChildNotebooks: 直下のノート数を数える（孫のノートは数えない）', async () => {
  const db = await createTree();
  await insertNoteRow(db, { id: 'n1', notebookId: 'linear', title: '第1回' });
  await insertNoteRow(db, { id: 'n2', notebookId: 'linear', title: '第2回' });
  await insertNoteRow(db, { id: 'n3', notebookId: 'exercise', title: '問1' });
  const children = await listChildNotebooks(db, id('univ'), 'name');
  const linear = children.find((n) => n.id === 'linear');
  const english = children.find((n) => n.id === 'english');
  expect(linear?.noteCount).toBe(2);
  expect(english?.noteCount).toBe(0);
});

test('listNotebookSubtreeIds: 自分自身と子孫すべてを返す', async () => {
  const db = await createTree();
  const ids = await listNotebookSubtreeIds(db, id('univ'));
  expect([...ids].sort()).toEqual(['english', 'exercise', 'linear', 'univ']);
  expect(await listNotebookSubtreeIds(db, id('exercise'))).toEqual(['exercise']);
});

test('countNotebookContents: 自分を除く子孫のノートブック数と、子孫全体のノート数', async () => {
  const db = await createTree();
  await insertNoteRow(db, { id: 'n1', notebookId: 'univ', title: 'ガイダンス' });
  await insertNoteRow(db, { id: 'n2', notebookId: 'exercise', title: '問1' });
  await insertNoteRow(db, { id: 'n3', notebookId: 'work', title: '会議' });
  expect(await countNotebookContents(db, id('univ'))).toEqual({ notebooks: 3, notes: 2 });
});

test('名前・色・親を更新すると updated_at も更新される', async () => {
  const db = await createTree();
  await updateNotebookName(db, id('english'), '英語I', LATER);
  await updateNotebookColor(db, id('english'), '#7A3E3E', LATER);
  await updateNotebookParent(db, id('english'), null, LATER);
  expect(await findNotebook(db, id('english'))).toMatchObject({
    name: '英語I',
    color: '#7A3E3E',
    parentId: null,
    updatedAt: LATER,
  });
});

test('deleteNotebookWithContents: 子孫もすべて消え、他のノートブックは残る', async () => {
  const db = await createTree();
  await deleteNotebookWithContents(db, id('univ'));
  expect((await listAllNotebooks(db)).map((n) => n.name)).toEqual(['仕事']);
});
