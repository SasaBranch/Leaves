// SC-8 移動先選択用（詳細設計書 8 章）
import { listAllNotebooks, listNotebookSubtreeIds } from '@/db/notebookRepository';
import { buildNotebookTree, type NotebookTreeNode } from '@/domain/notebookTree';
import type { NotebookId } from '@/domain/types';

import { useDataQuery } from './useDataQuery';

export type NotebookTreeData = {
  roots: NotebookTreeNode[];
  /** 移動するノートブック自身と子孫。そこへ移すと木が循環するので選べない（FR-F-04） */
  unselectableIds: NotebookId[];
};

/** movingNotebookId はノートブックを移すときだけ渡す（ノートの移動では null） */
export function useNotebookTree(movingNotebookId: NotebookId | null) {
  return useDataQuery<NotebookTreeData>(movingNotebookId ?? '', async (db) => {
    const [notebooks, unselectableIds] = await Promise.all([
      listAllNotebooks(db),
      movingNotebookId ? listNotebookSubtreeIds(db, movingNotebookId) : [],
    ]);
    return { roots: buildNotebookTree(notebooks), unselectableIds };
  });
}
