// 保存済みの画像の表示元。画像は外部で上書きされても場所（URI）が変わらないため、
// ノートの更新日時をキャッシュのキーに含め、差し替え後に古い画像を出し続けないようにする（ADR 0022）
import type { File } from 'expo-file-system';

export function storedImageSource(file: File, version: string): { uri: string; cacheKey: string } {
  return { uri: file.uri, cacheKey: `${file.uri}#${version}` };
}
