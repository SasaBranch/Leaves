// 写真アプリからの画像選択（FR-S-05）。
// 選んだ写真だけをアプリに渡す OS の選択画面を使うため、写真全体へのアクセス許可は求めない
// （そのため「写真の許可がない」エラーは起きない）
import { launchImageLibraryAsync } from 'expo-image-picker';

import type { CapturedImage } from '@/domain/types';

/** キャンセルされたら null */
export async function pickImages(): Promise<CapturedImage[] | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    orderedSelection: true,
    quality: 1,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets.map(({ uri, width, height }) => ({ uri, width, height }));
}
