// アプリ用の SqlDriver（expo-sqlite）。
import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlDriver } from './db';

export function createExpoSqliteDriver(database: SQLiteDatabase): SqlDriver {
  return {
    run: async (sql, params) => {
      await database.runAsync(sql, params);
    },
    get: (sql, params) => database.getFirstAsync(sql, params),
    all: (sql, params) => database.getAllAsync(sql, params),
  };
}
