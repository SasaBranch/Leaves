// notebooks テーブルの読み書き。業務ルール（名前の整形・色の割り当て・移動の検証）は services/notebooks.ts が持つ。
import type {
  IsoDateTime,
  Notebook,
  NotebookColor,
  NotebookId,
  NotebookSummary,
  SortOrder,
} from '@/domain/types';

import type { Db } from './db';

type NotebookRow = {
  id: string;
  parent_id: string | null;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

function toNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id as NotebookId,
    parentId: row.parent_id as NotebookId | null,
    name: row.name,
    color: row.color as NotebookColor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_BY: Record<SortOrder, string> = {
  updatedAt: 'notebooks.updated_at DESC',
  name: 'notebooks.name COLLATE NOCASE',
};

export async function insertNotebook(db: Db, notebook: Notebook): Promise<void> {
  await db.run(
    `INSERT INTO notebooks (id, parent_id, name, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      notebook.id,
      notebook.parentId,
      notebook.name,
      notebook.color,
      notebook.createdAt,
      notebook.updatedAt,
    ],
  );
}

export async function findNotebook(db: Db, id: NotebookId): Promise<Notebook | null> {
  const row = await db.get<NotebookRow>('SELECT * FROM notebooks WHERE id = ?', [id]);
  return row ? toNotebook(row) : null;
}

/** 移動先の木構造や所属パスの組み立てに使う。ノートブックは多くても数百件のため全件で読む */
export async function listAllNotebooks(db: Db): Promise<Notebook[]> {
  const rows = await db.all<NotebookRow>('SELECT * FROM notebooks ORDER BY name COLLATE NOCASE');
  return rows.map(toNotebook);
}

/**
 * parentId 直下のノートブックを、ノート数つきで返す。null はライブラリ直下。
 * ノート数は子孫のノートブックの分も含める（子ノートブックにだけノートがあると「0 ノート」に見えてしまうため。#37）
 */
export async function listChildNotebooks(
  db: Db,
  parentId: NotebookId | null,
  sort: SortOrder,
): Promise<NotebookSummary[]> {
  const rows = await db.all<NotebookRow & { note_count: number }>(
    `WITH RECURSIVE subtree(root_id, id) AS (
       SELECT id, id FROM notebooks WHERE parent_id IS ?
       UNION ALL
       SELECT subtree.root_id, notebooks.id
       FROM notebooks JOIN subtree ON notebooks.parent_id = subtree.id
     )
     SELECT notebooks.*,
            (SELECT count(*) FROM notes JOIN subtree ON notes.notebook_id = subtree.id
             WHERE subtree.root_id = notebooks.id) AS note_count
     FROM notebooks
     WHERE notebooks.parent_id IS ?
     ORDER BY ${ORDER_BY[sort]}`,
    [parentId, parentId],
  );
  return rows.map((row) => ({ ...toNotebook(row), noteCount: row.note_count }));
}

/** 自分自身と、その子孫すべての ID（詳細設計書 6.4） */
export async function listNotebookSubtreeIds(db: Db, id: NotebookId): Promise<NotebookId[]> {
  const rows = await db.all<{ id: string }>(
    `WITH RECURSIVE subtree(id) AS (
       SELECT ?
       UNION ALL
       SELECT notebooks.id FROM notebooks JOIN subtree ON notebooks.parent_id = subtree.id
     )
     SELECT id FROM subtree`,
    [id],
  );
  return rows.map((row) => row.id as NotebookId);
}

/** 中に含まれるノートブック（自分自身を除く）・ノート・ページの数。削除確認と見出しで使う */
export async function countNotebookContents(
  db: Db,
  id: NotebookId,
): Promise<{ notebooks: number; notes: number; pages: number }> {
  const subtreeIds = await listNotebookSubtreeIds(db, id);
  const placeholders = subtreeIds.map(() => '?').join(', ');
  const row = await db.get<{ notes: number; pages: number }>(
    `SELECT count(DISTINCT notes.id) AS notes, count(pages.id) AS pages
     FROM notes LEFT JOIN pages ON pages.note_id = notes.id
     WHERE notes.notebook_id IN (${placeholders})`,
    subtreeIds,
  );
  return { notebooks: subtreeIds.length - 1, notes: row?.notes ?? 0, pages: row?.pages ?? 0 };
}

export async function updateNotebookName(
  db: Db,
  id: NotebookId,
  name: string,
  now: IsoDateTime,
): Promise<void> {
  await db.run('UPDATE notebooks SET name = ?, updated_at = ? WHERE id = ?', [name, now, id]);
}

export async function updateNotebookColor(
  db: Db,
  id: NotebookId,
  color: NotebookColor,
  now: IsoDateTime,
): Promise<void> {
  await db.run('UPDATE notebooks SET color = ?, updated_at = ? WHERE id = ?', [color, now, id]);
}

export async function updateNotebookParent(
  db: Db,
  id: NotebookId,
  parentId: NotebookId | null,
  now: IsoDateTime,
): Promise<void> {
  await db.run('UPDATE notebooks SET parent_id = ?, updated_at = ? WHERE id = ?', [
    parentId,
    now,
    id,
  ]);
}

/** 子孫のノートブック・ノート・ページも CASCADE で消える。画像ファイルは呼び出し側で消す */
export async function deleteNotebookWithContents(db: Db, id: NotebookId): Promise<void> {
  await db.run('DELETE FROM notebooks WHERE id = ?', [id]);
}
