// 表示中のページ画像の書き出し（基本設計書 6.4）。
import type { Db } from '@/db/db';
import { listPagesOfNote } from '@/db/pageRepository';
import type { NoteId, PageId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { pageImageFile } from '@/storage/paths';

import { getNoteWithDirectory } from '../folders';

import { type ExportFile, prepareExportFile, sanitizeFileName } from './fileName';

const JPEG_MIME_TYPE = 'image/jpeg';

export async function copyPageImage(
  shelf: OpenShelf,
  noteId: NoteId,
  options: { pageId?: PageId },
): Promise<ExportFile> {
  const { pageId } = options;
  if (!pageId) throw new Error('書き出すページが指定されていません');
  const { note, directory } = await getNoteWithDirectory(shelf, noteId);
  const { page, pageNumber } = await getPageWithNumber(shelf.db, noteId, pageId);

  const file = prepareExportFile(`${sanitizeFileName(note.title)}_p${pageNumber}.jpg`);
  await pageImageFile(directory, page.position).copy(file);
  return { uri: file.uri, mimeType: JPEG_MIME_TYPE };
}

/** 1 始まりのページ番号。画面の「ページ N」と一致させるため、ノート内の並び順から求める */
async function getPageWithNumber(db: Db, noteId: NoteId, pageId: PageId) {
  const pages = await listPagesOfNote(db, noteId);
  const index = pages.findIndex((page) => page.id === pageId);
  if (index === -1) throw new Error(`書き出すページがノートにありません: ${pageId}`);
  return { page: pages[index]!, pageNumber: index + 1 };
}
