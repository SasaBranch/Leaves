import * as fs from 'fs';
import * as path from 'path';

import { Directory } from 'expo-file-system';

import { insertNote } from '@/db/noteRepository';
import { insertPage } from '@/db/pageRepository';
import type { PageId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest } from '@/storage/manifest';
import { pageImageFile, thumbnailFile, workDirectory } from '@/storage/paths';

import { buildNote, buildPage } from '../../test/builders';
import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf } from '../../test/testShelf';
import { ROOT_NOTEBOOK_NAME, seedTestData } from './seedTestData';

let mockIdCount = 0;
jest.mock('@/native/randomId', () => ({
  newNotebookId: () => `notebook${mockIdCount++}`,
  newNoteId: () => `note${mockIdCount++}`,
  newPageId: () => `page${mockIdCount++}`,
}));
// 索引への登録は外部変更の反映の仕事なので、ここでは呼ばれることだけを見る
const mockSyncShelf = jest.fn(async (_shelf: OpenShelf) => undefined);
jest.mock('@/services/sync/syncShelf', () => ({
  syncShelf: (shelf: OpenShelf) => mockSyncShelf(shelf),
}));

const SMALL_SEED = { noteCount: 20, pagesPerNote: 3 };

beforeEach(() => {
  mockIdCount = 0;
  mockSyncShelf.mockClear();
});

const rootDirectory = (shelf: OpenShelf) => new Directory(shelf.directory, ROOT_NOTEBOOK_NAME);
const childNames = (directory: Directory) =>
  fs
    .readdirSync(nodePathOf(directory.uri))
    .map((name) => name.normalize('NFC'))
    .filter((name) => !name.startsWith('.'))
    .sort();
const listTestNotes = (shelf: OpenShelf) =>
  childNames(rootDirectory(shelf)).flatMap((child) =>
    childNames(new Directory(rootDirectory(shelf), child)).map(
      (title) => new Directory(rootDirectory(shelf), child, title),
    ),
  );

test('seedTestData: テストデータの下に子ノートブックとノートのフォルダを作り、外部変更の反映を呼ぶ', async () => {
  const shelf = await createTestShelf();

  await seedTestData(shelf, SMALL_SEED);

  const root = rootDirectory(shelf);
  expect(readManifest(root)?.kind).toBe('notebook');
  const children = childNames(root);
  expect(children).toHaveLength(10);
  expect(children[0]).toBe('ノートブック 01');
  const notes = listTestNotes(shelf);
  expect(notes).toHaveLength(20);
  const updatedAts = notes.map((note) => {
    const manifest = readManifest(note);
    return manifest?.kind === 'note' ? manifest.updatedAt : null;
  });
  expect(new Set(updatedAts).size).toBe(20);
  expect(mockSyncShelf).toHaveBeenCalledWith(shelf);
  // 作業用フォルダは残さない
  expect(fs.readdirSync(nodePathOf(workDirectory().uri))).toEqual([]);
});

test('seedTestData: ページ画像 001.jpg …・サムネイル・OCR 済みの本文を作る', async () => {
  const shelf = await createTestShelf();

  await seedTestData(shelf, SMALL_SEED);

  for (const note of listTestNotes(shelf)) {
    const manifest = readManifest(note);
    if (manifest?.kind !== 'note') throw new Error('ノートの .leaves.json がありません');
    expect(childNames(note)).toEqual(['001.jpg', '002.jpg', '003.jpg']);
    expect(manifest.pages.map((page) => page.file)).toEqual(['001.jpg', '002.jpg', '003.jpg']);
    for (const page of manifest.pages) {
      expect(page).toMatchObject({ ocrStatus: 'done', width: 1800, height: 2400 });
      expect(page.ocrText.length).toBe(400);
      expect(page.size).toBeGreaterThan(0);
      expect(thumbnailFile(shelf.id, page.id).exists).toBe(true);
    }
  }
});

test('seedTestData: 既存ページのサムネイルがあれば、それを見本にする', async () => {
  const shelf = await createTestShelf();
  await insertNote(shelf.db, buildNote({ id: 'existing-note' }));
  await insertPage(shelf.db, buildPage({ id: 'existing-page', noteId: 'existing-note' }));
  const existing = thumbnailFile(shelf.id, 'existing-page' as PageId);
  fs.mkdirSync(path.dirname(nodePathOf(existing.uri)), { recursive: true });
  fs.writeFileSync(nodePathOf(existing.uri), 'existing-thumbnail');

  await seedTestData(shelf, { noteCount: 1, pagesPerNote: 1 });

  const [note] = listTestNotes(shelf);
  expect(pageImageFile(note!, 0).textSync()).toBe('existing-thumbnail');
});

test('seedTestData: テストデータが既にあれば、何も作らずに失敗する', async () => {
  const shelf = await createTestShelf();
  await seedTestData(shelf, SMALL_SEED);
  mockSyncShelf.mockClear();

  await expect(seedTestData(shelf, SMALL_SEED)).rejects.toThrow(/既にあります/);

  expect(listTestNotes(shelf)).toHaveLength(20);
  expect(mockSyncShelf).not.toHaveBeenCalled();
});
