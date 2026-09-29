// 本棚の保存場所の表示（基本設計書 4.3 SC-9・SC-10、FR-L-07）。
// Android は別の場所の本棚を扱わない（ADR 0026）ため、別の場所に関わる操作は iOS だけに出す
import { Platform } from 'react-native';

import type { Shelf, ShelfLocationKind } from '@/domain/types';
import { shelfParentFolderName } from '@/services/shelves';

export const canUseOtherLocations = Platform.OS === 'ios';

export const shelfLocationLabels: Record<ShelfLocationKind, string> = {
  app: 'アプリ内',
  icloud: 'iCloud Drive',
  external: 'その他の場所',
};

/** アプリ内の本棚が「ファイル」アプリのどこに見えるか */
const APP_SHELF_PATH = 'このiPhone内 > Leaves';

/**
 * 設定画面の本棚の行に出す場所（例: 「このiPhone内 > Leaves」「iCloud Drive > 書類」）。
 * 別の場所の本棚は、入っているフォルダの名前まで示す
 */
export function shelfLocationPath(shelf: Shelf): string {
  if (shelf.location === 'app') return APP_SHELF_PATH;
  const parentName = shelfParentFolderName(shelf);
  const label = shelfLocationLabels[shelf.location];
  return parentName ? `${label} > ${parentName}` : label;
}

/** アプリ内の本棚がどこに見えるか。Android は外から見えない（ADR 0026） */
export const appShelfNote = canUseOtherLocations
  ? `本棚は「ファイル」アプリの ${APP_SHELF_PATH} にフォルダとして表示されます`
  : '本棚はアプリの中に保存されます';
