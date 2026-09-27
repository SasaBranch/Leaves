// ノートブックの所属パス（例: ['大学', '線形代数']）。null はライブラリ（空の配列）
import { listAllNotebooks } from '@/db/notebookRepository';
import { buildNotebookPath } from '@/domain/notebookPath';
import type { NotebookId } from '@/domain/types';

import { useDataQuery } from './useDataQuery';

export function useNotebookPath(notebookId: NotebookId | null) {
  return useDataQuery(`path:${notebookId}`, async (db) =>
    buildNotebookPath(notebookId, await listAllNotebooks(db)),
  );
}
