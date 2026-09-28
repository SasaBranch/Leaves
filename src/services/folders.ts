// DB の親子関係・名前から、本棚フォルダ内の場所を求める（詳細設計書 4.5）。
// DB の名前はフォルダ名と同じ（ADR 0016）なので、祖先の名前を並べれば場所になる。
import { Directory } from 'expo-file-system';

import { listAllNotebooks } from '@/db/notebookRepository';
import { findNote } from '@/db/noteRepository';
import { isSameName } from '@/domain/name';
import { buildNotebookPath } from '@/domain/notebookPath';
import type { Note, NoteId, NotebookId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest, writeManifest, type NoteManifest } from '@/storage/manifest';
import { entryName, noteDirectory, notebookDirectory } from '@/storage/paths';

/** ノートブックのフォルダ。null は本棚の最上位（ライブラリ） */
export async function locateNotebookDirectory(
  shelf: OpenShelf,
  notebookId: NotebookId | null,
): Promise<Directory> {
  const path = buildNotebookPath(notebookId, await listAllNotebooks(shelf.db));
  return notebookDirectory(shelf.directory, path);
}

export async function locateNoteDirectory(shelf: OpenShelf, note: Note): Promise<Directory> {
  const path = buildNotebookPath(note.notebookId, await listAllNotebooks(shelf.db));
  return noteDirectory(shelf.directory, path, note.title);
}

/** ノートとそのフォルダ。DB にないノートは例外（画面が古い ID を持っていた場合など、呼び出し側の誤り） */
export async function getNoteWithDirectory(
  shelf: OpenShelf,
  noteId: NoteId,
): Promise<{ note: Note; directory: Directory }> {
  const note = await findNote(shelf.db, noteId);
  if (!note) throw new Error(`ノートがありません: ${noteId}`);
  return { note, directory: await locateNoteDirectory(shelf, note) };
}

/**
 * ノートの .leaves.json を読む。外部で消された・壊された場合は例外
 * （そのノートは次の外部変更の反映でノートブックに変わるため、アプリの操作は続けない）
 */
export function readNoteManifest(directory: Directory): NoteManifest {
  const manifest = readManifest(directory);
  if (manifest?.kind !== 'note') throw new Error(`ノートの管理用ファイルがありません: ${directory.uri}`);
  return manifest;
}

export function updateNoteManifest(
  directory: Directory,
  update: (manifest: NoteManifest) => NoteManifest,
): NoteManifest {
  const updated = update(readNoteManifest(directory));
  writeManifest(directory, updated);
  return updated;
}

/** フォルダ直下の名前（NFC）。同じ場所の重複の判定に使う */
export function listEntryNames(directory: Directory): string[] {
  return directory.exists ? directory.list().map(entryName) : [];
}

/** 同じ場所に同じ名前（大文字・小文字は区別しない）があるか。自分自身の名前は除いて渡す */
export function hasEntryNamed(directory: Directory, name: string, except?: string): boolean {
  return listEntryNames(directory).some(
    (existing) => isSameName(existing, name) && !(except !== undefined && existing === except),
  );
}
