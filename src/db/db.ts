// DB アクセスの入口（ADR 0008 / 0011）。
// リポジトリは Db だけを使い、expo-sqlite や better-sqlite3 を直接呼ばない。
import { createSerialQueue } from '@/domain/serialQueue';

export type SqlValue = string | number | null;

/** リポジトリが使う DB 操作。4 関数以上に広げない（ADR 0008） */
export type Db = {
  run(sql: string, params?: SqlValue[]): Promise<void>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** work の中の操作は、引数の tx を使う。tx.transaction は外側のトランザクションに合流する */
  transaction(work: (tx: Db) => Promise<void>): Promise<void>;
};

/** SQLite ライブラリごとの差を吸収する最小の口。アプリ用とテスト用の2つの実装がある */
export type SqlDriver = {
  run(sql: string, params: SqlValue[]): Promise<void>;
  get<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params: SqlValue[]): Promise<T[]>;
};

/**
 * すべての操作を1本の順番待ちに並べる Db を作る。
 * 並べる理由: トランザクション中に別の書き込み（OCR 結果の保存など）が割り込むと、
 * 意図しない操作がトランザクションに混ざったり「database is locked」で失敗したりするため（ADR 0011）。
 */
export function createDb(driver: SqlDriver): Db {
  const runExclusively = createSerialQueue();

  const insideTransaction: Db = {
    run: (sql, params = []) => driver.run(sql, params),
    get: (sql, params = []) => driver.get(sql, params),
    all: (sql, params = []) => driver.all(sql, params),
    transaction: (work) => work(insideTransaction),
  };

  return {
    run: (sql, params = []) => runExclusively(() => driver.run(sql, params)),
    get: (sql, params = []) => runExclusively(() => driver.get(sql, params)),
    all: (sql, params = []) => runExclusively(() => driver.all(sql, params)),
    transaction: (work) =>
      runExclusively(async () => {
        await driver.run('BEGIN IMMEDIATE', []);
        try {
          await work(insideTransaction);
          await driver.run('COMMIT', []);
        } catch (error) {
          await driver.run('ROLLBACK', []);
          throw error;
        }
      }),
  };
}
