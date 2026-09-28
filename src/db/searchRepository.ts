// 全文検索（ADR 0004 / 0009: trigram テーブルへの LIKE 1本）。
import { SEARCH_RESULT_LIMIT, SEARCH_SNIPPET_CONTEXT_CHARS } from '@/config';
import type { Notebook, NoteId, NotebookId, PageId, SearchHit } from '@/domain/types';

import { buildNotebookPath } from '@/domain/notebookPath';

import type { Db } from './db';
import { listAllNotebooks, listNotebookSubtreeIds } from './notebookRepository';

type SearchRow = {
  page_id: string;
  title: string;
  ocr_text: string;
  position: number;
  note_id: string;
  notebook_id: string | null;
  updated_at: string;
};

const ELLIPSIS = '…';

export async function searchPages(
  db: Db,
  query: { keyword: string; scopeNotebookId: NotebookId | null; limit?: number },
): Promise<SearchHit[]> {
  const keyword = query.keyword.trim();
  if (keyword === '') return [];

  const rows = await queryMatchingPages(db, keyword, query.scopeNotebookId, query.limit);
  const notebooks = await listAllNotebooks(db);
  return rows.map((row) => toSearchHit(row, keyword, notebooks));
}

/**
 * 一致したページを返す。タイトルだけが一致したノートは全ページが該当してしまうため1ページ目だけにし、
 * 本文（OCR テキスト）が一致したページがあるノートはそのページだけにする。
 * この絞り込みを件数の上限より先に行うため、SQL の中（ウィンドウ関数）で行う（#36）
 */
async function queryMatchingPages(
  db: Db,
  keyword: string,
  scopeNotebookId: NotebookId | null,
  limit = SEARCH_RESULT_LIMIT,
): Promise<SearchRow[]> {
  const pattern = `%${escapeLikePattern(keyword)}%`;
  const scopeIds = scopeNotebookId ? await listNotebookSubtreeIds(db, scopeNotebookId) : null;
  const scopeCondition = scopeIds
    ? `AND notes.notebook_id IN (${scopeIds.map(() => '?').join(', ')})`
    : '';
  return db.all<SearchRow>(
    `WITH matched AS (
       SELECT pages_fts.page_id, pages_fts.title, pages_fts.ocr_text,
              pages.position, notes.id AS note_id, notes.notebook_id, notes.updated_at,
              (pages_fts.ocr_text LIKE ? ESCAPE '\\') AS is_text_match
       FROM pages_fts
       JOIN pages ON pages.id = pages_fts.page_id
       JOIN notes ON notes.id = pages.note_id
       WHERE (pages_fts.title LIKE ? ESCAPE '\\' OR pages_fts.ocr_text LIKE ? ESCAPE '\\')
         ${scopeCondition}
     ),
     ranked AS (
       SELECT *,
              max(is_text_match) OVER (PARTITION BY note_id) AS note_has_text_match,
              row_number() OVER (PARTITION BY note_id ORDER BY position) AS page_rank
       FROM matched
     )
     SELECT page_id, title, ocr_text, position, note_id, notebook_id, updated_at
     FROM ranked
     WHERE is_text_match = 1 OR (note_has_text_match = 0 AND page_rank = 1)
     ORDER BY updated_at DESC, position
     LIMIT ?`,
    [pattern, pattern, pattern, ...(scopeIds ?? []), limit],
  );
}

/** LIKE の特殊文字（\ % _）を、ESCAPE '\' で文字どおりに扱わせる */
export function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toSearchHit(row: SearchRow, keyword: string, notebooks: Notebook[]): SearchHit {
  return {
    noteId: row.note_id as NoteId,
    noteTitle: row.title,
    noteUpdatedAt: row.updated_at,
    pageId: row.page_id as PageId,
    pagePosition: row.position,
    notebookPath: buildNotebookPath(row.notebook_id as NotebookId | null, notebooks),
    snippet: buildSnippet(row.ocr_text, keyword),
  };
}

/**
 * 一致箇所と前後の文字を切り出す。本文に一致がない（タイトルだけ一致）場合は本文の先頭を返す。
 * 改行や連続する空白は1つの空白にまとめる（検索結果の1行に収めるため）。
 */
export function buildSnippet(
  text: string,
  keyword: string,
  contextChars = SEARCH_SNIPPET_CONTEXT_CHARS,
): SearchHit['snippet'] {
  const flatText = text.replace(/\s+/g, ' ').trim();
  const index = indexOfKeyword(flatText, keyword);
  if (index < 0) {
    return { before: '', match: '', after: truncateEnd(flatText, contextChars * 2) };
  }
  const beforeStart = Math.max(0, index - contextChars);
  const afterStart = index + keyword.length;
  return {
    before: (beforeStart > 0 ? ELLIPSIS : '') + flatText.slice(beforeStart, index),
    match: flatText.slice(index, afterStart),
    after: truncateEnd(flatText.slice(afterStart), contextChars),
  };
}

function truncateEnd(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + ELLIPSIS : text;
}

// SQLite の LIKE は ASCII の大文字・小文字を区別しないため、それに合わせる
function indexOfKeyword(text: string, keyword: string): number {
  return text.toLowerCase().indexOf(keyword.toLowerCase());
}
