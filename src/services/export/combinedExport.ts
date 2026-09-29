// まとめて書き出し（詳細設計書 9.14、基本設計書 SC-12・6.4、FR-E-05〜09）。
// ノートブック直下の選んだノートを、選んだ順に1つの PDF（しおり付き）か Markdown の zip にまとめる。
import type { Directory } from 'expo-file-system';
import JSZip from 'jszip';
import type { PDFPage } from 'pdf-lib';

import { EXPORT_FOLDER_NUMBER_MIN_DIGITS } from '@/config';

import { findNotebook, listAllNotebooks } from '@/db/notebookRepository';
import { findNote } from '@/db/noteRepository';
import { AppError, isAppError } from '@/domain/errors';
import type { Note, NoteId, NotebookId } from '@/domain/types';
import { shareFile } from '@/native/share';
import type { OpenShelf } from '@/state/openShelf';

import { locateNoteDirectory } from '../folders';

import { ExportCanceledError, throwIfExportCanceled } from './cancel';
import { type ExportFile, sanitizeFileName } from './fileName';
import { addNoteToZip, noteMarkdownFileName, saveZip } from './markdown';
import { addNotePages, addOutline, createExportPdf, savePdf } from './pdf';
import { deleteExportFile } from './shareExport';

export type CombinedExportFormat = 'pdf' | 'markdown';
export type CombinedExportProgress = { finishedNotes: number; totalNotes: number };
export type CombinedExportOptions = {
  signal: AbortSignal;
  onProgress: (progress: CombinedExportProgress) => void;
};

/** 書き出すノートと、そのフォルダ */
type NoteToExport = { note: Note; directory: Directory };

type BuildCombinedFile = (
  shelf: OpenShelf,
  fileTitle: string,
  notes: NoteToExport[],
  options: CombinedExportOptions,
) => Promise<ExportFile>;

const combinedBuilders: Record<CombinedExportFormat, BuildCombinedFile> = {
  pdf: buildCombinedPdf,
  markdown: buildCombinedMarkdownZip,
};

/**
 * noteIds の順に1つのファイルにまとめ、共有シートを開く。取り消されたら作りかけのファイルを消して
 * 'canceled' を返す（取り消しは失敗ではないため例外にしない）。ノートが見つからなければ exportNoteMissing、
 * それ以外の失敗は exportFailed を投げる
 */
export async function shareCombinedExport(
  shelf: OpenShelf,
  format: CombinedExportFormat,
  notebookId: NotebookId,
  noteIds: NoteId[],
  options: CombinedExportOptions,
): Promise<'shared' | 'canceled'> {
  let file: ExportFile | null = null;
  try {
    const notebook = await findNotebook(shelf.db, notebookId);
    if (!notebook) throw new AppError('exportNoteMissing');
    const notes = await findNotesToExport(shelf, noteIds);
    file = await combinedBuilders[format](shelf, notebook.name, notes, options);
    throwIfExportCanceled(options.signal);
    await shareFile(file);
    return 'shared';
  } catch (error) {
    if (error instanceof ExportCanceledError) return 'canceled';
    if (isAppError(error, 'exportNoteMissing')) throw error;
    throw new AppError('exportFailed', { cause: error });
  } finally {
    if (file) deleteExportFile(file);
  }
}

/** 始める前に、すべてのノートが DB にあり、フォルダが見つかることを確かめる */
async function findNotesToExport(shelf: OpenShelf, noteIds: NoteId[]): Promise<NoteToExport[]> {
  const notes: NoteToExport[] = [];
  for (const noteId of noteIds) {
    const note = await findNote(shelf.db, noteId);
    if (!note) throw new AppError('exportNoteMissing');
    notes.push({ note, directory: await locateNoteDirectory(shelf, note) });
  }
  return notes;
}

/** 途中で外部から消されたノートも、見つからないノートとして扱う */
function ensureNoteFolderExists({ directory }: NoteToExport): void {
  if (!directory.exists) throw new AppError('exportNoteMissing');
}

async function buildCombinedPdf(
  shelf: OpenShelf,
  fileTitle: string,
  notes: NoteToExport[],
  { signal, onProgress }: CombinedExportOptions,
): Promise<ExportFile> {
  const target = await createExportPdf();
  const outline: { title: string; page: PDFPage }[] = [];
  for (const [index, entry] of notes.entries()) {
    ensureNoteFolderExists(entry);
    const firstPage = await addNotePages(target, shelf, entry.note, entry.directory, signal);
    if (firstPage) outline.push({ title: entry.note.title, page: firstPage });
    onProgress({ finishedNotes: index + 1, totalNotes: notes.length });
  }
  addOutline(target.pdf, outline);
  return savePdf(target, fileTitle);
}

async function buildCombinedMarkdownZip(
  shelf: OpenShelf,
  fileTitle: string,
  notes: NoteToExport[],
  { signal, onProgress }: CombinedExportOptions,
): Promise<ExportFile> {
  const zip = new JSZip();
  const allNotebooks = await listAllNotebooks(shelf.db);
  const folders = notes.map(({ note }, index) => noteFolderName(note, index, notes.length));
  for (const [index, entry] of notes.entries()) {
    ensureNoteFolderExists(entry);
    await addNoteToZip(
      zip,
      shelf,
      entry.note,
      entry.directory,
      allNotebooks,
      folders[index],
      signal,
    );
    onProgress({ finishedNotes: index + 1, totalNotes: notes.length });
  }
  zip.file(
    'index.md',
    buildIndexMarkdown(
      fileTitle,
      notes.map(({ note }, index) => ({ note, folder: folders[index]! })),
    ),
  );
  return saveZip(zip, fileTitle);
}

/** 並べた順が分かるよう、先頭に番号を付ける。番号はノート数の桁数（最低2桁）でゼロ埋めする */
export function noteFolderName(note: Note, index: number, totalNotes: number): string {
  const digits = Math.max(EXPORT_FOLDER_NUMBER_MIN_DIGITS, String(totalNotes).length);
  return `${String(index + 1).padStart(digits, '0')}_${sanitizeFileName(note.title)}`;
}

/** 目次。リンク先は空白を含むため `<…>` で囲む（CommonMark） */
export function buildIndexMarkdown(
  title: string,
  entries: { note: Note; folder: string }[],
): string {
  const items = entries.map(
    ({ note, folder }, index) =>
      `${index + 1}. [${note.title}](<${folder}/${noteMarkdownFileName(note)}>)`,
  );
  return [`# ${title}`, '', ...items].join('\n') + '\n';
}
