// SC-1 ライブラリ用（詳細設計書 8 章）
import { RECENT_NOTES_LIMIT } from '@/config';
import { listChildNotebooks } from '@/db/notebookRepository';
import { listNoteSummaries, listRecentNoteSummaries } from '@/db/noteRepository';
import type { NoteSummary, NotebookSummary, SortOrder } from '@/domain/types';

import { useDataQuery } from './useDataQuery';

export type LibraryData = {
  recentNotes: NoteSummary[];
  notebooks: NotebookSummary[];
  notes: NoteSummary[];
};

export function useLibrary(sort: SortOrder) {
  return useDataQuery<LibraryData>(sort, async (db) => ({
    recentNotes: await listRecentNoteSummaries(db, RECENT_NOTES_LIMIT),
    notebooks: await listChildNotebooks(db, null, sort),
    notes: await listNoteSummaries(db, null, sort),
  }));
}
