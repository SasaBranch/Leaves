import { TEST_NOW } from '../../test/migratedTestDb';
import { buildNotebookTree, flattenNotebookTree, type NotebookTreeRow } from './notebookTree';
import type { Notebook, NotebookId } from './types';

const notebook = (id: string, name: string, parentId: string | null): Notebook => ({
  id: id as NotebookId,
  parentId: parentId as NotebookId | null,
  name,
  color: '#2F5D45',
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
});

const namesOf = (rows: NotebookTreeRow[]) => rows.map((row) => `${row.depth}:${row.notebook.name}`);

test('buildNotebookTree: 親子の木にし、兄弟を名前順に並べる', () => {
  const tree = buildNotebookTree([
    notebook('c', '線形代数', 'a'),
    notebook('b', '仕事', null),
    notebook('a', '大学', null),
    notebook('d', '解析', 'a'),
  ]);

  expect(tree.map((node) => node.notebook.name)).toEqual(['仕事', '大学']);
  expect(tree[1]?.children.map((node) => node.notebook.name)).toEqual(['解析', '線形代数']);
  expect(tree[0]?.children).toEqual([]);
});

test('buildNotebookTree: ノートブックがなければ空', () => {
  expect(buildNotebookTree([])).toEqual([]);
});

test('flattenNotebookTree: 親の直後に子孫が続き、深さを持つ', () => {
  const tree = buildNotebookTree([
    notebook('a', '大学', null),
    notebook('b', '線形代数', 'a'),
    notebook('c', '演習', 'b'),
    notebook('d', '仕事', null),
  ]);

  expect(namesOf(flattenNotebookTree(tree))).toEqual(['0:仕事', '0:大学', '1:線形代数', '2:演習']);
});
