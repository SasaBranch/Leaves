// Markdown の書き出し（基本設計書 6.4、詳細設計書 9.5）。
// ノートの Markdown とページ画像を zip にまとめる。
import JSZip from 'jszip';

import { formatLocalDateTime } from '@/domain/dateTime';
import type { Db } from '@/db/db';
import { findNote } from '@/db/noteRepository';
import { listAllNotebooks } from '@/db/notebookRepository';
import { listPagesOfNote } from '@/db/pageRepository';
import { buildNotebookPath } from '@/domain/notebookPath';
import type { Note, NoteId, Page } from '@/domain/types';
import { pageImageFile } from '@/storage/paths';

import { type ExportFile, prepareExportFile, sanitizeFileName } from './fileName';

const ZIP_MIME_TYPE = 'application/zip';
const NOTEBOOK_PATH_SEPARATOR = ' / ';

export async function buildMarkdownZip(db: Db, noteId: NoteId): Promise<ExportFile> {
  const note = await findNote(db, noteId);
  if (!note) throw new Error(`書き出すノートが見つかりません: ${noteId}`);
  const pages = await listPagesOfNote(db, noteId);
  const notebookPath = buildNotebookPath(note.notebookId, await listAllNotebooks(db));
  const fileName = sanitizeFileName(note.title);

  const zip = new JSZip();
  zip.file(`${fileName}.md`, buildMarkdown(note, pages, notebookPath));
  for (const [index, page] of pages.entries()) {
    zip.file(imagePathInZip(index + 1), await pageImageFile(page.id).bytes());
  }

  const file = prepareExportFile(`${fileName}.zip`);
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
