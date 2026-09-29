// 本棚の一覧・作成・開く・名前変更・場所の移動・一覧から外す・削除（基本設計書 6.8・6.12、詳細設計書 9.8・9.13）。
// アプリ内の本棚＝Documents 直下の、. で始まらないフォルダ。別の場所の本棚＝設定の一覧にある参照（ADR 0025）。
// ID はどちらも本棚フォルダ内の .leaves.json に持つ（ADR 0017）
import { Directory, File } from 'expo-file-system';

import { countNotebookContentsInShelf } from '@/db/notebookRepository';
import { openShelfDatabase } from '@/db/openShelfDatabase';
import { AppError } from '@/domain/errors';
import { isSameName, validateName } from '@/domain/name';
import { createSerialQueue } from '@/domain/serialQueue';
import type { Shelf, ShelfId } from '@/domain/types';
import {
  createFolderReference,
  locationKindOf,
  openFolderReference,
  stopAccessingFolder,
} from '@/native/folderAccess';
import { newShelfId } from '@/native/randomId';
import type { OpenShelf } from '@/state/openShelf';
import { readAppSettings, updateAppSettings, type ExternalShelfEntry } from '@/storage/appSettings';
import { isNoteManifest, newShelfManifest, readManifest, writeManifest } from '@/storage/manifest';
import {
  entryName,
  isHiddenEntryName,
  shelfDirectory,
  shelfInternalDirectory,
  shelvesInternalDirectory,
  shelvesRootDirectory,
} from '@/storage/paths';

import { hasEntryNamed } from './folders';
import { stopOcrQueue } from './ocrQueue';

/**
 * 本棚の一覧（名前順）: アプリ内の本棚と、別の場所の本棚。
 * 外部で作られたアプリ内のフォルダには、その場で ID を振る（FR-X-09）。
 * どの本棚にも対応しない内部データ（外部で本棚が削除された）は消す
 */
export function listShelves(): Shelf[] {
  const shelves = sortByName([...scanAppShelves(), ...resolveExternalShelves()]);
  removeOrphanInternalData(new Set(shelves.map((shelf) => shelf.id)));
  return shelves;
}

/** 本棚フォルダ。別の場所の本棚にアクセスできなければ null（FR-L-04） */
export function locateShelfDirectory(shelf: Shelf): Directory | null {
  if (shelf.location === 'app') return shelfDirectory(shelf.name);
  const entry = findExternalEntry(shelf.id);
  return entry ? (openExternalEntry(entry)?.directory ?? null) : null;
}

/** iCloud Drive の一番上のフォルダの名前（端末上の実際の名前） */
const ICLOUD_DRIVE_ROOT_FOLDER_NAME = 'com~apple~CloudDocs';

/**
 * 別の場所の本棚が入っているフォルダの名前（設定画面で場所を示すため。FR-L-07）。
 * アプリ内の本棚・アクセスできない本棚・iCloud Drive の一番上に置いた本棚は null
 */
export function shelfParentFolderName(shelf: Shelf): string | null {
  if (shelf.location === 'app' || !shelf.available) return null;
  const directory = locateShelfDirectory(shelf);
  if (!directory) return null;
  // 場所を開くとアクセスが始まるため、名前を読んだら止める（開いている本棚のアクセスは別に数えられている）
  const parentName = entryName(directory.parentDirectory);
  stopAccessingFolder(directory);
  return parentName === ICLOUD_DRIVE_ROOT_FOLDER_NAME ? null : parentName;
}

export type OpenShelfLocation =
  | { kind: 'unchanged' }
  | { kind: 'renamed'; shelf: Shelf }
  | { kind: 'deleted'; next: Shelf | null };

/**
 * 開いている本棚のフォルダが、外部（「ファイル」アプリ・Finder）で名前を変えられたり消されたりしていないか。
 * 場所が変わっていれば同じ ID の本棚を、消えていれば次に開く本棚（なければ null）を返す（FR-X-04）。
 * 開いている本棚の内部データ（索引 DB）はまだ使っているため、ここでは消さない
 */
export function locateOpenShelf(shelf: OpenShelf): OpenShelfLocation {
  const manifest = shelf.directory.exists ? readManifest(shelf.directory) : null;
  if (manifest?.kind === 'shelf' && manifest.id === shelf.id) return { kind: 'unchanged' };
  const shelves = sortByName([...scanAppShelves(), ...resolveExternalShelves()]);
  const moved = shelves.find((candidate) => candidate.id === shelf.id && candidate.available);
  if (moved) return { kind: 'renamed', shelf: moved };
  return { kind: 'deleted', next: shelves.find((candidate) => candidate.available) ?? null };
}

/** parent が null ならアプリ内に、フォルダなら（別の場所）その中に本棚のフォルダを作る（FR-V-01・FR-L-01） */
export function createShelf(name: string, parent: Directory | null = null): Shelf {
  const validName = validateName(name);
  rejectDuplicateShelfName(validName, parent ?? shelvesRootDirectory());
  const id = newShelfId();
  const directory = parent ? new Directory(parent, validName) : shelfDirectory(validName);
  directory.create();
  writeManifest(directory, newShelfManifest(id, new Date().toISOString()));
  if (!parent) return { id, name: validName, location: 'app', available: true };
  registerExternalShelf(id, directory);
  return { id, name: validName, location: locationKindOf(directory), available: true };
}

/**
 * 既存のフォルダを本棚として開く（FR-L-02）。Leaves の本棚でなければ新しい ID を振る。
 * すでに一覧にある本棚なら、その本棚を返す。別の本棚と同じ ID（Finder での複製）なら ID を振り直す
 */
export function openFolderAsShelf(folder: Directory): Shelf {
  if (isInsideAppShelves(folder)) {
    const appShelf = scanAppShelves().find((shelf) => shelf.name === entryName(folder));
    if (appShelf) return appShelf;
  }
  const manifest = readManifest(folder);
  const existingId = manifest?.kind === 'shelf' ? manifest.id : null;
  const known = existingId ? findShelfById(existingId) : undefined;
  const knownDirectory = known ? locateShelfDirectory(known) : null;
  // 同じ ID の別の本棚が今もアクセスできる（Finder での複製）なら、別の本棚として新しい ID を振る。
  // 同じフォルダ、またはアクセスできなくなった本棚を選び直した場合は、同じ本棚として参照を新しくする（FR-L-04）
  const isCopyOfAnotherShelf = knownDirectory !== null && !isSameFolder(knownDirectory, folder);
  const id = existingId && !isCopyOfAnotherShelf ? existingId : newShelfId();
  if (id !== existingId) writeManifest(folder, newShelfManifest(id, new Date().toISOString()));
  registerExternalShelf(id, folder);
  return { id, name: entryName(folder), location: locationKindOf(folder), available: true };
}

/** 開いている本棚の名前を変えた場合、呼び出し側が開き直す（OpenShelf.directory が変わるため） */
export function renameShelf(shelf: Shelf, name: string): Shelf {
  const validName = validateName(name);
  if (validName === shelf.name) return shelf;
  const directory = requireShelfDirectory(shelf);
  if (!isSameName(validName, shelf.name)) {
    rejectDuplicateShelfName(validName, directory.parentDirectory);
  }
  directory.rename(validName);
  if (shelf.location !== 'app') {
    registerExternalShelf(shelf.id, new Directory(directory.parentDirectory, validName));
  }
  return { ...shelf, name: validName };
}

/**
 * 本棚を destinationParent の中へ移す（FR-L-03）。別のボリュームへは名前の付け替えで移せないため、
 * コピーして件数を確かめてから元を消す。途中で失敗したらコピーを消して元のまま残す。
 * 開いている本棚なら、呼び出し側が先に closeShelf し、終わったら開き直す
 */
export async function moveShelf(shelf: Shelf, destinationParent: Directory): Promise<Shelf> {
  const source = requireShelfDirectory(shelf);
  const target = new Directory(destinationParent, shelf.name);
  if (hasEntryNamed(destinationParent, shelf.name)) throw new AppError('duplicateShelfName');
  try {
    await source.copy(target);
    if (countFiles(target) !== countFiles(source)) {
      throw new Error('コピーしたファイルの数が元と合いません');
    }
  } catch (error) {
    if (target.exists) target.delete();
    throw new AppError('shelfMoveFailed', { cause: error });
  }
  source.delete();
  if (isInsideAppShelves(target)) {
    unregisterExternalShelf(shelf.id);
    return { ...shelf, location: 'app', available: true };
  }
  registerExternalShelf(shelf.id, target);
  return { ...shelf, location: locationKindOf(target), available: true };
}

/** 別の場所の本棚を一覧から外す。本棚フォルダには触れない（FR-L-05） */
export function removeShelfFromList(shelf: Shelf): void {
  unregisterExternalShelf(shelf.id);
  const internal = shelfInternalDirectory(shelf.id);
  if (internal.exists) internal.delete();
}

/** 開いている本棚なら、呼び出し側が先に closeShelf する */
export function deleteShelfWithContents(shelf: Shelf): void {
  const directory = locateShelfDirectory(shelf);
  if (directory?.exists) directory.delete();
  const internal = shelfInternalDirectory(shelf.id);
  if (internal.exists) internal.delete();
  if (shelf.location !== 'app') unregisterExternalShelf(shelf.id);
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
  const directory = locateShelfDirectory(shelf);
  return directory ? countFolders(directory) : { notebooks: 0, notes: 0 };
}

/** 別の場所にアクセスできない本棚は shelfUnavailable（FR-L-04） */
export async function openShelf(shelf: Shelf): Promise<OpenShelf> {
  const directory = requireShelfDirectory(shelf);
  const { db, close } = await openShelfDatabase(shelfInternalDirectory(shelf.id));
  updateAppSettings((settings) => ({ ...settings, lastOpenedShelfId: shelf.id }));
  return {
    id: shelf.id,
    name: shelf.name,
    directory,
    db,
    runExclusively: createSerialQueue(),
    closeDatabase: close,
  };
}

/** OCR キューを止めてから DB を閉じる（閉じた DB に認識結果を書かないため）。別の場所へのアクセスも止める */
export async function closeShelf(shelf: OpenShelf): Promise<void> {
  stopOcrQueue();
  // 走査・保存の途中なら終わるのを待つ
  await shelf.runExclusively(async () => undefined);
  await shelf.closeDatabase();
  stopAccessingFolder(shelf.directory);
}

// ---- アプリ内の本棚 ----

function scanAppShelves(): Shelf[] {
  return shelvesRootDirectory()
    .list()
    .filter((entry): entry is Directory => entry instanceof Directory)
    .filter((directory) => !isHiddenEntryName(directory.name))
    .map((directory) => ({
      id: ensureShelfManifest(directory),
      name: entryName(directory),
      location: 'app' as const,
      available: true,
    }));
}

function isInsideAppShelves(folder: Directory): boolean {
  return folder.parentDirectory.uri === shelvesRootDirectory().uri;
}

// ---- 別の場所の本棚 ----

/** 参照を開けた本棚は今の名前・場所で、開けない本棚は最後に見えていた名前で返す（自動では一覧から消さない） */
function resolveExternalShelves(): Shelf[] {
  return readAppSettings().externalShelves.map((entry) => {
    const opened = openExternalEntry(entry);
    if (!opened) return { id: entry.id, name: entry.name, location: 'external', available: false };
    const name = entryName(opened.directory);
    if (name !== entry.name || opened.refreshedReference) {
      registerExternalShelf(entry.id, opened.directory, opened.refreshedReference);
    }
    return { id: entry.id, name, location: locationKindOf(opened.directory), available: true };
  });
}

function openExternalEntry(entry: ExternalShelfEntry) {
  const opened = openFolderReference(entry.reference);
  if (!opened) return null;
  const manifest = readManifest(opened.directory);
  // 同じ場所に別の本棚が置かれた（元の本棚が消され、別のフォルダに入れ替わった）場合は開けないとみなす
  if (manifest?.kind === 'shelf' && manifest.id !== entry.id) return null;
  return opened;
}

function findExternalEntry(id: ShelfId): ExternalShelfEntry | undefined {
  return readAppSettings().externalShelves.find((entry) => entry.id === id);
}

function findShelfById(id: ShelfId): Shelf | undefined {
  const appShelf = scanAppShelves().find((shelf) => shelf.id === id);
  if (appShelf) return appShelf;
  const entry = findExternalEntry(id);
  if (!entry) return undefined;
  const opened = openExternalEntry(entry);
  return {
    id,
    name: entry.name,
    location: opened ? locationKindOf(opened.directory) : 'external',
    available: opened !== null,
  };
}

function registerExternalShelf(id: ShelfId, directory: Directory, reference?: string | null) {
  const entry: ExternalShelfEntry = {
    id,
    reference: reference ?? createFolderReference(directory),
    name: entryName(directory),
  };
  updateAppSettings((settings) => ({
    ...settings,
    externalShelves: [...settings.externalShelves.filter((item) => item.id !== id), entry],
  }));
}

function unregisterExternalShelf(id: ShelfId): void {
  updateAppSettings((settings) => ({
    ...settings,
    externalShelves: settings.externalShelves.filter((item) => item.id !== id),
  }));
}

// ---- 共通 ----

function requireShelfDirectory(shelf: Shelf): Directory {
  const directory = locateShelfDirectory(shelf);
  if (!directory) throw new AppError('shelfUnavailable');
  return directory;
}

function ensureShelfManifest(directory: Directory): ShelfId {
  const manifest = readManifest(directory);
  if (manifest?.kind === 'shelf') return manifest.id;
  const id = newShelfId();
  writeManifest(directory, newShelfManifest(id, new Date().toISOString()));
  return id;
}

/** 本棚の名前は、すべての本棚の中で一意（FR-V-06）。作る場所に同じ名前のフォルダがあっても作れない */
function rejectDuplicateShelfName(name: string, parent: Directory): void {
  const isTaken =
    hasEntryNamed(parent, name) ||
    [...scanAppShelves(), ...resolveExternalShelves()].some((shelf) =>
      isSameName(shelf.name, name),
    );
  if (isTaken) throw new AppError('duplicateShelfName');
}

function removeOrphanInternalData(shelfIds: Set<ShelfId>): void {
  const internal = shelvesInternalDirectory();
  if (!internal.exists) return;
  for (const entry of internal.list()) {
    if (!shelfIds.has(entry.name as ShelfId)) entry.delete();
  }
}

function isSameFolder(a: Directory, b: Directory): boolean {
  return decodeURI(a.uri).normalize('NFC') === decodeURI(b.uri).normalize('NFC');
}

function sortByName(shelves: Shelf[]): Shelf[] {
  return shelves.sort((a, b) => a.name.localeCompare(b.name));
}

/** 本棚の場所の移動で、コピーが揃ったかを確かめるための、フォルダ内のすべてのファイルの数 */
function countFiles(directory: Directory): number {
  let count = 0;
  for (const entry of directory.list()) {
    count += entry instanceof File ? 1 : countFiles(entry);
  }
  return count;
}

/** 本棚フォルダを数える。kind: note の印があるフォルダがノート、それ以外のフォルダがノートブック */
function countFolders(directory: Directory): { notebooks: number; notes: number } {
  const count = { notebooks: 0, notes: 0 };
  const visit = (folder: Directory) => {
    for (const entry of folder.list()) {
      if (!(entry instanceof Directory) || isHiddenEntryName(entry.name)) continue;
      if (isNoteManifest(readManifest(entry))) {
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
