// SC-5 ノート表示用（詳細設計書 8 章）
import type { Directory } from 'expo-file-system';

import { listAllNotebooks } from '@/db/notebookRepository';
import { findNote } from '@/db/noteRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import { buildNotebookPath } from '@/domain/notebookPath';
import type { Note, NoteId, Page } from '@/domain/types';
import { useShelf } from '@/state/openShelf';
import { noteDirectory } from '@/storage/paths';

import { useDataQuery } from './useDataQuery';

/** noteDirectory はページ画像の場所の組み立て用（ページ画像の場所は ID だけでは決まらないため。詳細設計書 4.5） */
export type NoteDetail = { note: Note; pages: Page[]; notebookPath: string[]; noteDirectory: Directory };

export function useNote(noteId: NoteId) {
  const shelf = useShelf();
  return useDataQuery<NoteDetail | null>(noteId, async (db) => {
    const note = await findNote(db, noteId);
    if (!note) return null;
    const [pages, notebooks] = await Promise.all([
      listPagesOfNote(db, noteId),
      listAllNotebooks(db),
    ]);
    const notebookPath = buildNotebookPath(note.notebookId, notebooks);
    return {
      note,
      pages,
      notebookPath,
      noteDirectory: noteDirectory(shelf.directory, notebookPath, note.title),
    };
  });
}
