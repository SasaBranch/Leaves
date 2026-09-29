import fs from 'node:fs';
import path from 'node:path';

import { Directory, Paths } from 'expo-file-system';

import type { OpenShelf } from '@/state/openShelf';
import { readAppSettings } from '@/storage/appSettings';
import { readManifest } from '@/storage/manifest';

import { nodePathOf } from '../../test/nodeFileSystem';
import { createTestShelf, TEST_SHELF_NAME } from '../../test/testShelf';

import {
  createShelf,
  deleteShelfWithContents,
  listShelves,
  locateOpenShelf,
  moveShelf,
  openFolderAsShelf,
  removeShelfFromList,
  renameShelf,
  shelfParentFolderName,
} from './shelves';

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
      shelf: { id: shelf.id, name: '大学', location: 'app', available: true },
    });
  });

  test('外部で消されたら、次に開く本棚を返す', () => {
    createShelf('仕事');
    fs.rmSync(documentsPath(TEST_SHELF_NAME), { recursive: true });
    expect(locateOpenShelf(shelf)).toEqual({
      kind: 'deleted',
      next: { id: 'shelf-new-1', name: '仕事', location: 'app', available: true },
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
    const renamed = renameShelf(
      { id: shelf.id, name: TEST_SHELF_NAME, location: 'app', available: true },
      '大学',
    );
    expect(renamed).toEqual({ id: shelf.id, name: '大学', location: 'app', available: true });
    expect(fs.existsSync(documentsPath('大学'))).toBe(true);
    expect(listShelves()).toEqual([
      { id: shelf.id, name: '大学', location: 'app', available: true },
    ]);
  });
});

describe('別の場所の本棚（FR-L-01〜05）', () => {
  /** 「ファイル」アプリで選べるアプリ外のフォルダ（テストでは Documents の外） */
  function externalFolder(name: string): Directory {
    const folder = new Directory(Paths.cache, 'iCloud Drive', name);
    folder.create({ intermediates: true, idempotent: true });
    return folder;
  }

  test('選んだ場所の中に本棚を作ると、一覧に別の場所の本棚として出る（再び読んでも開ける）', () => {
    const created = createShelf('大学', externalFolder('書類'));
    expect(created.location).toBe('external');
    expect(
      fs.existsSync(path.join(nodePathOf(externalFolder('書類').uri), '大学', '.leaves.json')),
    ).toBe(true);
    expect(listShelves().map((entry) => [entry.name, entry.location, entry.available])).toEqual(
      [
        ['テスト本棚', 'app', true],
        ['大学', 'external', true],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    expect(readAppSettings().externalShelves.map((entry) => entry.id)).toEqual([created.id]);
  });

  test('本棚の名前は、場所が違っても重ならない（FR-V-06）', () => {
    expect(() => createShelf(TEST_SHELF_NAME, externalFolder('書類'))).toThrow(
      expect.objectContaining({ kind: 'duplicateShelfName' }),
    );
  });

  test('既存のフォルダを本棚として開く: Leaves の本棚でなければ新しい ID を振る（FR-L-02）', () => {
    const folder = externalFolder('Mac で作ったフォルダ');
    const opened = openFolderAsShelf(folder);
    expect(opened).toMatchObject({
      name: 'Mac で作ったフォルダ',
      location: 'external',
      available: true,
    });
    expect(readManifest(folder)).toMatchObject({ kind: 'shelf', id: opened.id });
  });

  test('同じ本棚をもう一度開いても、一覧に二重に入らない', () => {
    const created = createShelf('大学', externalFolder('書類'));
    const again = openFolderAsShelf(new Directory(externalFolder('書類'), '大学'));
    expect(again.id).toBe(created.id);
    expect(readAppSettings().externalShelves).toHaveLength(1);
  });

  test('Finder で複製した本棚を開くと、別の本棚として新しい ID を振る', () => {
    const created = createShelf('大学', externalFolder('書類'));
    fs.cpSync(
      path.join(nodePathOf(externalFolder('書類').uri), '大学'),
      path.join(nodePathOf(externalFolder('書類').uri), '大学のコピー'),
      { recursive: true },
    );
    const copy = openFolderAsShelf(new Directory(externalFolder('書類'), '大学のコピー'));
    expect(copy.id).not.toBe(created.id);
  });

  test('場所にアクセスできない本棚は一覧から消さず、開けない本棚として出す（FR-L-04）', () => {
    const created = createShelf('大学', externalFolder('書類'));
    fs.rmSync(path.join(nodePathOf(externalFolder('書類').uri), '大学'), { recursive: true });
    expect(listShelves().find((entry) => entry.id === created.id)).toMatchObject({
      name: '大学',
      available: false,
    });
  });

  test('アクセスできなくなった本棚を、選び直したフォルダで同じ本棚として開き直せる', () => {
    const created = createShelf('大学', externalFolder('書類'));
    fs.renameSync(
      path.join(nodePathOf(externalFolder('書類').uri), '大学'),
      path.join(nodePathOf(externalFolder('移した先').uri), '大学'),
    );
    const reopened = openFolderAsShelf(new Directory(externalFolder('移した先'), '大学'));
    expect(reopened.id).toBe(created.id);
    expect(listShelves().find((entry) => entry.id === created.id)?.available).toBe(true);
  });

  test('アプリ内の本棚を別の場所へ移すと、中身ごと移り、ID は変わらない（FR-L-03）', async () => {
    fs.writeFileSync(path.join(nodePathOf(shelf.directory.uri), 'メモ.txt'), 'x');
    const appShelf = listShelves()[0]!;
    const moved = await moveShelf(appShelf, externalFolder('iCloud'));
    expect(moved).toMatchObject({ id: appShelf.id, location: 'external', available: true });
    expect(fs.existsSync(documentsPath(TEST_SHELF_NAME))).toBe(false);
    expect(
      fs.readFileSync(
        path.join(nodePathOf(externalFolder('iCloud').uri), TEST_SHELF_NAME, 'メモ.txt'),
        'utf8',
      ),
    ).toBe('x');
    expect(listShelves().map((entry) => entry.location)).toEqual(['external']);
  });

  test('別の場所の本棚をアプリ内へ移すと、一覧の参照から外れる', async () => {
    const created = createShelf('大学', externalFolder('書類'));
    const moved = await moveShelf(created, new Directory(Paths.document));
    expect(moved.location).toBe('app');
    expect(readAppSettings().externalShelves).toEqual([]);
    expect(fs.existsSync(documentsPath('大学'))).toBe(true);
  });

  test('移動先に同じ名前があれば duplicateShelfName で、元のまま残る', async () => {
    const appShelf = listShelves()[0]!;
    const destination = externalFolder('iCloud');
    new Directory(destination, TEST_SHELF_NAME).create();
    await expect(moveShelf(appShelf, destination)).rejects.toMatchObject({
      kind: 'duplicateShelfName',
    });
    expect(fs.existsSync(documentsPath(TEST_SHELF_NAME))).toBe(true);
  });

  test('入っているフォルダの名前を返す。アプリ内・アクセスできない・iCloud Drive の一番上は null（FR-L-07）', () => {
    const inFolder = createShelf('大学', externalFolder('書類'));
    expect(shelfParentFolderName(inFolder)).toBe('書類');
    expect(shelfParentFolderName(listShelves().find((entry) => entry.location === 'app')!)).toBe(
      null,
    );
    const atICloudRoot = createShelf('仕事', externalFolder('com~apple~CloudDocs'));
    expect(shelfParentFolderName(atICloudRoot)).toBe(null);
    fs.rmSync(path.join(nodePathOf(externalFolder('書類').uri), '大学'), { recursive: true });
    const unavailable = listShelves().find((entry) => entry.id === inFolder.id)!;
    expect(shelfParentFolderName(unavailable)).toBe(null);
  });

  test('一覧から外すとフォルダは残り、削除するとフォルダごと消える（FR-L-05）', () => {
    const kept = createShelf('残す', externalFolder('書類'));
    removeShelfFromList(kept);
    expect(listShelves().some((entry) => entry.id === kept.id)).toBe(false);
    expect(fs.existsSync(path.join(nodePathOf(externalFolder('書類').uri), '残す'))).toBe(true);

    const removed = createShelf('消す', externalFolder('書類'));
    deleteShelfWithContents(removed);
    expect(fs.existsSync(path.join(nodePathOf(externalFolder('書類').uri), '消す'))).toBe(false);
    expect(readAppSettings().externalShelves).toEqual([]);
  });
});
