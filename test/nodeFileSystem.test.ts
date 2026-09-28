import * as fs from 'fs';
import * as path from 'path';

import {
  Directory,
  fakeDisk,
  File,
  nodePathOf,
  Paths,
  resetNodeFileSystem,
} from './nodeFileSystem';

// 更新日時の変化を眠らずに確かめるため、先に古い日時へ戻しておく
function makeOld(directory: Directory): number {
  const old = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(nodePathOf(directory.uri), old, old);
  return old.getTime();
}

beforeEach(() => {
  resetNodeFileSystem();
});

describe('パスと URI', () => {
  it('Directory の URI は / で終わり、File は終わらない', () => {
    const dir = new Directory(Paths.document, 'shelf');
    const file = new File(dir, 'a.jpg');
    expect(dir.uri.startsWith('file://')).toBe(true);
    expect(dir.uri.endsWith('/shelf/')).toBe(true);
    expect(file.uri.endsWith('/shelf/a.jpg')).toBe(true);
    expect(dir.name).toBe('shelf');
    expect(file.name).toBe('a.jpg');
    expect(file.extension).toBe('.jpg');
    expect(file.parentDirectory.uri).toBe(dir.uri);
    expect(new File(file.uri).uri).toBe(file.uri);
  });

  it('日本語や空白を含む名前も往復できる', () => {
    const dir = new Directory(Paths.document, 'ノート 1');
    dir.create();
    expect(dir.name).toBe('ノート 1');
    expect(fs.existsSync(path.join(nodePathOf(Paths.document.uri), 'ノート 1'))).toBe(true);
    expect(new Directory(dir.uri).exists).toBe(true);
  });
});

describe('作成・一覧・削除', () => {
  it('作ったものが一覧に正しい種類で出て、削除で消える', () => {
    const dir = new Directory(Paths.document, 'shelf');
    dir.create();
    new Directory(dir, 'sub').create();
    new File(dir, 'a.txt').write('hello');

    const listed = dir.list();
    expect(listed.map((entry) => entry.name).sort()).toEqual(['a.txt', 'sub']);
    expect(listed.find((entry) => entry.name === 'sub')).toBeInstanceOf(Directory);
    expect(listed.find((entry) => entry.name === 'a.txt')).toBeInstanceOf(File);

    dir.delete();
    expect(dir.exists).toBe(false);
    expect(() => dir.delete()).toThrow('does not exist');
  });

  it('既存のフォルダの作成は idempotent なら成功し、そうでなければ失敗する', () => {
    const dir = new Directory(Paths.document, 'shelf');
    dir.create();
    expect(() => dir.create()).toThrow();
    expect(() => dir.create({ idempotent: true })).not.toThrow();
  });

  it('intermediates なしでは親の無いフォルダを作れない', () => {
    const deep = new Directory(Paths.document, 'a', 'b');
    expect(() => deep.create()).toThrow();
    deep.create({ intermediates: true });
    expect(deep.exists).toBe(true);
  });

  it('exists はファイルとフォルダを区別する', () => {
    new File(Paths.document, 'x').write('1');
    expect(new File(Paths.document, 'x').exists).toBe(true);
    expect(new Directory(Paths.document, 'x').exists).toBe(false);
  });

  it('一覧の名前は iOS と同じく NFD で返る', () => {
    const nfc = 'ガ'.normalize('NFC');
    new Directory(Paths.document, nfc).create();

    const [entry] = Paths.document.list();

    expect(entry?.name).toBe(nfc.normalize('NFD'));
    expect(entry?.name).not.toBe(nfc);
    expect(entry?.exists).toBe(true);
    expect(Paths.document.info().files).toEqual([nfc.normalize('NFD')]);
  });

  it('ドットファイルも一覧に出る', () => {
    new File(Paths.document, '.hidden').write('');
    expect(Paths.document.list().map((entry) => entry.name)).toContain('.hidden');
  });

  it('ファイルの読み書きと大きさ', async () => {
    const file = new File(Paths.document, 'a.txt');
    expect(file.size).toBe(0);
    expect(file.modificationTime).toBeNull();
    file.write('abc');
    expect(file.size).toBe(3);
    expect(await file.text()).toBe('abc');
    expect(Array.from(file.bytesSync())).toEqual([97, 98, 99]);
    expect(await file.base64()).toBe('YWJj');
    expect(file.info()).toMatchObject({ exists: true, size: 3 });
  });
});

describe('移動と名前変更', () => {
  it('既にあるフォルダへ移動するとその中に入る', async () => {
    const source = new Directory(Paths.document, 'a');
    const destination = new Directory(Paths.document, 'b');
    source.create();
    destination.create();

    const originalUri = source.uri;
    await source.move(destination);

    // 実機と同じく、移動した Directory の uri は元のまま
    expect(source.uri).toBe(originalUri);
    expect(source.exists).toBe(false);
    expect(new Directory(destination, 'a').exists).toBe(true);
  });

  it('無いフォルダへ移動するとその名前になる', async () => {
    const source = new Directory(Paths.document, 'a');
    source.create();
    new File(source, 'x.txt').write('1');
    const destination = new Directory(Paths.document, 'renamed');

    await source.move(destination);

    expect(source.uri).toBe(new Directory(Paths.document, 'a').uri);
    expect(new File(destination, 'x.txt').exists).toBe(true);
    expect(new Directory(Paths.document, 'a').exists).toBe(false);
  });

  it('ファイルをフォルダへ移動するとその中に入る', () => {
    const file = new File(Paths.document, 'a.txt');
    file.write('1');
    const dir = new Directory(Paths.document, 'dir');
    dir.create();

    file.moveSync(dir);

    expect(file.uri).toBe(new File(dir, 'a.txt').uri);
    expect(file.exists).toBe(true);
  });

  it('フォルダをファイルへは移動できない', () => {
    const dir = new Directory(Paths.document, 'dir');
    dir.create();
    expect(() => dir.moveSync(new File(Paths.document, 'f'))).toThrow();
  });

  it('移動先が既にあると失敗し、overwrite なら置き換える', async () => {
    const source = new File(Paths.document, 'a.txt');
    const target = new File(Paths.document, 'b.txt');
    source.write('new');
    target.write('old');

    await expect(source.move(target)).rejects.toThrow('exists');
    expect(target.textSync()).toBe('old');

    await source.move(target, { overwrite: true });
    expect(target.textSync()).toBe('new');
  });

  it('既にあるフォルダの中の同名フォルダへは移動できない', () => {
    const source = new Directory(Paths.document, 'a');
    source.create();
    const destination = new Directory(Paths.document, 'b');
    new Directory(destination, 'a').create({ intermediates: true });
    expect(() => source.moveSync(destination)).toThrow('exists');
  });

  it('名前変更は同名が既にあると失敗する', () => {
    const a = new Directory(Paths.document, 'a');
    a.create();
    new Directory(Paths.document, 'b').create();
    expect(() => a.rename('b')).toThrow('exists');

    a.rename('c');
    expect(a.name).toBe('c');
    expect(a.exists).toBe(true);
  });

  it('大文字小文字だけの名前変更はできる', () => {
    const note = new Directory(Paths.document, 'Note');
    note.create();
    note.rename('note');
    expect(Paths.document.list().map((entry) => entry.name)).toEqual(['note']);
  });

  it('コピーは元を残す', () => {
    const dir = new Directory(Paths.document, 'a');
    dir.create();
    new File(dir, 'x.txt').write('1');
    const copy = new Directory(Paths.document, 'copy');

    dir.copySync(copy);

    expect(dir.exists).toBe(true);
    expect(new File(copy, 'x.txt').textSync()).toBe('1');
    expect(dir.uri).toBe(new Directory(Paths.document, 'a').uri);
  });
});

describe('フォルダの更新日時', () => {
  let dir: Directory;
  let old: number;

  beforeEach(() => {
    dir = new Directory(Paths.document, 'shelf');
    dir.create();
    new File(dir, 'a.txt').write('1');
    old = makeOld(dir);
    expect(dir.info().modificationTime).toBe(old);
  });

  it('中身を追加すると変わる', () => {
    new File(dir, 'b.txt').write('2');
    expect(dir.info().modificationTime).toBeGreaterThan(old);
  });

  it('中身の名前を変えると変わる', () => {
    new File(dir, 'a.txt').rename('c.txt');
    expect(dir.info().modificationTime).toBeGreaterThan(old);
  });

  it('中身を消すと変わる', () => {
    new File(dir, 'a.txt').delete();
    expect(dir.info().modificationTime).toBeGreaterThan(old);
  });
});

describe('resetNodeFileSystem', () => {
  it('中身を消し、空き容量を戻す', () => {
    new File(Paths.document, 'a.txt').write('1');
    new File(Paths.cache, 'b.txt').write('1');
    fakeDisk.availableDiskSpace = 0;

    resetNodeFileSystem();

    expect(Paths.document.list()).toEqual([]);
    expect(Paths.cache.list()).toEqual([]);
    expect(Paths.document.exists).toBe(true);
    expect(Paths.availableDiskSpace).toBe(1024 * 1024 * 1024);
  });
});
