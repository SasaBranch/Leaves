// アプリ起動時に DB を開く（詳細設計書 9.6）。ネイティブ機能のためテストでは使わない。
import { openDatabaseAsync } from 'expo-sqlite';

import { createDb, type Db } from './db';
import { createExpoSqliteDriver } from './expoSqliteDriver';
import { configureConnection, migrateDatabase } from './migrations';

const DATABASE_FILE_NAME = 'leaves.db';

export async function openAppDatabase(): Promise<Db> {
  const database = await openDatabaseAsync(DATABASE_FILE_NAME);
  const db = createDb(createExpoSqliteDriver(database));
  await configureConnection(db);
  await migrateDatabase(db);
  return db;
}
