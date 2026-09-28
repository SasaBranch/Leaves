// アプリ用の SqlDriver（expo-sqlite）。
import type { SQLiteDatabase, SQLiteOpenOptions } from 'expo-sqlite';

import type { SqlDriver } from './db';

/**
 * DB を開くときの共通の設定（ADR 0024）。expo-sqlite は既定で、閉じる前に接続に残るすべての文を片づけるが、
 * 全文検索（FTS5）が内部で持つ文まで片づけてしまい、閉じるときに FTS5 が同じ文を二重に解放して落ちる。
 * アプリは文を持ち続けない呼び方（runAsync など）だけを使うので、この片づけは切っても残る文はない
 */
export const SQLITE_OPEN_OPTIONS: SQLiteOpenOptions = {
  finalizeUnusedStatementsBeforeClosing: false,
};

export function createExpoSqliteDriver(database: SQLiteDatabase): SqlDriver {
  return {
    run: async (sql, params) => {
      await database.runAsync(sql, params);
    },
    get: (sql, params) => database.getFirstAsync(sql, params),
    all: (sql, params) => database.getAllAsync(sql, params),
  };
}
