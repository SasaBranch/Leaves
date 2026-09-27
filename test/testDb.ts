// テスト用の Db（better-sqlite3、メモリ上）。アプリと同じ createDb を通すので、順番待ちとトランザクションの仕組みもテストされる
import Database from 'better-sqlite3';

import { createDb, type Db, type SqlDriver } from '@/db/db';

export function createTestDb(): Db {
  const database = new Database(':memory:');
  const driver: SqlDriver = {
    run: async (sql, params) => {
      database.prepare(sql).run(...params);
    },
    get: async <T>(sql: string, params: (string | number | null)[]) =>
      (database.prepare(sql).get(...params) as T | undefined) ?? null,
    all: async <T>(sql: string, params: (string | number | null)[]) =>
      database.prepare(sql).all(...params) as T[],
  };
  return createDb(driver);
}
