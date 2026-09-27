// モジュール間の約束となる型（詳細設計書 5 章）。
import type { NOTEBOOK_COLORS } from '@/config';

// 取り違えを防ぐため、ID ごとに別の型にする
type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type NotebookId = Brand<string, 'NotebookId'>;
export type NoteId = Brand<string, 'NoteId'>;
export type PageId = Brand<string, 'PageId'>;

/** ISO 8601（UTC） */
export type IsoDateTime = string;

export type NotebookColor = (typeof NOTEBOOK_COLORS)[number];

export type Notebook = {
  id: NotebookId;
  /** null はライブラリ直下 */
  parentId: NotebookId | null;
  name: string;
  color: NotebookColor;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type Note = {
  id: NoteId;
  /** null はライブラリ直下 */
  notebookId: NotebookId | null;
  title: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export const OCR_STATUSES = ['pending', 'processing', 'done', 'failed'] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

/** 画像に対する相対座標（0〜1）。画像サイズが変わっても使えるようにするため */
export type OcrLine = { text: string; x: number; y: number; width: number; height: number };

export type Page = {
  id: PageId;
  noteId: NoteId;
  /** ノート内の順番（0 始まり） */
  position: number;
  /** 画像の幅（px） */
  width: number;
  height: number;
  ocrStatus: OcrStatus;
  ocrText: string;
  ocrLines: OcrLine[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

/** 一覧表示用。ノート表紙に必要な情報を1回の SQL で取る */
export type NoteSummary = Note & { pageCount: number; coverPageId: PageId };
export type NotebookSummary = Notebook & { noteCount: number };

/** スキャン・写真選択で得た、保存前の一時画像 */
export type CapturedImage = { uri: string; width: number; height: number };

export type SearchHit = {
  noteId: NoteId;
  noteTitle: string;
  pageId: PageId;
  pagePosition: number;
  /** 例: ['大学', '線形代数'] */
  notebookPath: string[];
  snippet: { before: string; match: string; after: string };
};

export type SortOrder = 'updatedAt' | 'name';
