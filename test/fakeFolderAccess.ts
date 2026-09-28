// src/native/folderAccess のテスト用の偽物（jest の moduleNameMapper で差し替える）。
// 参照はフォルダの URI そのまま（Android と同じ扱い）。フォルダ選択画面は nextPickedFolder で決める
import { Directory } from 'expo-file-system';

import type { ShelfLocationKind } from '@/domain/types';

export const fakeFolderAccess = {
  /** 次の pickFolder が返すフォルダ。null はキャンセル */
  nextPickedFolder: null as Directory | null,
  /** iCloud Drive とみなすフォルダの URI の先頭 */
  iCloudPrefix: null as string | null,
  requestedDownloads: [] as string[],
  reset() {
    this.nextPickedFolder = null;
    this.iCloudPrefix = null;
    this.requestedDownloads.length = 0;
  },
};

export async function pickFolder(): Promise<Directory | null> {
  return fakeFolderAccess.nextPickedFolder;
}

export function createFolderReference(folder: Directory): string {
  return folder.uri;
}

export function openFolderReference(
  reference: string,
): { directory: Directory; refreshedReference: string | null } | null {
  const directory = new Directory(reference);
  return directory.exists ? { directory, refreshedReference: null } : null;
}

export function stopAccessingFolder(_directory: Directory): void {}

export function locationKindOf(folder: Directory): ShelfLocationKind {
  const prefix = fakeFolderAccess.iCloudPrefix;
  return prefix && folder.uri.startsWith(prefix) ? 'icloud' : 'external';
}

export function requestICloudDownload(target: { uri: string }): void {
  fakeFolderAccess.requestedDownloads.push(target.uri);
}
