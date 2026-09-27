// ページ画像の保存と削除（詳細設計書 9.1）。
// 新規ノート作成とページ追加の両方がこの手順を使う（「ページ画像をどう保存するか」という1つの知識）。
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  PAGE_IMAGE_JPEG_QUALITY,
  PAGE_IMAGE_MAX_EDGE_PX,
  REQUIRED_FREE_SPACE_PER_PAGE_BYTES,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_EDGE_PX,
} from '@/config';
import { AppError } from '@/domain/errors';
import type { CapturedImage, PageId } from '@/domain/types';
import { newPageId } from '@/native/randomId';

import {
  ensureStorageDirectories,
  pageIdFromFileName,
  pageImageFile,
  pageImagesDirectory,
  thumbnailFile,
  thumbnailsDirectory,
} from './paths';

export type StoredPageImage = { id: PageId; width: number; height: number };

/**
 * 取り込み画像を、ページ画像（長辺 2400px）とサムネイル（長辺 480px）として保存する。
 * 途中で失敗したら、それまでに書いたファイルを消してから例外を投げる。
 */
export async function storePageImages(images: CapturedImage[]): Promise<StoredPageImage[]> {
  assertEnoughFreeSpace(images.length);
  ensureStorageDirectories();
  const stored: StoredPageImage[] = [];
  try {
    for (const image of images) {
      stored.push(await storeOnePageImage(image));
    }
    return stored;
  } catch (error) {
    deletePageImages(stored.map((page) => page.id));
    throw error;
  }
}

async function storeOnePageImage(image: CapturedImage): Promise<StoredPageImage> {
  const id = newPageId();
  const pageImage = await saveResizedJpeg(image, PAGE_IMAGE_MAX_EDGE_PX, PAGE_IMAGE_JPEG_QUALITY);
  new File(pageImage.uri).move(pageImageFile(id));
  try {
    const thumbnail = await saveResizedJpeg(image, THUMBNAIL_MAX_EDGE_PX, THUMBNAIL_JPEG_QUALITY);
    new File(thumbnail.uri).move(thumbnailFile(id));
  } catch (error) {
    deletePageImages([id]);
    throw error;
  }
  return { id, width: pageImage.width, height: pageImage.height };
}

async function saveResizedJpeg(image: CapturedImage, maxEdge: number, quality: number) {
  const context = ImageManipulator.manipulate(image.uri);
  const resize = resizeToFitWithin(image, maxEdge);
  if (resize) context.resize(resize);
  const rendered = await context.renderAsync();
  return rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality });
}

/**
 * 長辺が maxEdge を超える場合に、縦横比を保って長辺を maxEdge にするための指定を返す。
 * 片方だけ指定すると、もう片方は縦横比から決まる。超えていなければ null（拡大しない）
 */
export function resizeToFitWithin(
  size: { width: number; height: number },
  maxEdge: number,
): { width: number } | { height: number } | null {
  if (Math.max(size.width, size.height) <= maxEdge) return null;
  return size.width >= size.height ? { width: maxEdge } : { height: maxEdge };
}

function assertEnoughFreeSpace(pageCount: number): void {
  if (Paths.availableDiskSpace < pageCount * REQUIRED_FREE_SPACE_PER_PAGE_BYTES) {
    throw new AppError('storageFull');
  }
}

/**
 * ページ画像とサムネイルを削除する。消せなかったファイルは起動時の整合性チェックが回収するため、
 * ここでは失敗しても例外にしない（削除の失敗で、利用者の操作全体を失敗させないため）
 */
export function deletePageImages(ids: PageId[]): void {
  for (const id of ids) {
    for (const file of [pageImageFile(id), thumbnailFile(id)]) {
      try {
        if (file.exists) file.delete();
      } catch (error) {
        console.warn(`画像を削除できませんでした: ${file.uri}`, error);
      }
    }
  }
}

/** 保存済みの画像（ページ画像・サムネイルのどちらか）があるページ ID。整合性チェック用 */
export function listStoredPageIds(): PageId[] {
  const ids = new Set<PageId>();
  for (const directory of [pageImagesDirectory(), thumbnailsDirectory()]) {
    if (!directory.exists) continue;
    for (const entry of directory.list()) {
      const id = pageIdFromFileName(entry.name);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** スキャナ・写真選択が作った一時画像を消す。失敗しても OS が後で消すので例外にしない */
export function discardCapturedImages(images: CapturedImage[]): void {
  for (const image of images) {
    try {
      const file = new File(image.uri);
      if (file.exists) file.delete();
    } catch (error) {
      console.warn(`一時画像を削除できませんでした: ${image.uri}`, error);
    }
  }
}
