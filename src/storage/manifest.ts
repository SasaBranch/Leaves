// 各フォルダの管理用ファイル .leaves.json の形と読み書き（詳細設計書 5.2、ADR 0017）。
// フォルダ名だけでは持てない情報（種類・ID・表紙色・OCR 結果）を、本棚フォルダの中に持つ。
import { Directory, File } from 'expo-file-system';

import { NOTEBOOK_COLORS } from '@/config';
import type {
  IsoDateTime,
  NoteId,
  NotebookColor,
  NotebookId,
  OcrLine,
  PageId,
  ShelfId,
} from '@/domain/types';

import { manifestFile } from './paths';

const MANIFEST_VERSION = 1;

export type ShelfManifest = { kind: 'shelf'; version: 1; id: ShelfId; createdAt: IsoDateTime };

export type NotebookManifest = {
  kind: 'notebook';
  version: 1;
  id: NotebookId;
  color: NotebookColor;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

/** processing は DB の中だけの一時的な状態なので、ファイルには書かない */
export type ManifestOcrStatus = 'pending' | 'done' | 'failed';

export type PageManifest = {
  id: PageId;
  /** 001.jpg など */
  file: string;
  /** バイト数と更新日時（ミリ秒）。外部で名前を変えられたページの対応づけに使う（ADR 0017） */
  size: number;
  modifiedAt: number;
  width: number;
  height: number;
  ocrStatus: ManifestOcrStatus;
  ocrText: string;
  ocrLines: OcrLine[];
  createdAt: IsoDateTime;
};

export type NoteManifest = {
  kind: 'note';
  version: 1;
  id: NoteId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** ページ順 */
  pages: PageManifest[];
};

export type Manifest = ShelfManifest | NotebookManifest | NoteManifest;

/**
 * フォルダの .leaves.json を読む。ない・壊れている・形が合わない・知らない版は null
 * （外部で壊されても異常終了せず、「管理用ファイルがない」フォルダとして扱うため。NFR-R-04）。
 * 書き込みの置き換えの途中で終了していた場合は、書き終えた一時ファイルを読む
 */
export function readManifest(directory: Directory): Manifest | null {
  return parseManifestFile(manifestFile(directory)) ?? parseManifestFile(writingFile(directory));
}

/**
 * 一時ファイルに書き終えてから置き換える（途中で終了しても、壊れた JSON を残さないため）。
 * expo-file-system の write は途中で止まると中身が欠けるため、直接は書かない
 */
export function writeManifest(directory: Directory, manifest: Manifest): void {
  const target = manifestFile(directory);
  const temporary = writingFile(directory);
  temporary.write(JSON.stringify(manifest));
  if (target.exists) target.delete();
  temporary.moveSync(target);
}

const writingFile = (directory: Directory) =>
  new File(directory, `${manifestFile(directory).name}.writing`);

function parseManifestFile(file: File): Manifest | null {
  try {
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(file.textSync());
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function newShelfManifest(id: ShelfId, now: IsoDateTime): ShelfManifest {
  return { kind: 'shelf', version: MANIFEST_VERSION, id, createdAt: now };
}

export function newNotebookManifest(
  id: NotebookId,
  color: NotebookColor,
  now: IsoDateTime,
): NotebookManifest {
  return { kind: 'notebook', version: MANIFEST_VERSION, id, color, createdAt: now, updatedAt: now };
}

export function newNoteManifest(
  id: NoteId,
  pages: PageManifest[],
  now: IsoDateTime,
): NoteManifest {
  return { kind: 'note', version: MANIFEST_VERSION, id, createdAt: now, updatedAt: now, pages };
}

// ---- 形の検査（外部で書き換えられたファイルを信用しないため） ----

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isManifest(value: unknown): value is Manifest {
  if (!isObject(value) || value.version !== MANIFEST_VERSION || !isString(value.id)) return false;
  if (!isString(value.createdAt)) return false;
  switch (value.kind) {
    case 'shelf':
      return true;
    case 'notebook':
      return (
        (NOTEBOOK_COLORS as readonly unknown[]).includes(value.color) &&
        isString(value.updatedAt)
      );
    case 'note':
      return (
        isString(value.updatedAt) && Array.isArray(value.pages) && value.pages.every(isPageManifest)
      );
    default:
      return false;
  }
}

function isPageManifest(value: unknown): value is PageManifest {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.file) &&
    isNumber(value.size) &&
    isNumber(value.modifiedAt) &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    (value.ocrStatus === 'pending' || value.ocrStatus === 'done' || value.ocrStatus === 'failed') &&
    typeof value.ocrText === 'string' &&
    Array.isArray(value.ocrLines) &&
    value.ocrLines.every(isOcrLine) &&
    isString(value.createdAt)
  );
}

function isOcrLine(value: unknown): value is OcrLine {
  return (
    isObject(value) &&
    typeof value.text === 'string' &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  );
}
