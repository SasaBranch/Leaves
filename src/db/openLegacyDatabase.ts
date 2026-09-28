// v1.0 の DB を読み取りのために開く（詳細設計書 9.10）。ネイティブ機能のためテストでは使わない。
import type { File } from 'expo-file-system';
import { openDatabaseAsync } from 'expo-sqlite';

import { createDb, type Db } from './db';
import { createExpoSqliteDriver } from './expoSqliteDriver';

/** マイグレーションは当てない（v1.0 のスキーマのまま読み、移行後は DB ごと消すため） */
export async function openLegacyDatabase(
  databaseFile: File,
): Promise<{ db: Db; close(): Promise<void> }> {
  const directoryPath = decodeURIComponent(
    databaseFile.parentDirectory.uri.replace(/^file:\/\//, ''),
  );
  const database = await openDatabaseAsync(databaseFile.name, undefined, directoryPath);
  return { db: createDb(createExpoSqliteDriver(database)), close: () => database.closeAsync() };
}
