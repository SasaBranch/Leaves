// 外部で上書きされたページ画像の反映（ADR 0022）。
// 上書きではフォルダの更新日時が変わらず、外部変更の反映（syncShelf）では気づけないため、
// ノートを開いたときに、そのノートのページだけファイルのサイズ・更新日時を .leaves.json の記録と比べる。
import { type Directory, File } from 'expo-file-system';

import type { NoteId, PageId } from '@/domain/types';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import type { PageManifest } from '@/storage/manifest';
import { deleteQuietly } from '@/storage/pageImages';
import { originalImageFile } from '@/storage/paths';

import { getNoteWithDirectory, readNoteManifest } from '../folders';
import { enqueueOcr } from '../ocrQueue';
import { describeReplacedPage, saveReplacedPages } from '../replacedPageImages';

/** 上書きされたページのサムネイルを作り直し、文字認識をやり直す。上書きされたページの ID を返す */
export async function refreshReplacedPages(shelf: OpenShelf, noteId: NoteId): Promise<PageId[]> {
  const replaced = await shelf.runExclusively(async () => {
    const { directory } = await getNoteWithDirectory(shelf, noteId);
    const manifest = readNoteManifest(directory);
    const replacedPages: PageManifest[] = [];
    for (const page of manifest.pages.filter((entry) => isReplaced(directory, entry))) {
      // 上書きされた画像を新しい元の画像とみなし、以前の編集は捨てる（詳細設計書 9.12）
      replacedPages.push(await describeReplacedPage(shelf.id, directory, page, null));
      deleteQuietly(originalImageFile(directory, page.id));
    }
    if (replacedPages.length > 0) {
      await saveReplacedPages(
        shelf,
        { directory, manifest, noteId },
        replacedPages,
        new Date().toISOString(),
      );
    }
    return replacedPages.map((page) => page.id);
  });
  if (replaced.length > 0) {
    notifyDataChanged();
    enqueueOcr(replaced);
  }
  return replaced;
}

function isReplaced(directory: Directory, page: PageManifest): boolean {
  const file = new File(directory, page.file);
  return file.exists && (file.size !== page.size || file.modificationTime !== page.modifiedAt);
}
