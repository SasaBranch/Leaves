import type { Notebook, NotebookId } from './types';

/** ライブラリから見た所属ノートブックの名前の並び。例: ['大学', '線形代数'] */
export function buildNotebookPath(notebookId: NotebookId | null, notebooks: Notebook[]): string[] {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const path: string[] = [];
  let current = notebookId ? byId.get(notebookId) : undefined;
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
