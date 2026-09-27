// 移動先選択（SC-8）で表示するノートブックの木構造
import type { Notebook, NotebookId } from './types';

export type NotebookTreeNode = { notebook: Notebook; children: NotebookTreeNode[] };

/** 画面に1行ずつ並べるための形。depth はライブラリ直下を 0 とした深さ */
export type NotebookTreeRow = { notebook: Notebook; depth: number };

/** ノートブックの一覧を親子の木にする。兄弟は名前順 */
export function buildNotebookTree(notebooks: Notebook[]): NotebookTreeNode[] {
  const childrenByParentId = groupByParentId(notebooks);
  const buildChildren = (parentId: NotebookId | null): NotebookTreeNode[] =>
    [...(childrenByParentId.get(parentId) ?? [])]
      .sort(compareByName)
      .map((notebook) => ({ notebook, children: buildChildren(notebook.id) }));
  return buildChildren(null);
}

/** 親の直後に子が続く順（画面の上から下の順）に並べる */
export function flattenNotebookTree(roots: NotebookTreeNode[], depth = 0): NotebookTreeRow[] {
  return roots.flatMap((node) => [
    { notebook: node.notebook, depth },
    ...flattenNotebookTree(node.children, depth + 1),
  ]);
}

function groupByParentId(notebooks: Notebook[]): Map<NotebookId | null, Notebook[]> {
  const groups = new Map<NotebookId | null, Notebook[]>();
  for (const notebook of notebooks) {
    const siblings = groups.get(notebook.parentId) ?? [];
    siblings.push(notebook);
    groups.set(notebook.parentId, siblings);
  }
  return groups;
}

function compareByName(a: Notebook, b: Notebook): number {
  return a.name.localeCompare(b.name, 'ja');
}
