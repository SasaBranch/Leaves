// 本棚の保存場所の表示（基本設計書 4.3 SC-9・SC-10、FR-L-07）。
// Android は別の場所の本棚を扱わない（ADR 0026）ため、別の場所に関わる操作は iOS だけに出す
import { Platform } from 'react-native';

import type { ShelfLocationKind } from '@/domain/types';

export const canUseOtherLocations = Platform.OS === 'ios';

export const shelfLocationLabels: Record<ShelfLocationKind, string> = {
  app: 'アプリ内',
  icloud: 'iCloud Drive',
  external: 'その他の場所',
};

/** アプリ内の本棚がどこに見えるか。Android は外から見えない（ADR 0026） */
export const appShelfNote = canUseOtherLocations
  ? '本棚は「ファイル」アプリの このiPhone内 > Leaves にフォルダとして表示されます'
  : '本棚はアプリの中に保存されます';
