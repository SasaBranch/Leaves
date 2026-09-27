// テスト用のドメインオブジェクトを作る。必要な項目だけ上書きして使う
import type { Note, NoteId, NotebookId, Page, PageId } from '@/domain/types';

import { TEST_NOW } from './migratedTestDb';

export function buildNote(overrides: Omit<Partial<Note>, 'id'> & { id: string }): Note {
  return {
    notebookId: null,
    title: 'ノート',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
    id: overrides.id as NoteId,
  };
}

export function buildPage(
  overrides: Omit<Partial<Page>, 'id' | 'noteId'> & { id: string; noteId: string },
): Page {
  return {
    position: 0,
    width: 1800,
    height: 2400,
    ocrStatus: 'pending',
    ocrText: '',
    ocrLines: [],
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
    id: overrides.id as PageId,
    noteId: overrides.noteId as NoteId,
  };
}

export const asNotebookId = (value: string) => value as NotebookId;
export const asNoteId = (value: string) => value as NoteId;
export const asPageId = (value: string) => value as PageId;
