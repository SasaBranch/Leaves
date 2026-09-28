// 本棚の一覧・作成・名前変更・削除・開く・閉じる（基本設計書 6.8、詳細設計書 9.8）。
// 本棚＝Documents 直下の、. で始まらないフォルダ。ID はフォルダ内の .leaves.json に持つ（ADR 0017）
import { Directory } from 'expo-file-system';

import { countNotebookContentsInShelf } from '@/db/notebookRepository';
import { openShelfDatabase } from '@/db/openShelfDatabase';
import { AppError } from '@/domain/errors';
import { isSameName, validateName } from '@/domain/name';
import { createSerialQueue } from '@/domain/serialQueue';
import type { Shelf, ShelfId } from '@/domain/types';
import { newShelfId } from '@/native/randomId';
import type { OpenShelf } from '@/state/openShelf';
import { writeAppSettings } from '@/storage/appSettings';
import { newShelfManifest, readManifest, writeManifest } from '@/storage/manifest';
import {
  entryName,
  isHiddenEntryName,
  shelfDirectory,
  shelfInternalDirectory,
  shelvesInternalDirectory,
  shelvesRootDirectory,
} from '@/storage/paths';

import { stopOcrQueue } from './ocrQueue';

/**
 * 本棚の一覧（名前順）。外部で作られたフォルダには、その場で ID を振る（FR-X-09）。
 * どの本棚にも対応しない内部データ（外部で本棚が削除された）は消す
 */
export function listShelves(): Shelf[] {
  const shelves = shelvesRootDirectory()
    .list()
    .filter((entry): entry is Directory => entry instanceof Directory)
    .filter((directory) => !isHiddenEntryName(directory.name))
    .map((directory) => ({ id: ensureShelfManifest(directory), name: entryName(directory) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  removeOrphanInternalData(new Set(shelves.map((shelf) => shelf.id)));
  return shelves;
}

export function createShelf(name: string): Shelf {
  const validName = validateName(name);
  rejectDuplicateShelfName(validName);
  const id = newShelfId();
  const directory = shelfDirectory(validName);
  directory.create();
  writeManifest(directory, newShelfManifest(id, new Date().toISOString()));
  return { id, name: validName };
}

/** 開いている本棚の名前を変えた場合、呼び出し側が開き直す（OpenShelf.directory が変わるため） */
export function renameShelf(shelf: Shelf, name: string): Shelf {
  const validName = validateName(name);
  if (validName === shelf.name) return shelf;
  if (!isSameName(validName, shelf.name)) rejectDuplicateShelfName(validName);
  shelfDirectory(shelf.name).rename(validName);
  return { id: shelf.id, name: validName };
}

/** 開いている本棚なら、呼び出し側が先に closeShelf する */
export function deleteShelfWithContents(shelf: Shelf): void {
  for (const directory of [shelfDirectory(shelf.name), shelfInternalDirectory(shelf.id)]) {
    if (directory.exists) directory.delete();
  }
}

/**
 * 削除確認に出す件数（FR-V-05）。開いている本棚は DB から、それ以外は本棚フォルダを数える
 * （確認のためだけに他の本棚の DB を開かない）
 */
export async function countShelfContents(
  shelf: Shelf,
  openShelf: OpenShelf | null,
): Promise<{ notebooks: number; notes: number }> {
  if (openShelf?.id === shelf.id) return countNotebookContentsInShelf(openShelf.db);
  return countFolders(shelfDirectory(shelf.name));
}

export async function openShelf(shelf: Shelf): Promise<OpenShelf> {
  const { db, close } = await openShelfDatabase(shelfInternalDirectory(shelf.id));
  writeAppSettings({ lastOpenedShelfId: shelf.id });
  return {
    id: shelf.id,
    name: shelf.name,
    directory: shelfDirectory(shelf.name),
    db,
    runExclusively: createSerialQueue(),
    closeDatabase: close,
  };
}

/** OCR キューを止めてから DB を閉じる（閉じた DB に認識結果を書かないため） */
export async function closeShelf(shelf: OpenShelf): Promise<void> {
  stopOcrQueue();
  // 走査・保存の途中なら終わるのを待つ
  await shelf.runExclusively(async () => undefined);
  await shelf.closeDatabase();
}

function ensureShelfManifest(directory: Directory): ShelfId {
  const manifest = readManifest(directory);
  if (manifest?.kind === 'shelf') return manifest.id;
  const id = newShelfId();
  writeManifest(directory, newShelfManifest(id, new Date().toISOString()));
  return id;
}

function rejectDuplicateShelfName(name: string): void {
  const isTaken = shelvesRootDirectory()
    .list()
    .some((entry) => isSameName(entryName(entry), name));
  if (isTaken) throw new AppError('duplicateShelfName');
}

function removeOrphanInternalData(shelfIds: Set<ShelfId>): void {
  const internal = shelvesInternalDirectory();
  if (!internal.exists) return;
  for (const entry of internal.list()) {
    if (!shelfIds.has(entry.name as ShelfId)) entry.delete();
  }
}

/** 本棚フォルダを数える。kind: note の印があるフォルダがノート、それ以外のフォルダがノートブック */
function countFolders(directory: Directory): { notebooks: number; notes: number } {
  const count = { notebooks: 0, notes: 0 };
  const visit = (folder: Directory) => {
    for (const entry of folder.list()) {
      if (!(entry instanceof Directory) || isHiddenEntryName(entry.name)) continue;
      if (readManifest(entry)?.kind === 'note') {
        count.notes++;
      } else {
        count.notebooks++;
        visit(entry);
      }
    }
  };
  if (directory.exists) visit(directory);
  return count;
}
