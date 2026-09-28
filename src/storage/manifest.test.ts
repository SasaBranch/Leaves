import { Directory, File, Paths } from 'expo-file-system';

import type { NoteId, PageId } from '@/domain/types';

import { resetNodeFileSystem } from '../../test/nodeFileSystem';
import { newNoteManifest, readManifest, writeManifest, type PageManifest } from './manifest';

const page: PageManifest = {
  id: 'p1' as PageId,
  file: '001.jpg',
  size: 10,
  modifiedAt: 1000,
  width: 3,
  height: 4,
  ocrStatus: 'done',
  ocrText: '固有値',
  ocrLines: [{ text: '固有値', x: 0, y: 0, width: 1, height: 0.1 }],
  createdAt: '2026-09-28T00:00:00.000Z',
};

let folder: Directory;
beforeEach(() => {
  resetNodeFileSystem();
  folder = new Directory(Paths.document, 'ノート');
  folder.create();
});

test('書いたものを読める', () => {
  const manifest = newNoteManifest('n1' as NoteId, [page], '2026-09-28T00:00:00.000Z');
  writeManifest(folder, manifest);
  expect(readManifest(folder)).toEqual(manifest);
  // 一時ファイルは残らない
  expect(folder.list().map((entry) => entry.name)).toEqual(['.leaves.json']);
});

test.each([
  ['ない', null],
  ['JSON でない', '{壊れた'],
  ['知らない版', JSON.stringify({ kind: 'shelf', version: 2, id: 's', createdAt: 'x' })],
  ['知らない種類', JSON.stringify({ kind: 'folder', version: 1, id: 's', createdAt: 'x' })],
  ['ページの形が違う', JSON.stringify({ ...newNoteManifest('n' as NoteId, [], 'x'), pages: [{ id: 1 }] })],
  ['表紙色が一覧にない', JSON.stringify({ kind: 'notebook', version: 1, id: 'b', color: 'red', createdAt: 'x', updatedAt: 'x' })],
])('%s場合は null（外部で壊されても落ちない）', (_, content) => {
  if (content !== null) new File(folder, '.leaves.json').write(content);
  expect(readManifest(folder)).toBeNull();
});

test('置き換えの途中で終了していたら、書き終えた一時ファイルを読む', () => {
  const manifest = newNoteManifest('n1' as NoteId, [], '2026-09-28T00:00:00.000Z');
  new File(folder, '.leaves.json.writing').write(JSON.stringify(manifest));
  expect(readManifest(folder)).toEqual(manifest);
});
