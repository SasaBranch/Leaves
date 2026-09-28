// 走査結果と索引 DB の差分（詳細設計書 9.9）。ファイルにも DB にも触らない純粋関数。
import type { IndexedNote, IndexedNotebook, IndexSnapshot } from '@/db/indexRepository';
import type { IsoDateTime, NoteId, NotebookId, Page, PageId } from '@/domain/types';

import type { ScanResult, ScannedNote } from './scanShelf';

export type IndexChanges = {
  /** 親が子より先に並ぶ */
  upsertedNotebooks: IndexedNotebook[];
  upsertedNotes: IndexedNote[];
  /** 中身が変わったノートの、新しいページの並び */
  replacedPages: { note: ScannedNote; pages: Page[] }[];
  deletedNotebookIds: NotebookId[];
  deletedNoteIds: NoteId[];
  /** サムネイルを消すページ */
  removedPageIds: PageId[];
  /** OCR 待ちに入れるページ */
  pendingPageIds: PageId[];
};

export function diffIndex(index: IndexSnapshot, scan: ScanResult, now: IsoDateTime): IndexChanges {
  const scannedNotebookIds = new Set<string>(scan.notebooks.map((notebook) => notebook.id));
  const scannedNoteIds = new Set<string>(scan.notes.map((note) => note.id));
  const deletedNoteIds = index.notes
    .map((note) => note.id)
    .filter((id) => !scannedNoteIds.has(id));
  const replacedPages = scan.notes
    .filter((note) => note.pages !== null)
    .map((note) => ({ note, pages: toPages(note, index, now) }));
  const keptPageIds = new Set<string>(
    replacedPages.flatMap(({ pages }) => pages.map((page) => page.id)),
  );
  const replacedNoteIds = new Set<string>(replacedPages.map(({ note }) => note.id));
  const deletedNoteIdSet = new Set<string>(deletedNoteIds);

  return {
    upsertedNotebooks: scan.notebooks.filter((notebook) =>
      isChanged(index.notebooks.find((indexed) => indexed.id === notebook.id), notebook),
    ),
    upsertedNotes: scan.notes
      .map(({ directory: _directory, pages: _pages, ...note }) => note)
      .filter((note) => isChanged(index.notes.find((indexed) => indexed.id === note.id), note)),
    replacedPages,
    deletedNotebookIds: index.notebooks
      .map((notebook) => notebook.id)
      .filter((id) => !scannedNotebookIds.has(id)),
    deletedNoteIds,
    removedPageIds: index.pages
      .filter(
        (page) =>
          deletedNoteIdSet.has(page.noteId) ||
          (replacedNoteIds.has(page.noteId) && !keptPageIds.has(page.id)),
      )
      .map((page) => page.id),
    pendingPageIds: replacedPages.flatMap(({ pages }) =>
      pages.filter((page) => page.ocrStatus === 'pending').map((page) => page.id),
    ),
  };
}

export function hasChanges(changes: IndexChanges): boolean {
  return (
    changes.upsertedNotebooks.length > 0 ||
    changes.upsertedNotes.length > 0 ||
    changes.replacedPages.length > 0 ||
    changes.deletedNotebookIds.length > 0 ||
    changes.deletedNoteIds.length > 0
  );
}

/**
 * .leaves.json のページを DB の行にする。DB で認識中（processing）のページは、
 * ファイルが pending でも processing のままにする（認識中の結果を上書きしないため）
 */
function toPages(note: ScannedNote, index: IndexSnapshot, now: IsoDateTime): Page[] {
  return (note.pages ?? []).map((page, position) => {
    const indexed = index.pages.find((candidate) => candidate.id === page.id);
    const isRecognizing = indexed?.ocrStatus === 'processing' && page.ocrStatus === 'pending';
    return {
      id: page.id,
      noteId: note.id,
      position,
      width: page.width,
      height: page.height,
      ocrStatus: isRecognizing ? 'processing' : page.ocrStatus,
      ocrText: page.ocrText,
      ocrLines: page.ocrLines,
      createdAt: page.createdAt,
      updatedAt: now,
    };
  });
}

function isChanged<T extends object>(indexed: T | undefined, scanned: T): boolean {
  if (!indexed) return true;
  return (Object.keys(scanned) as (keyof T)[]).some((key) => indexed[key] !== scanned[key]);
}
