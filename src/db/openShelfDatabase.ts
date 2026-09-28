// 本棚の索引 DB を開く（詳細設計書 6.1、ADR 0018）。ネイティブ機能のためテストでは使わない。
import type { Directory } from 'expo-file-system';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { createDb, type Db } from './db';
import { createExpoSqliteDriver, SQLITE_OPEN_OPTIONS } from './expoSqliteDriver';
import { configureConnection, migrateDatabase } from './migrations';

const DATABASE_FILE_NAME = 'index.db';

/**
 * 開けない・壊れている場合はファイルを消して作り直す。
 * 中身は次の外部変更の反映（全体の走査）で本棚フォルダから復元される（NFR-R-05）
 */
export async function openShelfDatabase(
  internalDirectory: Directory,
): Promise<{ db: Db; close(): Promise<void> }> {
  internalDirectory.create({ intermediates: true, idempotent: true });
  const directoryPath = decodeURIComponent(internalDirectory.uri.replace(/^file:\/\//, ''));
  try {
    return await openAndMigrate(directoryPath);
  } catch (error) {
    console.warn('索引 DB を開けないため作り直します', error);
    await deleteDatabaseAsync(DATABASE_FILE_NAME, directoryPath).catch(() => undefined);
    return openAndMigrate(directoryPath);
  }
}

async function openAndMigrate(directoryPath: string) {
  const database: SQLiteDatabase = await openDatabaseAsync(
    DATABASE_FILE_NAME,
    SQLITE_OPEN_OPTIONS,
    directoryPath,
  );
  const db = createDb(createExpoSqliteDriver(database));
  await configureConnection(db);
  await migrateDatabase(db);
  return { db, close: () => database.closeAsync() };
}
