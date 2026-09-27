// ノートブックの作成・変更・移動・削除（詳細設計書 9.3）。
import { NOTEBOOK_COLORS } from '@/config';
import type { Db } from '@/db/db';
import {
  deleteNotebookWithContents as deleteNotebookRows,
  insertNotebook,
  listChildNotebooks,
  listNotebookSubtreeIds,
  updateNotebookColor,
  updateNotebookName,
  updateNotebookParent,
} from '@/db/notebookRepository';
import { listPageIdsInNotebooks } from '@/db/pageRepository';
import { AppError } from '@/domain/errors';
import { normalizeName } from '@/domain/name';
import type { NotebookColor, NotebookId } from '@/domain/types';
import { newNotebookId } from '@/native/randomId';
import { notifyDataChanged } from '@/state/dataChanges';
import { deletePageImages, withImageOperation } from '@/storage/pageImages';

export async function createNotebook(
  db: Db,
  name: string,
  parentId: NotebookId | null,
): Promise<NotebookId> {
  const trimmedName = normalizeName(name);
  const color = await pickColorForNewNotebook(db, parentId);
  const id = newNotebookId();
  const now = new Date().toISOString();
  await rejectDuplicateName(() =>
    insertNotebook(db, { id, parentId, name: trimmedName, color, createdAt: now, updatedAt: now }),
  );
  notifyDataChanged();
  return id;
}

export async function renameNotebook(db: Db, id: NotebookId, name: string): Promise<void> {
  const trimmedName = normalizeName(name);
  await rejectDuplicateName(() =>
    updateNotebookName(db, id, trimmedName, new Date().toISOString()),
  );
  notifyDataChanged();
}

export async function changeNotebookColor(
  db: Db,
  id: NotebookId,
  color: NotebookColor,
): Promise<void> {
  await updateNotebookColor(db, id, color, new Date().toISOString());
  notifyDataChanged();
}

export async function moveNotebook(
  db: Db,
  id: NotebookId,
  newParentId: NotebookId | null,
): Promise<void> {
  await rejectMoveIntoOwnSubtree(db, id, newParentId);
  await rejectDuplicateName(() =>
    updateNotebookParent(db, id, newParentId, new Date().toISOString()),
  );
  notifyDataChanged();
}

/** 基本設計書 6.3 の順番: 消える画像を先に特定 → DB から削除 → 画像を削除 */
export async function deleteNotebookWithContents(db: Db, id: NotebookId): Promise<void> {
  const subtreeIds = await listNotebookSubtreeIds(db, id);
  const pageIds = await listPageIdsInNotebooks(db, subtreeIds);
  await withImageOperation(async () => {
    await deleteNotebookRows(db, id);
    deletePageImages(pageIds);
  });
  notifyDataChanged();
}

/** 前後の空白を除いた名前を返す。空なら保存できない */
/** 同じ親の下で色が偏らないよう、兄弟の数で順番に割り当てる */
async function pickColorForNewNotebook(
  db: Db,
  parentId: NotebookId | null,
): Promise<NotebookColor> {
  const siblings = await listChildNotebooks(db, parentId, 'name');
  // 余りは必ず配列の範囲内に収まる
  return NOTEBOOK_COLORS[siblings.length % NOTEBOOK_COLORS.length]!;
}

/** 自分自身や子孫の下へ移すと木が循環してしまうため */
async function rejectMoveIntoOwnSubtree(
  db: Db,
  id: NotebookId,
  newParentId: NotebookId | null,
): Promise<void> {
  if (newParentId === null) return;
  const subtreeIds = await listNotebookSubtreeIds(db, id);
  if (subtreeIds.includes(newParentId)) throw new AppError('invalidMove');
}

/**
 * 同名チェックは事前の SELECT ではなく UNIQUE 制約に任せる。
 * 確認と書き込みの間に別の書き込みが入る競合を防げないため
 */
async function rejectDuplicateName(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError('duplicateName', { cause: error });
    throw error;
  }
}

/** expo-sqlite・better-sqlite3 とも SQLite のメッセージをそのまま返す */
function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
