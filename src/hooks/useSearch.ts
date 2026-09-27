// SC-7 検索用（詳細設計書 8 章）
import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/config';
import { findNotebook, listChildNotebooks } from '@/db/notebookRepository';
import { searchPages } from '@/db/searchRepository';
import type { Notebook, NotebookId, SearchHit } from '@/domain/types';

import { useDataQuery } from './useDataQuery';

/** 入力が止まってから SEARCH_DEBOUNCE_MS 後に検索する。キーワードが空なら結果は空 */
export function useSearch(keyword: string, scopeNotebookId: NotebookId | null) {
  const debouncedKeyword = useDebouncedValue(keyword.trim(), SEARCH_DEBOUNCE_MS);
  const { data } = useDataQuery<SearchHit[]>(`${debouncedKeyword}:${scopeNotebookId}`, (db) =>
    searchPages(db, { keyword: debouncedKeyword, scopeNotebookId }),
  );
  return {
    hits: data ?? [],
    /** 表示中の結果がどのキーワードのものか（件数表示を結果と食い違わせないため） */
    searchedKeyword: debouncedKeyword,
    isSearching: keyword.trim() !== debouncedKeyword,
  };
}

/**
 * 範囲チップに並べるノートブック。ライブラリ直下に加え、SC-2 から開いたときの
 * ノートブックが直下にない（入れ子の）場合も、初期選択として見えるよう先頭に加える
 */
export function useSearchScopes(initialScopeId: NotebookId | null) {
  return useDataQuery<Notebook[]>(`${initialScopeId}`, async (db) => {
    const roots: Notebook[] = await listChildNotebooks(db, null, 'name');
    if (!initialScopeId || roots.some((notebook) => notebook.id === initialScopeId)) return roots;
    const initialScope = await findNotebook(db, initialScopeId);
    return initialScope ? [initialScope, ...roots] : roots;
  });
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
