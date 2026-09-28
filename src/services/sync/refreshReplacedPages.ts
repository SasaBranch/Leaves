// 外部で上書きされたページ画像の反映（ADR 0022）。
// 上書きではフォルダの更新日時が変わらず、外部変更の反映（syncShelf）では気づけないため、
// ノートを開いたときに、そのノートのページだけファイルのサイズ・更新日時を .leaves.json の記録と比べる。
import { File } from 'expo-file-system';

import { markNoteUpdated } from '@/db/noteRepository';
import { resetPageForReplacedImage } from '@/db/pageRepository';
import type { NoteId, PageId } from '@/domain/types';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import { writeManifest, type PageManifest } from '@/storage/manifest';
import { deleteQuietly, regenerateThumbnail } from '@/storage/pageImages';
import { originalImageFile } from '@/storage/paths';

import { getNoteWithDirectory, readNoteManifest } from '../folders';
import { enqueueOcr } from '../ocrQueue';

/** 上書きされたページのサムネイルを作り直し、文字認識をやり直す。上書きされたページの ID を返す */
export async function refreshReplacedPages(shelf: OpenShelf, noteId: NoteId): Promise<PageId[]> {
  const replaced = await shelf.runExclusively(async () => {
    const { directory } = await getNoteWithDirectory(shelf, noteId);
    const manifest = readNoteManifest(directory);
    const now = new Date().toISOString();
    const refreshed: PageManifest[] = [];
    const replacedIds: PageId[] = [];
    for (const page of manifest.pages) {
      const file = new File(directory, page.file);
      if (!file.exists || !isReplaced(page, file)) {
        refreshed.push(page);
        continue;
      }
      const size = await regenerateThumbnail(shelf.id, page.id, file);
      refreshed.push({
        ...page,
        ...size,
        size: file.size ?? 0,
        modifiedAt: file.modificationTime ?? 0,
        ocrStatus: 'pending',
        ocrText: '',
        ocrLines: [],
        // 上書きされた画像を新しい元の画像とみなし、以前の編集は捨てる（詳細設計書 9.12）
        edit: null,
      });
      deleteQuietly(originalImageFile(directory, page.id));
      replacedIds.push(page.id);
    }
    if (replacedIds.length === 0) return replacedIds;
    writeManifest(directory, { ...manifest, updatedAt: now, pages: refreshed });
    await shelf.db.transaction(async (tx) => {
      for (const page of refreshed.filter((entry) => replacedIds.includes(entry.id))) {
        await resetPageForReplacedImage(tx, page.id, page, now);
      }
      await markNoteUpdated(tx, noteId, now);
    });
    return replacedIds;
  });
  if (replaced.length > 0) {
    notifyDataChanged();
    enqueueOcr(replaced);
  }
  return replaced;
}

function isReplaced(page: PageManifest, file: File): boolean {
  return file.size !== page.size || file.modificationTime !== page.modifiedAt;
}
