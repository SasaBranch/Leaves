// SC-2 ノートブック用（詳細設計書 8 章）
import { findNotebook, listChildNotebooks } from '@/db/notebookRepository';
import { listNoteSummaries } from '@/db/noteRepository';
import type { Notebook, NotebookId, NoteSummary, NotebookSummary, SortOrder } from '@/domain/types';

import { useDataQuery } from './useDataQuery';

export type NotebookData = {
  notebook: Notebook;
  /** 戻るボタンに表示する名前。ライブラリ直下なら null */
  parentName: string | null;
  childNotebooks: NotebookSummary[];
  notes: NoteSummary[];
  pageCount: number;
};

export function useNotebook(id: NotebookId, sort: SortOrder) {
  return useDataQuery<NotebookData | null>(`${id}:${sort}`, async (db) => {
    const notebook = await findNotebook(db, id);
    if (!notebook) return null; // 削除された直後など
    const parent = notebook.parentId ? await findNotebook(db, notebook.parentId) : null;
    const notes = await listNoteSummaries(db, id, sort);
    return {
      notebook,
      parentName: parent?.name ?? null,
      childNotebooks: await listChildNotebooks(db, id, sort),
      notes,
      pageCount: notes.reduce((sum, note) => sum + note.pageCount, 0),
    };
  });
}
