// ページの編集（四隅の台形補正・回転・元に戻す）（基本設計書 6.11、詳細設計書 9.12）。
// 補正は毎回、元の画像（.originals/{pageId}.jpg）から行う。編集を重ねても画質が落ちず、元の範囲まで広げ直せる（FR-N-12）
import { type Directory, File } from 'expo-file-system';

import { PAGE_IMAGE_JPEG_QUALITY, PAGE_IMAGE_MAX_EDGE_PX } from '@/config';
import { findPage } from '@/db/pageRepository';
import { AppError } from '@/domain/errors';
import type { PageEdit, PageId } from '@/domain/types';
import { correctPageImage } from '@/native/pageImageEditor';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import type { NoteManifest, PageManifest } from '@/storage/manifest';
import { readImageSize } from '@/storage/pageImages';
import { originalImageFile, originalsDirectory } from '@/storage/paths';

import { getNoteWithDirectory, readNoteManifest } from './folders';
import { enqueueOcr } from './ocrQueue';
import { describeReplacedPage, saveReplacedPages } from './replacedPageImages';

/** 編集画面に出すもの: 元の画像（未編集ならページ画像）と、前回の編集（未編集なら null） */
export async function findPageEditSource(
  shelf: OpenShelf,
  pageId: PageId,
): Promise<{ originalImage: File; edit: PageEdit | null; width: number; height: number }> {
  const { directory, page } = await locatePage(shelf, pageId);
  const original = originalImageFile(directory, pageId);
  if (page.edit && original.exists) {
    return { originalImage: original, edit: page.edit, ...(await readImageSize(original.uri)) };
  }
  const pageImage = new File(directory, page.file);
  return { originalImage: pageImage, edit: null, width: page.width, height: page.height };
}

/** 元の画像を四隅で台形補正し、回転してページ画像を置き換える（FR-N-10〜11, 13） */
export async function editPage(shelf: OpenShelf, pageId: PageId, edit: PageEdit): Promise<void> {
  await runPageEdit(shelf, pageId, async ({ directory, page }) => {
    const pageImage = new File(directory, page.file);
    const original = originalImageFile(directory, pageId);
    if (!original.exists) {
      // 初めての編集: 取り込んだときの画像を元の画像として残す
      originalsDirectory(directory).create({ idempotent: true });
      pageImage.copySync(original);
    }
    const corrected = await correctPageImage(original.uri, edit, {
      maxEdge: PAGE_IMAGE_MAX_EDGE_PX,
      quality: PAGE_IMAGE_JPEG_QUALITY,
    });
    // 補正した画像を書き終えてから置き換える（途中で終了しても、ページ画像が欠けないように）
    replaceFile(pageImage, new File(corrected.uri));
    return { edit };
  });
}

/** 取り込んだときの画像に戻す（FR-N-12）。編集したことがなければ何もしない */
export async function revertPageEdit(shelf: OpenShelf, pageId: PageId): Promise<void> {
  await runPageEdit(shelf, pageId, async ({ directory, page }) => {
    const original = originalImageFile(directory, pageId);
    if (!original.exists) return null;
    replaceFile(new File(directory, page.file), original);
    return { edit: null };
  });
}

/**
 * 編集の共通の段落: ページ画像を置き換える（replace が新しい編集の内容を返す。null なら何もしない）→
 * 派生データを作り直して反映する → 文字認識をやり直す。失敗したら pageEditFailed
 */
async function runPageEdit(
  shelf: OpenShelf,
  pageId: PageId,
  replace: (target: {
    directory: Directory;
    page: PageManifest;
  }) => Promise<{ edit: PageEdit | null } | null>,
): Promise<void> {
  const edited = await shelf
    .runExclusively(async () => {
      const target = await locatePage(shelf, pageId);
      const outcome = await replace(target);
      if (!outcome) return false;
      const replaced = await describeReplacedPage(
        shelf.id,
        target.directory,
        target.page,
        outcome.edit,
      );
      await saveReplacedPages(shelf, target, [replaced], new Date().toISOString());
      return true;
    })
    .catch((error: unknown) => {
      throw new AppError('pageEditFailed', { cause: error });
    });
  if (!edited) return;
  notifyDataChanged();
  enqueueOcr([pageId]);
}

async function locatePage(shelf: OpenShelf, pageId: PageId) {
  const row = await findPage(shelf.db, pageId);
  if (!row) throw new Error(`ページがありません: ${pageId}`);
  const { directory } = await getNoteWithDirectory(shelf, row.noteId);
  const manifest: NoteManifest = readNoteManifest(directory);
  const page = manifest.pages.find((entry) => entry.id === pageId);
  if (!page) throw new Error(`ページが .leaves.json にありません: ${pageId}`);
  return { directory, manifest, page, noteId: row.noteId };
}

/**
 * target を source で置き換える（source は移動して消える）。書き終えたファイルを1回の移動で置くので、
 * 途中で終了しても書きかけのページ画像は残らない
 */
function replaceFile(target: File, source: File): void {
  source.moveSync(target, { overwrite: true });
}
