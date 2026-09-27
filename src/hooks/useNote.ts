// SC-5 ノート表示用（詳細設計書 8 章）
import { listAllNotebooks } from '@/db/notebookRepository';
import { findNote } from '@/db/noteRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import { buildNotebookPath } from '@/domain/notebookPath';
import type { Note, NoteId, Page } from '@/domain/types';

import { useDataQuery } from './useDataQuery';

export type NoteDetail = { note: Note; pages: Page[]; notebookPath: string[] };

export function useNote(noteId: NoteId) {
  return useDataQuery<NoteDetail | null>(noteId, async (db) => {
    const note = await findNote(db, noteId);
    if (!note) return null;
    const [pages, notebooks] = await Promise.all([
      listPagesOfNote(db, noteId),
      listAllNotebooks(db),
    ]);
    return { note, pages, notebookPath: buildNotebookPath(note.notebookId, notebooks) };
  });
}
