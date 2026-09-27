// 画面から DB を使うための React Context。DB はアプリ起動時に1回だけ開く（詳細設計書 9.6）
import { createContext, useContext, type ReactNode } from 'react';

import type { Db } from '@/db/db';

const DatabaseContext = createContext<Db | null>(null);

export function DatabaseProvider({ db, children }: { db: Db; children: ReactNode }) {
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDb は DatabaseProvider の中で使ってください');
  return db;
}
