// ノートブックの作成・変更・移動・削除（詳細設計書 9.3）。
// フォルダを先に変更し、成功したら DB に反映する（ADR 0016）。同じ場所の重複はフォルダの一覧で判定する
import { Directory } from 'expo-file-system';

import { NOTEBOOK_COLORS } from '@/config';
import {
  deleteNotebookWithContents as deleteNotebookRows,
  findNotebook,
  insertNotebook,
  listChildNotebooks,
  listNotebookSubtreeIds,
  updateNotebookColor,
  updateNotebookName,
  updateNotebookParent,
} from '@/db/notebookRepository';
import { listPageIdsInNotebooks } from '@/db/pageRepository';
import { AppError } from '@/domain/errors';
import { validateName } from '@/domain/name';
import type { Notebook, NotebookColor, NotebookId } from '@/domain/types';
import { newNotebookId } from '@/native/randomId';
import { notifyDataChanged } from '@/state/dataChanges';
import type { OpenShelf } from '@/state/openShelf';
import { newNotebookManifest, readManifest, writeManifest } from '@/storage/manifest';
import { deleteThumbnails } from '@/storage/pageImages';

import { hasEntryNamed, locateNotebookDirectory } from './folders';

export async function createNotebook(
  shelf: OpenShelf,
  name: string,
  parentId: NotebookId | null,
): Promise<NotebookId> {
  const validName = validateName(name);
  const id = newNotebookId();
  await shelf.runExclusively(async () => {
    const parent = await locateNotebookDirectory(shelf, parentId);
    if (hasEntryNamed(parent, validName)) throw new AppError('duplicateName');
    const color = await pickColorForNewNotebook(shelf, parentId);
    const now = new Date().toISOString();
    const folder = new Directory(parent, validName);
    folder.create();
    writeManifest(folder, newNotebookManifest(id, color, now));
    await insertNotebook(shelf.db, {
      id,
      parentId,
      name: validName,
      color,
      createdAt: now,
      updatedAt: now,
    });
  });
  notifyDataChanged();
  return id;
}

export async function renameNotebook(shelf: OpenShelf, id: NotebookId, name: string) {
  const validName = validateName(name);
  await shelf.runExclusively(async () => {
    const notebook = await getNotebook(shelf, id);
    if (validName === notebook.name) return;
    const folder = await locateNotebookDirectory(shelf, id);
    if (hasEntryNamed(folder.parentDirectory, validName, notebook.name)) {
      throw new AppError('duplicateName');
    }
    folder.rename(validName);
    await updateNotebookName(shelf.db, id, validName, new Date().toISOString());
  });
  notifyDataChanged();
}

export async function changeNotebookColor(shelf: OpenShelf, id: NotebookId, color: NotebookColor) {
  await shelf.runExclusively(async () => {
    const folder = await locateNotebookDirectory(shelf, id);
    const now = new Date().toISOString();
    const manifest = readManifest(folder);
    writeManifest(
      folder,
      manifest?.kind === 'notebook'
        ? { ...manifest, color, updatedAt: now }
        : newNotebookManifest(id, color, now),
    );
    await updateNotebookColor(shelf.db, id, color, now);
  });
  notifyDataChanged();
}

/** newParentId が null ならライブラリ直下へ移す */
export async function moveNotebook(
  shelf: OpenShelf,
  id: NotebookId,
  newParentId: NotebookId | null,
): Promise<void> {
  await shelf.runExclusively(async () => {
    const notebook = await getNotebook(shelf, id);
    if (notebook.parentId === newParentId) return;
    await rejectMoveIntoOwnSubtree(shelf, id, newParentId);
    const destination = await locateNotebookDirectory(shelf, newParentId);
    if (hasEntryNamed(destination, notebook.name)) throw new AppError('duplicateName');
    (await locateNotebookDirectory(shelf, id)).moveSync(
      new Directory(destination, notebook.name),
    );
    await updateNotebookParent(shelf.db, id, newParentId, new Date().toISOString());
  });
  notifyDataChanged();
}

/** 基本設計書 6.3 の順番: 消えるページを先に控える → フォルダを削除 → DB から削除 → サムネイルを削除 */
export async function deleteNotebookWithContents(shelf: OpenShelf, id: NotebookId) {
  await shelf.runExclusively(async () => {
    const subtreeIds = await listNotebookSubtreeIds(shelf.db, id);
    const pageIds = await listPageIdsInNotebooks(shelf.db, subtreeIds);
    const folder = await locateNotebookDirectory(shelf, id);
    if (folder.exists) folder.delete();
    await deleteNotebookRows(shelf.db, id);
    deleteThumbnails(shelf.id, pageIds);
  });
  notifyDataChanged();
}

async function getNotebook(shelf: OpenShelf, id: NotebookId): Promise<Notebook> {
  const notebook = await findNotebook(shelf.db, id);
  if (!notebook) throw new Error(`ノートブックがありません: ${id}`);
  return notebook;
}

/** 同じ親の下で色が偏らないよう、兄弟の数で順番に割り当てる */
async function pickColorForNewNotebook(
  shelf: OpenShelf,
  parentId: NotebookId | null,
): Promise<NotebookColor> {
  const siblings = await listChildNotebooks(shelf.db, parentId, 'name');
  // 余りは必ず配列の範囲内に収まる
  return NOTEBOOK_COLORS[siblings.length % NOTEBOOK_COLORS.length]!;
}

/** 自分自身や子孫の下へ移すと木が循環してしまうため */
async function rejectMoveIntoOwnSubtree(
  shelf: OpenShelf,
  id: NotebookId,
  newParentId: NotebookId | null,
): Promise<void> {
  if (newParentId === null) return;
  const subtreeIds = await listNotebookSubtreeIds(shelf.db, id);
  if (subtreeIds.includes(newParentId)) throw new AppError('invalidMove');
}
