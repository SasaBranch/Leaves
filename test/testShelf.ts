// テスト用の開いている本棚。DB は better-sqlite3（メモリ上）、本棚フォルダは node の fs 上の一時フォルダ（ADR 0019）
import { Directory, Paths } from 'expo-file-system';

import { createSerialQueue } from '@/domain/serialQueue';
import type { ShelfId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { newShelfManifest, writeManifest } from '@/storage/manifest';

import { createMigratedTestDb, TEST_NOW } from './migratedTestDb';
import { resetNodeFileSystem } from './nodeFileSystem';

export const TEST_SHELF_NAME = 'テスト本棚';

export async function createTestShelf(): Promise<OpenShelf> {
  resetNodeFileSystem();
  const id = 'shelf-1' as ShelfId;
  const directory = new Directory(Paths.document, TEST_SHELF_NAME);
  directory.create();
  writeManifest(directory, newShelfManifest(id, TEST_NOW));
  return {
    id,
    name: TEST_SHELF_NAME,
    directory,
    db: await createMigratedTestDb(),
    runExclusively: createSerialQueue(),
    closeDatabase: async () => undefined,
  };
}
