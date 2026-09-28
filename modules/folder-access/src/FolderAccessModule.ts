import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class FolderAccessModule extends NativeModule<Record<string, never>> {
  /** フォルダのブックマーク（base64）を作る */
  createBookmark(uri: string): string;
  /** ブックマークを解決してアクセスを始める。開けなければ null。古ければ作り直したものを refreshedBookmark に入れる */
  openBookmark(bookmark: string): { uri: string; refreshedBookmark?: string } | null;
  /** openBookmark で始めたアクセスを止める */
  stopAccessing(uri: string): void;
  /** iCloud Drive の中にあるか */
  isUbiquitous(uri: string): boolean;
  /** iCloud から端末へのダウンロードを依頼する。失敗しても例外にせず、理由を返す（成功は null） */
  startDownloading(uri: string): string | null;
}

// iOS 専用（Android は expo-file-system の永続的な許可で足りる。ADR 0025）。Android では null
export default requireOptionalNativeModule<FolderAccessModule>('FolderAccess');
