import { asNotebookId } from '../../test/builders';
import { TEST_NOW } from '../../test/migratedTestDb';
import { buildNotebookPath } from './notebookPath';
import type { Notebook, NotebookId } from './types';

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
