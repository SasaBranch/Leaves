// ページ画像の変換・保存・サムネイル・番号の付け直し（詳細設計書 9.1, 9.4, 9.9）。
// 新規ノート作成・ページ追加・外部で置かれた画像の取り込みが、同じ「ページ画像をどう保存するか」の手順を使う。
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  PAGE_IMAGE_JPEG_QUALITY,
  PAGE_IMAGE_MAX_EDGE_PX,
  REQUIRED_FREE_SPACE_PER_PAGE_BYTES,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_EDGE_PX,
} from '@/config';
import { AppError } from '@/domain/errors';
import type { CapturedImage, IsoDateTime, PageId, ShelfId } from '@/domain/types';
import { newPageId } from '@/native/randomId';

import type { PageManifest } from './manifest';
import { pageFileName, thumbnailFile, thumbnailsDirectory } from './paths';

/**
 * 取り込み画像を、ノートのフォルダのページ画像（長辺 2400px、firstPosition からの番号）と
 * サムネイル（長辺 480px）として保存し、.leaves.json に書くページ情報を返す。
 * 途中で失敗したら、それまでに書いたファイルを消してから例外を投げる
 */
export async function storePageImages(
  images: CapturedImage[],
  noteDirectory: Directory,
  firstPosition: number,
  shelfId: ShelfId,
  now: IsoDateTime,
): Promise<PageManifest[]> {
  assertEnoughFreeSpace(images.length);
  const stored: PageManifest[] = [];
  try {
    for (const [index, image] of images.entries()) {
      const target = new File(noteDirectory, pageFileName(firstPosition + index));
      stored.push(await storeOnePageImage(image, target, shelfId, now));
    }
    return stored;
  } catch (error) {
    for (const page of stored) deleteQuietly(new File(noteDirectory, page.file));
    deleteThumbnails(
      shelfId,
      stored.map((page) => page.id),
    );
    throw error;
  }
}

async function storeOnePageImage(
  image: CapturedImage,
  target: File,
  shelfId: ShelfId,
  now: IsoDateTime,
): Promise<PageManifest> {
  const id = newPageId();
  const pageImage = await saveResizedJpeg(image, PAGE_IMAGE_MAX_EDGE_PX, PAGE_IMAGE_JPEG_QUALITY);
  new File(pageImage.uri).moveSync(target);
  try {
    await storeThumbnail(image, shelfId, id);
  } catch (error) {
    deleteQuietly(target);
    throw error;
  }
  return describeStoredPage(id, target, pageImage, now);
}

/**
 * 外部で置かれた画像（PNG・HEIC なども）を、写真取り込みと同じ形の JPEG にして target に保存し、
 * 元のファイルを消す（基本設計書 6.7）。サムネイルも作る
 */
export async function importExternalImage(
  source: File,
  target: File,
  shelfId: ShelfId,
  now: IsoDateTime,
): Promise<PageManifest> {
  const size = await readImageSize(source.uri);
  const page = await storeOnePageImage({ uri: source.uri, ...size }, target, shelfId, now);
  if (source.exists && source.uri !== target.uri) source.delete();
  return page;
}

/** サムネイルがなければ作る（DB を作り直したときなど。ページ画像から作る） */
export async function ensureThumbnail(shelfId: ShelfId, pageId: PageId, pageImage: File) {
  if (thumbnailFile(shelfId, pageId).exists || !pageImage.exists) return;
  await regenerateThumbnail(shelfId, pageId, pageImage);
}

/** ページ画像からサムネイルを作り直し、ページ画像の大きさを返す（外部で画像が上書きされたとき。ADR 0022） */
export async function regenerateThumbnail(
  shelfId: ShelfId,
  pageId: PageId,
  pageImage: File,
): Promise<{ width: number; height: number }> {
  const size = await readImageSize(pageImage.uri);
  await storeThumbnail({ uri: pageImage.uri, ...size }, shelfId, pageId);
  return size;
}

async function storeThumbnail(image: CapturedImage, shelfId: ShelfId, pageId: PageId) {
  thumbnailsDirectory(shelfId).create({ intermediates: true, idempotent: true });
  const thumbnail = await saveResizedJpeg(image, THUMBNAIL_MAX_EDGE_PX, THUMBNAIL_JPEG_QUALITY);
  const target = thumbnailFile(shelfId, pageId);
  if (target.exists) target.delete();
  new File(thumbnail.uri).moveSync(target);
}

/** 保存したファイルのサイズ・更新日時を .leaves.json に控える（外部で名前を変えられたときの対応づけ用） */
export function describeStoredPage(
  id: PageId,
  file: File,
  size: { width: number; height: number },
  now: IsoDateTime,
): PageManifest {
  return {
    id,
    file: file.name,
    size: file.size ?? 0,
    modifiedAt: file.modificationTime ?? 0,
    width: size.width,
    height: size.height,
    ocrStatus: 'pending',
    ocrText: '',
    ocrLines: [],
    createdAt: now,
  };
}

async function readImageSize(uri: string): Promise<{ width: number; height: number }> {
  const image = await ImageManipulator.manipulate(uri).renderAsync();
  return { width: image.width, height: image.height };
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
 * ノートのフォルダ内の画像を、並びの順に 001.jpg … へ付け直し、付け直した後の名前を返す（詳細設計書 9.4）。
 * 名前の衝突を避けるため、いったん全部を仮の名前にしてから付け直す。
 * 仮の名前は . で始まるので、途中で終了しても外部変更の反映では無視される
 */
export function renumberPageFiles(noteDirectory: Directory, orderedFileNames: string[]): string[] {
  const finalNames = orderedFileNames.map((_, position) => pageFileName(position));
  if (orderedFileNames.every((name, index) => name === finalNames[index])) return finalNames;
  const temporaryNames = orderedFileNames.map((_, index) => `.renumber-${index}`);
  orderedFileNames.forEach((name, index) => {
    new File(noteDirectory, name).rename(temporaryNames[index]!);
  });
  temporaryNames.forEach((name, index) => {
    new File(noteDirectory, name).rename(finalNames[index]!);
  });
  return finalNames;
}

/**
 * サムネイルを削除する。消せなかったものは容量を少し使うだけで、表示には影響しないため
 * 例外にしない（削除の失敗で利用者の操作全体を失敗させないため）
 */
export function deleteThumbnails(shelfId: ShelfId, pageIds: PageId[]): void {
  for (const id of pageIds) deleteQuietly(thumbnailFile(shelfId, id));
}

/** スキャナ・写真選択が作った一時画像を消す。失敗しても OS が後で消すので例外にしない */
export function discardCapturedImages(images: CapturedImage[]): void {
  for (const image of images) deleteQuietly(new File(image.uri));
}

function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    console.warn(`ファイルを削除できませんでした: ${file.uri}`, error);
  }
}
