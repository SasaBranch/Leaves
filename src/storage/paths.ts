// ファイルの保存場所の唯一の置き場所（基本設計書 5.4、詳細設計書 4.5）。
// パスはアプリ更新で変わることがあるため DB には保存せず、ここで組み立てる。
import { Directory, File, Paths } from 'expo-file-system';

import { PAGE_FILE_NUMBER_DIGITS } from '@/config';
import type { PageId, ShelfId } from '@/domain/types';

const PAGE_IMAGE_EXTENSION = '.jpg';
const MANIFEST_FILE_NAME = '.leaves.json';

/** 本棚の親（「ファイル」アプリの このiPhone内 > Leaves） */
export const shelvesRootDirectory = () => new Directory(Paths.document);
export const shelfDirectory = (shelfName: string) => new Directory(Paths.document, shelfName);

/** アプリの内部データ。. で始まるため「ファイル」アプリには表示されない（ADR 0018） */
export const appInternalDirectory = () => new Directory(Paths.document, '.leaves');
export const appSettingsFile = () => new File(appInternalDirectory(), 'settings.json');
export const shelvesInternalDirectory = () => new Directory(appInternalDirectory(), 'shelves');
/** 本棚ごとの索引 DB・サムネイルの置き場所 */
export const shelfInternalDirectory = (shelfId: ShelfId) =>
  new Directory(shelvesInternalDirectory(), shelfId);
/**
 * 組み立て中のノートの置き場所。本棚と同じボリュームに置き、完成したノートを移動（名前の付け替え）だけで
 * 本棚に置けるようにする。起動時に空にする
 */
export const workDirectory = () => new Directory(appInternalDirectory(), 'work');

export const notebookDirectory = (shelf: Directory, notebookPath: string[]) =>
  new Directory(shelf, ...notebookPath);
export const noteDirectory = (shelf: Directory, notebookPath: string[], title: string) =>
  new Directory(shelf, ...notebookPath, title);

/** position は 0 始まり、ファイル名は 1 始まりのゼロ埋め（001.jpg）。1000 ページ目以降は桁が増える */
export const pageFileName = (position: number) =>
  `${String(position + 1).padStart(PAGE_FILE_NUMBER_DIGITS, '0')}${PAGE_IMAGE_EXTENSION}`;
export const pageImageFile = (note: Directory, position: number) =>
  new File(note, pageFileName(position));

export const thumbnailsDirectory = (shelfId: ShelfId) =>
  new Directory(shelfInternalDirectory(shelfId), 'thumbs');
export const thumbnailFile = (shelfId: ShelfId, pageId: PageId) =>
  new File(thumbnailsDirectory(shelfId), `${pageId}${PAGE_IMAGE_EXTENSION}`);

export const manifestFile = (directory: Directory) => new File(directory, MANIFEST_FILE_NAME);

/**
 * 編集したページの元の画像（FR-N-12）。ページ ID で結びつけるため、並べ替え（ファイル名の付け直し）や
 * ノートの名前変更・移動の影響を受けない。. で始まるため走査の対象にならない
 */
export const originalsDirectory = (note: Directory) => new Directory(note, '.originals');
export const originalImageFile = (note: Directory, pageId: PageId) =>
  new File(originalsDirectory(note), `${pageId}${PAGE_IMAGE_EXTENSION}`);

/** . で始まる名前はアプリの管理用とみなし、走査・一覧の対象から外す（基本設計書 5.4） */
export const isHiddenEntryName = (name: string) => name.startsWith('.');

/**
 * ファイルシステムから得た名前を、DB・入力と比べられる形にする。
 * iOS の list() は濁点を分けた形（NFD）で返すため（ADR 0021）
 */
export const entryName = (entry: File | Directory) => entry.name.normalize('NFC');

// ---- v1.0 の保存場所（旧データの移行でだけ使う。詳細設計書 9.10） ----

/** expo-sqlite の既定の置き場所（Documents/SQLite/） */
export const legacyDatabaseFile = () => new File(Paths.document, 'SQLite', 'leaves.db');
export const legacyPageImageFile = (pageId: PageId) =>
  new File(Paths.document, 'pages', `${pageId}${PAGE_IMAGE_EXTENSION}`);
export const legacyThumbnailFile = (pageId: PageId) =>
  new File(Paths.document, 'thumbs', `${pageId}${PAGE_IMAGE_EXTENSION}`);
/** 移行後に消すもの（DB・ページ画像・サムネイルのフォルダと、画像操作の途中を示す印） */
export const legacyEntries = () => [
  legacyDatabaseFile().parentDirectory,
  new Directory(Paths.document, 'pages'),
  new Directory(Paths.document, 'thumbs'),
  new File(Paths.document, 'image-operation-in-progress'),
];
/** 移行する本棚を組み立てる場所。やり直すときは消してから作る */
export const legacyMigrationWorkDirectory = () => new Directory(workDirectory(), 'legacy');

/** 書き出し用の一時ファイル。共有後に削除する */
export const exportDirectory = () => new Directory(Paths.cache, 'export');
