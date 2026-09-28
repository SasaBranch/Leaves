// 書き出しの共通手順（詳細設計書 9.5）: ファイルを作る → 共有シートを開く → 一時ファイルを消す。
// 形式ごとの違いは「どのファイルを作るか」だけなので、形式を足すときは関数を1つ作り対応表に1行足す。
import { File } from 'expo-file-system';

import { AppError } from '@/domain/errors';
import type { NoteId, PageId } from '@/domain/types';
import { shareFile } from '@/native/share';
import type { OpenShelf } from '@/state/openShelf';

import type { ExportFile } from './fileName';
import { buildMarkdownZip } from './markdown';
import { copyPageImage } from './pageImage';
import { buildPdf } from './pdf';

export type ExportFormat = 'pdf' | 'markdown' | 'pageImage';

/** pageId はページ画像の書き出しで、どのページかを指定する */
export type ExportOptions = { pageId?: PageId };

type BuildExportFile = (
  shelf: OpenShelf,
  noteId: NoteId,
  options: ExportOptions,
) => Promise<ExportFile>;

const exportBuilders: Record<ExportFormat, BuildExportFile> = {
  pdf: buildPdf,
  markdown: buildMarkdownZip,
  pageImage: copyPageImage,
};

/**
 * 書き出したファイルを共有シートで開く。共有シートを閉じただけなら正常終了する。
 * ファイルの作成・共有に失敗したら exportFailed を投げる
 */
export async function shareExport(
  shelf: OpenShelf,
  format: ExportFormat,
  noteId: NoteId,
  options: ExportOptions = {},
): Promise<void> {
  let file: ExportFile | null = null;
  try {
    file = await exportBuilders[format](shelf, noteId, options);
    await shareFile(file);
  } catch (error) {
    throw new AppError('exportFailed', { cause: error });
  } finally {
    if (file) deleteExportFile(file);
  }
}

/** 消せなかったファイルは起動時の後始末が消すため、失敗しても例外にしない（共有自体は済んでいるため） */
function deleteExportFile(file: ExportFile): void {
  try {
    const exported = new File(file.uri);
    if (exported.exists) exported.delete();
  } catch (error) {
    console.warn(`書き出しファイルを削除できませんでした: ${file.uri}`, error);
  }
}
