// 本棚の一覧（詳細設計書 8 章）。本棚は DB ではなく Documents 直下のフォルダなので、
// データ変更の通知は購読せず、画面を開いたときと本棚の操作の後に呼び出し側が reload する
import { useState } from 'react';

import type { Shelf } from '@/domain/types';
import { listShelves } from '@/services/shelves';

export function useShelves(): { shelves: Shelf[]; reload: () => void } {
  // 走査は同期で軽いため、初回は描画時に直接読む（effect で読むと一瞬空の一覧が出るため）
  const [shelves, setShelves] = useState<Shelf[]>(listShelves);
  const reload = () => setShelves(listShelves());
  return { shelves, reload };
}
