import type { Notebook, NotebookId } from '@/domain/types';

import { asNotebookId, buildNote, buildPage } from '../../test/builders';
import { createMigratedTestDb, insertNotebookRow, TEST_NOW } from '../../test/migratedTestDb';
import { insertNote } from './noteRepository';
import { insertPage } from './pageRepository';
import {
  buildNotebookPath,
  buildSnippet,
  escapeLikePattern,
  searchPages,
} from './searchRepository';

const NEWER = '2026-09-29T00:00:00.000Z';

// ライブラリ ─ 大学 ─ 線形代数 : 「第3回 固有値」（2ページ、2ページ目だけ本文に固有値）
//          │                  : 「第2回 線形写像」（本文に「値」）
//          └ 仕事             : 「会議 100%達成」
async function createLibrary() {
  const db = await createMigratedTestDb();
  await insertNotebookRow(db, { id: 'univ', name: '大学' });
  await insertNotebookRow(db, { id: 'linear', parentId: 'univ', name: '線形代数' });
  await insertNotebookRow(db, { id: 'work', name: '仕事' });

  await insertNote(
    db,
    buildNote({
      id: 'eigen',
      notebookId: asNotebookId('linear'),
      title: '第3回 固有値',
      updatedAt: NEWER,
    }),
  );
  await insertPage(
    db,
    buildPage({ id: 'e0', noteId: 'eigen', position: 0, ocrText: '定義から始める' }),
  );
  await insertPage(
    db,
    buildPage({ id: 'e1', noteId: 'eigen', position: 1, ocrText: '対称行列の固有値は実数' }),
  );

  await insertNote(
    db,
    buildNote({ id: 'map', notebookId: asNotebookId('linear'), title: '第2回 線形写像' }),
  );
  await insertPage(
    db,
    buildPage({ id: 'm0', noteId: 'map', position: 0, ocrText: '像の値を求める' }),
  );

  await insertNote(
    db,
    buildNote({ id: 'meeting', notebookId: asNotebookId('work'), title: '会議' }),
  );
  await insertPage(
    db,
    buildPage({ id: 'w0', noteId: 'meeting', position: 0, ocrText: '目標100%達成' }),
  );
  return db;
}

describe('searchPages', () => {
  test('3文字以上: 本文に一致したページだけを返す（タイトルも一致するノートでも）', async () => {
    const db = await createLibrary();
    const hits = await searchPages(db, { keyword: '固有値', scopeNotebookId: null });
    expect(hits.map((hit) => hit.pageId)).toEqual(['e1']);
    expect(hits[0]).toMatchObject({
      noteTitle: '第3回 固有値',
      pagePosition: 1,
      notebookPath: ['大学', '線形代数'],
      snippet: { before: '対称行列の', match: '固有値', after: 'は実数' },
    });
  });

  test('1文字でも検索でき、更新が新しいノートから並ぶ', async () => {
    const db = await createLibrary();
    const hits = await searchPages(db, { keyword: '値', scopeNotebookId: null });
    expect(hits.map((hit) => hit.pageId)).toEqual(['e1', 'm0']);
  });

  test('タイトルだけが一致したノートは1ページ目だけを返す', async () => {
    const db = await createLibrary();
    const hits = await searchPages(db, { keyword: '第3回', scopeNotebookId: null });
    expect(hits.map((hit) => hit.pageId)).toEqual(['e0']);
    expect(hits[0]?.snippet).toEqual({ before: '', match: '', after: '定義から始める' });
  });

  test('範囲を指定すると、そのノートブックと子孫の中だけを検索する', async () => {
    const db = await createLibrary();
    const inUniv = await searchPages(db, { keyword: '値', scopeNotebookId: asNotebookId('univ') });
    expect(inUniv).toHaveLength(2);
    const inWork = await searchPages(db, { keyword: '値', scopeNotebookId: asNotebookId('work') });
    expect(inWork).toEqual([]);
  });

  test('% や _ は文字どおりに検索される', async () => {
    const db = await createLibrary();
    expect(
      (await searchPages(db, { keyword: '100%', scopeNotebookId: null })).map((h) => h.pageId),
    ).toEqual(['w0']);
    expect(await searchPages(db, { keyword: '1_0', scopeNotebookId: null })).toEqual([]);
  });

  test('空白だけのキーワードは検索しない', async () => {
    const db = await createLibrary();
    expect(await searchPages(db, { keyword: '  ', scopeNotebookId: null })).toEqual([]);
  });

  test('件数の上限を守る', async () => {
    const db = await createLibrary();
    expect(await searchPages(db, { keyword: '値', scopeNotebookId: null, limit: 1 })).toHaveLength(
      1,
    );
  });
});

test('escapeLikePattern', () => {
  expect(escapeLikePattern('100%_a\\b')).toBe('100\\%\\_a\\\\b');
});

test('buildSnippet: 長い本文は前後を省略記号で切り詰め、改行を空白にする', () => {
  const text = 'あ'.repeat(30) + '\n固有値\n' + 'い'.repeat(30);
  expect(buildSnippet(text, '固有値', 5)).toEqual({
    before: '…ああああ ', // 空白を含めて前5文字
    match: '固有値',
    after: ' いいいい…',
  });
});

test('buildSnippet: 英字は大文字・小文字を区別せずに一致させ、元の表記を返す', () => {
  expect(buildSnippet('see TODO list', 'todo')).toEqual({
    before: 'see ',
    match: 'TODO',
    after: ' list',
  });
});

test('buildNotebookPath: ライブラリから順に名前を並べる', () => {
  const notebook = (id: string, name: string, parentId: string | null): Notebook => ({
    id: id as NotebookId,
    parentId: parentId as NotebookId | null,
    name,
    color: '#2F5D45',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  const notebooks = [
    notebook('a', '大学', null),
    notebook('b', '線形代数', 'a'),
    notebook('c', '演習', 'b'),
  ];
  expect(buildNotebookPath(asNotebookId('c'), notebooks)).toEqual(['大学', '線形代数', '演習']);
  expect(buildNotebookPath(null, notebooks)).toEqual([]);
});
