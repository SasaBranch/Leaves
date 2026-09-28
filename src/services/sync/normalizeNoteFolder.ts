// 変わったノートのフォルダの、ページの対応づけと番号の付け直し（詳細設計書 9.9）。
// .leaves.json のページと、フォルダ内の画像を突き合わせ、ファイル名の順をページ順として 001.jpg … に付け直す。
import { Directory, File } from 'expo-file-system';

import { SUPPORTED_IMAGE_EXTENSIONS } from '@/config';
import type { IsoDateTime, ShelfId } from '@/domain/types';
import { writeManifest, type NoteManifest, type PageManifest } from '@/storage/manifest';
import { importExternalImage, renumberPageFiles } from '@/storage/pageImages';
import {
  entryName,
  isHiddenEntryName,
  originalImageFile,
  originalsDirectory,
  pageFileName,
} from '@/storage/paths';

/** 番号の付け直しの途中で終了したときの仮の名前（storage/pageImages の renumberPageFiles） */
const RENUMBERING_NAME = /^\.renumber-(\d+)$/;

type ImageInFolder = { name: string; sortKey: string; size: number; modifiedAt: number };

/** 外部で置かれた画像のうち、ページとして扱うものか（大文字・小文字は区別しない） */
export function isSupportedImageName(name: string): boolean {
  const lower = name.toLowerCase();
  return !isHiddenEntryName(name) && SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Finder と同じく、数字を数として並べる（2.jpg が 10.jpg より前） */
export const compareFileNames = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/**
 * ページを対応づけて付け直し、.leaves.json を書き直して、書き直した後の内容を返す。
 * 1. 同じファイル名かつ同じサイズ → 同じページ
 * 2. 残りのうち、サイズと更新日時が同じ → 名前を変えられた同じページ（OCR 結果を引き継ぐ。FR-X-07）
 * 3. 対応のない画像 → 新しいページ（JPEG に変換。OCR 待ち）。対応のないページ → 削除
 */
export async function normalizeNoteFolder(
  directory: Directory,
  manifest: NoteManifest,
  shelfId: ShelfId,
  now: IsoDateTime,
): Promise<NoteManifest> {
  const images = listPageImages(directory);
  const unmatched = [...manifest.pages];
  const take = (isSame: (page: PageManifest) => boolean) => {
    const index = unmatched.findIndex(isSame);
    return index === -1 ? null : unmatched.splice(index, 1)[0]!;
  };
  const matched = images.map((image) => ({
    image,
    page: take((page) => page.file === image.name && page.size === image.size),
  }));
  for (const entry of matched) {
    entry.page ??= take(
      (page) => page.size === entry.image.size && page.modifiedAt === entry.image.modifiedAt,
    );
  }
  matched.sort((a, b) => compareFileNames(a.image.sortKey, b.image.sortKey));

  const pages: PageManifest[] = [];
  for (const [index, { image, page }] of matched.entries()) {
    pages.push(
      page
        ? { ...page, file: image.name, size: image.size, modifiedAt: image.modifiedAt }
        : await importExternalImage(
            new File(directory, image.name),
            new File(directory, `.import-${index}.jpg`),
            shelfId,
            now,
          ),
    );
  }
  const finalNames = renumberPageFiles(
    directory,
    pages.map((page) => page.file),
  );
  const normalized = pages.map((page, index) => {
    const file = new File(directory, finalNames[index]!);
    return { ...page, file: file.name, modifiedAt: file.modificationTime ?? page.modifiedAt };
  });

  const isPageSetChanged = unmatched.length > 0 || matched.some((entry) => entry.page === null);
  const result: NoteManifest = {
    ...manifest,
    updatedAt: isPageSetChanged ? now : manifest.updatedAt,
    pages: normalized,
  };
  if (JSON.stringify(result) !== JSON.stringify(manifest)) writeManifest(directory, result);
  removeUnusedOriginals(directory, result.pages);
  return result;
}

/** 消えたページ・編集していないページの元の画像（.originals/）を消す（詳細設計書 9.12） */
function removeUnusedOriginals(directory: Directory, pages: PageManifest[]): void {
  const originals = originalsDirectory(directory);
  if (!originals.exists) return;
  const editedFiles = new Set(
    pages.filter((page) => page.edit).map((page) => originalImageFile(directory, page.id).name),
  );
  for (const entry of originals.list()) {
    if (!editedFiles.has(entry.name)) entry.delete();
  }
}

function listPageImages(directory: Directory): ImageInFolder[] {
  const images: ImageInFolder[] = [];
  for (const entry of directory.list()) {
    if (!(entry instanceof File)) continue;
    const name = entryName(entry);
    const renumbering = RENUMBERING_NAME.exec(name);
    if (!renumbering && !isSupportedImageName(name)) continue;
    images.push({
      name,
      // 付け直しの途中の仮の名前は、付け直した後の名前の位置に並べる
      sortKey: renumbering ? pageFileName(Number(renumbering[1])) : name,
      size: entry.size ?? 0,
      modifiedAt: entry.modificationTime ?? 0,
    });
  }
  return images;
}
