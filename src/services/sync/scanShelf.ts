// 本棚フォルダを読み、今の状態（ノートブック・ノート・変わったノートのページ）を得る（詳細設計書 9.9）。
// 前回の走査時から更新日時が変わっていないフォルダは中身を読まず、DB の記録を使う（ADR 0020・0021）。
import { Directory, File } from 'expo-file-system';

import { NOTEBOOK_COLORS, SYNC_YIELD_EVERY_FOLDERS } from '@/config';
import type { IndexedNote, IndexedNotebook, IndexSnapshot } from '@/db/indexRepository';
import { pickAvailableName } from '@/domain/name';
import type { IsoDateTime, NotebookColor, NotebookId, NoteId, ShelfId } from '@/domain/types';
import { newNotebookId, newNoteId, newPageId } from '@/native/randomId';
import {
  newNotebookManifest,
  newNoteManifest,
  readManifest,
  writeManifest,
  type NoteManifest,
  type PageManifest,
} from '@/storage/manifest';
import { importExternalImage } from '@/storage/pageImages';
import { entryName, isHiddenEntryName, originalImageFile, pageFileName } from '@/storage/paths';

import { isSupportedImageName, normalizeNoteFolder } from './normalizeNoteFolder';

export type ScannedNotebook = IndexedNotebook;
/** pages が null のノートは中身が前回から変わっていない（DB のページをそのまま使う） */
export type ScannedNote = IndexedNote & { directory: Directory; pages: PageManifest[] | null };
export type ScanResult = {
  /** 親が子より先に並ぶ（DB に入れるときの外部キーのため） */
  notebooks: ScannedNotebook[];
  notes: ScannedNote[];
  /** 読めなかったフォルダ。飛ばして続ける（NFR-R-04） */
  failures: { uri: string; error: unknown }[];
};

type Context = {
  shelfId: ShelfId;
  now: IsoDateTime;
  index: IndexSnapshot;
  result: ScanResult;
  seenIds: Set<string>;
  visitedFolderCount: number;
};

export async function scanShelf(
  shelfDirectory: Directory,
  shelfId: ShelfId,
  index: IndexSnapshot,
  now: IsoDateTime,
): Promise<ScanResult> {
  const context: Context = {
    shelfId,
    now,
    index,
    result: { notebooks: [], notes: [], failures: [] },
    seenIds: new Set(),
    visitedFolderCount: 0,
  };
  await visitListedNotebookFolder(context, shelfDirectory, null);
  return context.result;
}

/** 一覧を取って中身を調べる（変わったノートブックと、本棚の最上位） */
async function visitListedNotebookFolder(
  context: Context,
  folder: Directory,
  notebookId: NotebookId | null,
): Promise<void> {
  const looseImages: File[] = [];
  for (const entry of folder.list()) {
    if (isHiddenEntryName(entry.name)) continue;
    if (entry instanceof Directory) {
      await visitChildFolder(context, entry, notebookId);
    } else if (isSupportedImageName(entryName(entry))) {
      looseImages.push(entry);
    }
  }
  for (const image of looseImages) {
    await guard(context, image.uri, () => importLooseImage(context, folder, notebookId, image));
  }
}

/** 更新日時が前回と同じノートブック: 直下は変わっていないので、DB の子をたどる（一覧を取らない） */
async function visitUnchangedNotebookFolder(
  context: Context,
  folder: Directory,
  notebookId: NotebookId,
): Promise<void> {
  const { notebooks, notes } = context.index;
  const children = [
    ...notebooks.filter((notebook) => notebook.parentId === notebookId).map((n) => n.name),
    ...notes.filter((note) => note.notebookId === notebookId).map((note) => note.title),
  ];
  for (const name of children) {
    const child = new Directory(folder, name);
    if (child.exists) await visitChildFolder(context, child, notebookId);
  }
}

async function visitChildFolder(
  context: Context,
  folder: Directory,
  parentId: NotebookId | null,
): Promise<void> {
  if (++context.visitedFolderCount % SYNC_YIELD_EVERY_FOLDERS === 0) await yieldToUi();
  await guard(context, folder.uri, async () => {
    const name = entryName(folder);
    const modifiedAt = folderModifiedAt(folder);
    const known = findUnchangedChild(context.index, parentId, name, modifiedAt);
    if (known?.kind === 'notebook') {
      context.seenIds.add(known.notebook.id);
      context.result.notebooks.push({ ...known.notebook, parentId, name });
      await visitUnchangedNotebookFolder(context, folder, known.notebook.id);
    } else if (known?.kind === 'note') {
      context.seenIds.add(known.note.id);
      context.result.notes.push({ ...known.note, notebookId: parentId, title: name, directory: folder, pages: null });
    } else {
      await visitFolderByManifest(context, folder, parentId, name, modifiedAt);
    }
  });
}

/** 名前も更新日時も前回と同じ子は、.leaves.json を読まずに前回の記録を使う */
function findUnchangedChild(
  index: IndexSnapshot,
  parentId: NotebookId | null,
  name: string,
  modifiedAt: number,
):
  | { kind: 'notebook'; notebook: IndexedNotebook }
  | { kind: 'note'; note: IndexedNote }
  | null {
  const notebook = index.notebooks.find(
    (candidate) =>
      candidate.parentId === parentId &&
      candidate.name === name &&
      candidate.scannedModifiedAt === modifiedAt,
  );
  if (notebook) return { kind: 'notebook', notebook };
  const note = index.notes.find(
    (candidate) =>
      candidate.notebookId === parentId &&
      candidate.title === name &&
      candidate.scannedModifiedAt === modifiedAt,
  );
  return note ? { kind: 'note', note } : null;
}

async function visitFolderByManifest(
  context: Context,
  folder: Directory,
  parentId: NotebookId | null,
  name: string,
  modifiedAt: number,
): Promise<void> {
  const manifest = readManifest(folder);
  if (manifest?.kind === 'note') {
    await visitNoteFolder(context, folder, parentId, name, modifiedAt, manifest);
    return;
  }
  // 印のないフォルダ（外部で作られた）はノートブック。ID・表紙色を決めて印を書く（ADR 0017）
  const notebook =
    manifest?.kind === 'notebook' && !context.seenIds.has(manifest.id)
      ? manifest
      : newNotebookManifest(newNotebookId(), pickColor(context, parentId), context.now);
  if (notebook !== manifest) writeManifest(folder, notebook);
  context.seenIds.add(notebook.id);
  const indexed = context.index.notebooks.find((candidate) => candidate.id === notebook.id);
  const currentModifiedAt = notebook === manifest ? modifiedAt : folderModifiedAt(folder);
  context.result.notebooks.push({
    id: notebook.id,
    parentId,
    name,
    color: notebook.color,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    scannedModifiedAt: currentModifiedAt,
  });
  if (indexed?.scannedModifiedAt === currentModifiedAt) {
    await visitUnchangedNotebookFolder(context, folder, notebook.id);
  } else {
    await visitListedNotebookFolder(context, folder, notebook.id);
  }
}

async function visitNoteFolder(
  context: Context,
  folder: Directory,
  notebookId: NotebookId | null,
  title: string,
  modifiedAt: number,
  manifest: NoteManifest,
): Promise<void> {
  // 同じ ID が2か所にある（Finder で複製した）: 後から見つかった方に新しい ID を振る。OCR 結果は引き継ぐ
  const note = context.seenIds.has(manifest.id) ? withNewIds(manifest, folder) : manifest;
  context.seenIds.add(note.id);
  const indexed = context.index.notes.find((candidate) => candidate.id === note.id);
  if (note === manifest && indexed?.scannedModifiedAt === modifiedAt) {
    context.result.notes.push({ ...indexed, notebookId, title, directory: folder, pages: null });
    return;
  }
  const normalized = await normalizeNoteFolder(folder, note, context.shelfId, context.now);
  // 画像が1枚もないノートは一覧に出さない（フォルダは消さない。画像が戻れば次の反映で現れる）
  if (normalized.pages.length === 0) return;
  context.result.notes.push({
    id: normalized.id,
    notebookId,
    title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    scannedModifiedAt: folderModifiedAt(folder),
    directory: folder,
    pages: normalized.pages,
  });
}

/** ノートブック直下に置かれた画像を、1枚ずつ新しいノートにする（FR-X-06）。ノート名は画像のファイル名 */
async function importLooseImage(
  context: Context,
  parent: Directory,
  notebookId: NotebookId | null,
  image: File,
): Promise<void> {
  const baseName = entryName(image).replace(/\.[^.]+$/, '');
  const title = pickAvailableName(parent.list().map(entryName), baseName);
  const folder = new Directory(parent, title);
  folder.create();
  const page = await importExternalImage(
    image,
    new File(folder, pageFileName(0)),
    context.shelfId,
    context.now,
  );
  const manifest = newNoteManifest(newNoteId(), [page], context.now);
  writeManifest(folder, manifest);
  context.seenIds.add(manifest.id);
  context.result.notes.push({
    id: manifest.id,
    notebookId,
    title,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    scannedModifiedAt: folderModifiedAt(folder),
    directory: folder,
    pages: [page],
  });
}

/** 複製されたノートに新しい ID を振る。編集したページの元の画像も、新しいページ ID の名前に付け直す */
function withNewIds(manifest: NoteManifest, folder: Directory): NoteManifest {
  return {
    ...manifest,
    id: newNoteId() as NoteId,
    pages: manifest.pages.map((page) => {
      const id = newPageId();
      const original = originalImageFile(folder, page.id);
      if (page.edit && original.exists) original.rename(originalImageFile(folder, id).name);
      return { ...page, id };
    }),
  };
}

/** 同じ親の下で色が偏らないよう、見つけた兄弟の数で順番に割り当てる */
function pickColor(context: Context, parentId: NotebookId | null): NotebookColor {
  const siblingCount = context.result.notebooks.filter((n) => n.parentId === parentId).length;
  return NOTEBOOK_COLORS[siblingCount % NOTEBOOK_COLORS.length]!;
}

/**
 * フォルダの更新日時（ミリ秒）。Directory.info() は中の全ファイルのサイズを合計して遅いため、
 * File として読む（ADR 0021）
 */
export function folderModifiedAt(folder: Directory): number {
  return new File(folder.uri).modificationTime ?? 0;
}

async function guard(context: Context, uri: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    context.result.failures.push({ uri, error });
  }
}

/** ファイル操作は JS スレッドを止めるため、ときどき画面の描画・操作に順番を譲る */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
