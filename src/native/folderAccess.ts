// 別の場所の本棚のフォルダの参照（ADR 0025、詳細設計書 9.13）。
// iOS はブックマークで再起動後もアクセスを保つ（modules/folder-access）。
// Android は選んだときに expo-file-system が永続的な許可を OS に登録するので、URI をそのまま参照にする。
// アプリからはこのファイルだけがネイティブモジュールを呼ぶ（テストでは差し替える）
import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

import type { ShelfLocationKind } from '@/domain/types';

import FolderAccess from '../../modules/folder-access/src/FolderAccessModule';

// 利用者がフォルダ選択画面を閉じたときの expo-file-system のエラーコード（クラス名から作られる）。
// iOS: FilePickingCancelledException、Android: PickerCancelledException
const PICKER_CANCELLED_CODES = ['ERR_FILE_PICKING_CANCELLED', 'ERR_PICKER_CANCELLED'];

// iCloud の未ダウンロードの印（`.名前.icloud`）
const ICLOUD_PLACEHOLDER_PATTERN = /^\.(.+)\.icloud$/;

/** OS のフォルダ選択画面を出す。キャンセルは null */
export async function pickFolder(): Promise<Directory | null> {
  try {
    return await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isPickerCancelled(error)) return null;
    throw error;
  }
}

/** 設定に保存する参照を作る。iOS: ブックマーク（base64）、Android: URI */
export function createFolderReference(folder: Directory): string {
  if (Platform.OS !== 'ios') return folder.uri;
  return requireFolderAccess().createBookmark(folder.uri);
}

/**
 * 参照からフォルダを開き、アクセスを始める（本棚を閉じるまで続ける。stopAccessingFolder で止める）。
 * 開けなければ null。iOS でブックマークが古ければ、作り直したものを refreshedReference に入れる（保存し直してもらう）
 */
export function openFolderReference(
  reference: string,
): { directory: Directory; refreshedReference: string | null } | null {
  if (Platform.OS !== 'ios') {
    const directory = new Directory(reference);
    return directory.exists ? { directory, refreshedReference: null } : null;
  }
  const opened = requireFolderAccess().openBookmark(reference);
  if (!opened) return null;
  return {
    directory: new Directory(opened.uri),
    refreshedReference: opened.refreshedBookmark ?? null,
  };
}

/** openFolderReference で始めたアクセスを止める（Android は何もしない） */
export function stopAccessingFolder(directory: Directory): void {
  if (Platform.OS !== 'ios') return;
  requireFolderAccess().stopAccessing(directory.uri);
}

/** 選んだフォルダが iCloud Drive かどうか。アプリ内の本棚は呼び出し側で 'app' とする（ここでは判定しない） */
export function locationKindOf(folder: Directory): ShelfLocationKind {
  if (Platform.OS !== 'ios') return 'external';
  return requireFolderAccess().isUbiquitous(folder.uri) ? 'icloud' : 'external';
}

/**
 * iCloud から端末へのダウンロードを依頼する（Android は何もしない）。
 * 未ダウンロードの印（`.名前.icloud`）を渡されたときは、本来の項目の場所に直して依頼する
 */
export function requestICloudDownload(target: File | Directory): void {
  if (Platform.OS !== 'ios') return;
  const realName =
    target instanceof File ? ICLOUD_PLACEHOLDER_PATTERN.exec(target.name)?.[1] : undefined;
  const uri =
    target instanceof File && realName
      ? new File(target.parentDirectory, realName).uri
      : target.uri;
  const failure = requireFolderAccess().startDownloading(uri);
  // 依頼は次の反映でもう一度行うため、失敗しても止めない
  if (failure && __DEV__) console.warn(`iCloud download request failed: ${uri}: ${failure}`);
}

function isPickerCancelled(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && PICKER_CANCELLED_CODES.includes(code);
}

function requireFolderAccess() {
  if (!FolderAccess) throw new Error('FolderAccess native module is not available');
  return FolderAccess;
}
