// ページ画像が差し替わったとき（ページの編集・外部での上書き）に、派生するデータを作り直す。
// サムネイル・画像の大きさ・対応づけ用のサイズと更新日時・文字認識は、どれも画像から作られるため、
// 画像が変われば同じ理由で作り直す（ADR 0022、詳細設計書 9.12）
import { type Directory, File } from 'expo-file-system';

import { markNoteUpdated } from '@/db/noteRepository';
import { resetPageForReplacedImage } from '@/db/pageRepository';
import type { IsoDateTime, NoteId, PageEdit, ShelfId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { writeManifest, type NoteManifest, type PageManifest } from '@/storage/manifest';
import { regenerateThumbnail } from '@/storage/pageImages';

/** 差し替わったページ画像に合わせてサムネイルを作り直し、.leaves.json に書くページ情報を返す */
export async function describeReplacedPage(
  shelfId: ShelfId,
  directory: Directory,
  page: PageManifest,
  edit: PageEdit | null,
): Promise<PageManifest> {
  const pageImage = new File(directory, page.file);
  const size = await regenerateThumbnail(shelfId, page.id, pageImage);
  return {
    ...page,
    ...size,
    size: pageImage.size ?? 0,
    modifiedAt: pageImage.modificationTime ?? 0,
    ocrStatus: 'pending',
    ocrText: '',
    ocrLines: [],
    edit,
  };
}

/** 差し替えたページを .leaves.json → DB の順に反映し、ノートの更新日時を進める（画像のキャッシュのキーに使う） */
export async function saveReplacedPages(
  shelf: OpenShelf,
  target: { directory: Directory; manifest: NoteManifest; noteId: NoteId },
  replaced: PageManifest[],
  now: IsoDateTime,
): Promise<void> {
  const byId = new Map(replaced.map((page) => [page.id, page]));
  writeManifest(target.directory, {
    ...target.manifest,
    updatedAt: now,
    pages: target.manifest.pages.map((page) => byId.get(page.id) ?? page),
  });
  await shelf.db.transaction(async (tx) => {
    for (const page of replaced) await resetPageForReplacedImage(tx, page.id, page, now);
    await markNoteUpdated(tx, target.noteId, now);
  });
}
