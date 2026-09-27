// ファイルの保存場所の唯一の置き場所（基本設計書 5.4）。
// パスはアプリ更新で変わることがあるため DB には保存せず、ここで ID から組み立てる。
import { Directory, File, Paths } from 'expo-file-system';

import type { PageId } from '@/domain/types';

const PAGE_IMAGE_EXTENSION = '.jpg';

export const pageImagesDirectory = () => new Directory(Paths.document, 'pages');
export const thumbnailsDirectory = () => new Directory(Paths.document, 'thumbs');
/** 書き出し用の一時ファイル。共有後に削除する */
export const exportDirectory = () => new Directory(Paths.cache, 'export');

export const pageImageFile = (id: PageId) =>
  new File(pageImagesDirectory(), `${id}${PAGE_IMAGE_EXTENSION}`);
export const thumbnailFile = (id: PageId) =>
  new File(thumbnailsDirectory(), `${id}${PAGE_IMAGE_EXTENSION}`);

/** 画像のファイル名からページ ID を取り出す。ページ画像でないファイルは null */
export function pageIdFromFileName(fileName: string): PageId | null {
  return fileName.endsWith(PAGE_IMAGE_EXTENSION)
    ? (fileName.slice(0, -PAGE_IMAGE_EXTENSION.length) as PageId)
    : null;
}

export function ensureStorageDirectories(): void {
  for (const directory of [pageImagesDirectory(), thumbnailsDirectory()]) {
    directory.create({ intermediates: true, idempotent: true });
  }
}
