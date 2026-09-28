import fs from 'node:fs';
import path from 'node:path';

import { Directory, Paths } from 'expo-file-system';

import type { OpenShelf } from '@/state/openShelf';
import { readManifest } from '@/storage/manifest';

import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf, TEST_SHELF_NAME } from '../../test/testShelf';
import { createShelf, listShelves, locateOpenShelf, renameShelf } from './shelves';

jest.mock('@/db/openShelfDatabase', () => ({ openShelfDatabase: jest.fn() }));
jest.mock('@/native/textRecognizer', () => ({ recognizeText: jest.fn() }));
jest.mock('@/native/randomId', () => {
  let count = 0;
  return { newShelfId: () => `shelf-new-${++count}` };
});

let shelf: OpenShelf;
beforeEach(async () => {
  shelf = await createTestShelf();
});

const documentsPath = (...parts: string[]) => path.join(nodePathOf(Paths.document.uri), ...parts);

describe('locateOpenShelf（開いている本棚が外部で変わったか）', () => {
  test('変わっていなければ unchanged', () => {
    expect(locateOpenShelf(shelf)).toEqual({ kind: 'unchanged' });
  });

  test('外部で名前を変えられたら、同じ ID の本棚を新しい名前で返す', () => {
    fs.renameSync(documentsPath(TEST_SHELF_NAME), documentsPath('大学'));
    expect(locateOpenShelf(shelf)).toEqual({
      kind: 'renamed',
      shelf: { id: shelf.id, name: '大学' },
    });
  });

  test('外部で消されたら、次に開く本棚を返す', () => {
    createShelf('仕事');
    fs.rmSync(documentsPath(TEST_SHELF_NAME), { recursive: true });
    expect(locateOpenShelf(shelf)).toEqual({
      kind: 'deleted',
      next: { id: 'shelf-new-1', name: '仕事' },
    });
  });

  test('消されて本棚が1つも残っていなければ、次に開く本棚は null', () => {
    fs.rmSync(documentsPath(TEST_SHELF_NAME), { recursive: true });
    expect(locateOpenShelf(shelf)).toEqual({ kind: 'deleted', next: null });
  });

  test('消された後に同じ名前の別のフォルダが作られても、別の本棚とみなす（ID で判定）', () => {
    fs.rmSync(documentsPath(TEST_SHELF_NAME), { recursive: true });
    fs.mkdirSync(documentsPath(TEST_SHELF_NAME));
    const location = locateOpenShelf(shelf);
    expect(location.kind).toBe('deleted');
  });
});

describe('本棚の作成・名前変更', () => {
  test('作成すると Documents 直下にフォルダと .leaves.json ができ、一覧に名前順で出る', () => {
    createShelf('仕事');
    expect(listShelves().map((entry) => entry.name)).toEqual(
      ['テスト本棚', '仕事'].sort((a, b) => a.localeCompare(b)),
    );
    expect(readManifest(new Directory(Paths.document, '仕事'))?.kind).toBe('shelf');
  });

  test('同じ名前（大文字・小文字の違いを含む）は duplicateShelfName', () => {
    createShelf('Work');
    expect(() => createShelf('work')).toThrow(
      expect.objectContaining({ kind: 'duplicateShelfName' }),
    );
  });

  test('名前を変えるとフォルダの名前が変わり、ID は変わらない', () => {
    const renamed = renameShelf({ id: shelf.id, name: TEST_SHELF_NAME }, '大学');
    expect(renamed).toEqual({ id: shelf.id, name: '大学' });
    expect(fs.existsSync(documentsPath('大学'))).toBe(true);
    expect(listShelves()).toEqual([{ id: shelf.id, name: '大学' }]);
  });
});
