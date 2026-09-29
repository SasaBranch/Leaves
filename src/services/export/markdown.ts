// Markdown の書き出し（基本設計書 6.4、詳細設計書 9.5）。
// ノートの Markdown とページ画像を zip にまとめる。まとめて書き出し（9.14）と部品を共用する。
import type { Directory } from 'expo-file-system';
import JSZip from 'jszip';

import { formatLocalDateTime } from '@/domain/dateTime';
import { listAllNotebooks } from '@/db/notebookRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import { buildNotebookPath } from '@/domain/notebookPath';
import type { Note, NoteId, Notebook, Page } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { pageImageFile } from '@/storage/paths';

import { getNoteWithDirectory } from '../folders';

import { throwIfExportCanceled } from './cancel';
import { type ExportFile, prepareExportFile, sanitizeFileName } from './fileName';

const ZIP_MIME_TYPE = 'application/zip';
const NOTEBOOK_PATH_SEPARATOR = ' / ';

export async function buildMarkdownZip(shelf: OpenShelf, noteId: NoteId): Promise<ExportFile> {
  const { note, directory } = await getNoteWithDirectory(shelf, noteId);
  const zip = new JSZip();
  await addNoteToZip(zip, shelf, note, directory, await listAllNotebooks(shelf.db));
  return saveZip(zip, note.title);
}

/**
 * ノートの Markdown とページ画像を zip の folder の中に入れる（folder が空なら zip の直下）。
 * ページの合間に取り消しを確かめる
 */
export async function addNoteToZip(
  zip: JSZip,
  shelf: OpenShelf,
  note: Note,
  directory: Directory,
  allNotebooks: Notebook[],
  folder = '',
  signal?: AbortSignal,
): Promise<void> {
  const pages = await listPagesOfNote(shelf.db, note.id);
  const notebookPath = buildNotebookPath(note.notebookId, allNotebooks);
  const target = folder === '' ? zip : zip.folder(folder)!;
  target.file(noteMarkdownFileName(note), buildMarkdown(note, pages, notebookPath));
  for (const [index, page] of pages.entries()) {
    throwIfExportCanceled(signal);
    target.file(imagePathInZip(index + 1), await pageImageFile(directory, page.position).bytes());
  }
}

/** ノートの Markdown のファイル名。まとめて書き出しの目次のリンクと同じ関数で決める */
export function noteMarkdownFileName(note: Note): string {
  return `${sanitizeFileName(note.title)}.md`;
}

/** fileTitle は拡張子なしの名前（ノートのタイトル・ノートブック名） */
export async function saveZip(zip: JSZip, fileTitle: string): Promise<ExportFile> {
  const file = prepareExportFile(`${sanitizeFileName(fileTitle)}.zip`);
  file.write(await zip.generateAsync({ type: 'uint8array' }));
  return { uri: file.uri, mimeType: ZIP_MIME_TYPE };
}

/** notebookPath が空（ライブラリ直下）なら、ノートブックの行を書かない */
export function buildMarkdown(note: Note, pages: Page[], notebookPath: string[]): string {
  const header = [
    `# ${note.title}`,
    '',
    `- 作成日時: ${formatLocalDateTime(new Date(note.createdAt))}`,
    ...(notebookPath.length > 0
      ? [`- ノートブック: ${notebookPath.join(NOTEBOOK_PATH_SEPARATOR)}`]
      : []),
  ].join('\n');
  const sections = pages.map((page, index) => buildPageSection(page, index + 1));
  return [header, ...sections].join('\n\n') + '\n';
}

function buildPageSection(page: Page, pageNumber: number): string {
  const heading = `ページ ${pageNumber}`;
  return [`## ${heading}`, `![${heading}](${imagePathInZip(pageNumber)})`, page.ocrText.trim()]
    .filter((paragraph) => paragraph !== '')
    .join('\n\n');
}

// Markdown のリンクと zip 内の配置が食い違わないよう、同じ関数で決める
function imagePathInZip(pageNumber: number): string {
  return `images/p${String(pageNumber).padStart(2, '0')}.jpg`;
}
