// 開いている本棚（詳細設計書 4.4）。画面へは Context で渡す。
// 本棚を切り替えたら、ルートレイアウトが画面の木を作り直す（前の本棚のデータを持った画面を残さないため）
import type { Directory } from 'expo-file-system';
import { createContext, useContext, type ReactNode } from 'react';

import type { Db } from '@/db/db';
import type { RunExclusively } from '@/domain/serialQueue';
import type { Shelf, ShelfId } from '@/domain/types';

export type OpenShelf = {
  id: ShelfId;
  name: string;
  /** Documents/{本棚名}/（正本。ADR 0016） */
  directory: Directory;
  db: Db;
  /** 本棚フォルダを書き換える処理を1本に並べる（外部変更の走査中にアプリの変更が割り込まないように） */
  runExclusively: RunExclusively;
  closeDatabase(): Promise<void>;
};

export type ShelfContextValue = {
  shelf: OpenShelf;
  /** 別の本棚を開く。null は本棚がなくなったとき（本棚の作成画面に戻る） */
  switchShelf(target: Shelf | null): Promise<void>;
};

const ShelfContext = createContext<ShelfContextValue | null>(null);

export function ShelfProvider({ value, children }: { value: ShelfContextValue; children: ReactNode }) {
  return <ShelfContext.Provider value={value}>{children}</ShelfContext.Provider>;
}

export function useShelfContext(): ShelfContextValue {
  const value = useContext(ShelfContext);
  if (!value) throw new Error('useShelf は ShelfProvider の中で使ってください');
  return value;
}

export const useShelf = (): OpenShelf => useShelfContext().shelf;
export const useDb = (): Db => useShelf().db;
