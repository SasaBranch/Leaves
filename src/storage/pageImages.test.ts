import { Directory, File, Paths } from 'expo-file-system';

import { AppError } from '@/domain/errors';
import type { CapturedImage, ShelfId } from '@/domain/types';

import { fakeImageManipulator } from '../../test/fakeImageManipulator';
import { fakeDisk, resetNodeFileSystem } from '../../test/nodeFileSystem';
import {
  discardCapturedImages,
  importExternalImage,
  renumberPageFiles,
  resizeToFitWithin,
  storePageImages,
} from './pageImages';
import { thumbnailFile } from './paths';

jest.mock('@/native/randomId', () => {
  let count = 0;
  return { newPageId: () => `page${count++}` };
});

const SHELF_ID = 'shelf' as ShelfId;
const NOW = '2026-09-28T00:00:00.000Z';

let note: Directory;
beforeEach(() => {
  resetNodeFileSystem();
  fakeImageManipulator.reset();
  note = new Directory(Paths.document, '本棚', 'ノート');
  note.create({ intermediates: true });
});

function captured(name: string, content = name): CapturedImage {
  const file = new File(Paths.cache, name);
  file.write(content);
  return { uri: file.uri, width: 3000, height: 4000 };
}

const namesIn = (directory: Directory) => directory.list().map((entry) => entry.name).sort();

test('ページ画像を番号のファイル名で、サムネイルをページ ID で保存し、.leaves.json 用の情報を返す', async () => {
  const pages = await storePageImages([captured('a'), captured('b')], note, 2, SHELF_ID, NOW);

  expect(namesIn(note)).toEqual(['003.jpg', '004.jpg']);
  expect(pages.map((page) => [page.file, page.width, page.height, page.ocrStatus])).toEqual([
    ['003.jpg', 1800, 2400, 'pending'],
    ['004.jpg', 1800, 2400, 'pending'],
  ]);
  expect(pages[0]?.size).toBeGreaterThan(0);
  expect(pages.every((page) => thumbnailFile(SHELF_ID, page.id).exists)).toBe(true);
  // 長辺 2400px（ページ画像）と 480px（サムネイル）に縮める
  expect(fakeImageManipulator.resizeCalls).toEqual([
    { height: 2400 },
    { height: 480 },
    { height: 2400 },
    { height: 480 },
  ]);
});

test('途中で失敗したら、それまでに保存したファイルを消して例外を投げる', async () => {
  fakeImageManipulator.failOnSave = 3; // 2枚目のページ画像
  await expect(
    storePageImages([captured('a'), captured('b')], note, 0, SHELF_ID, NOW),
  ).rejects.toThrow('変換に失敗');
  expect(namesIn(note)).toEqual([]);
  expect(thumbnailFile(SHELF_ID, 'page0' as never).exists).toBe(false);
});

test('空き容量が足りなければ、何も書かずに storageFull を投げる', async () => {
  fakeDisk.availableDiskSpace = 0;
  await expect(storePageImages([captured('a')], note, 0, SHELF_ID, NOW)).rejects.toThrow(
    new AppError('storageFull'),
  );
  expect(namesIn(note)).toEqual([]);
});

test('外部で置かれた画像を JPEG にして取り込み、元のファイルを消す', async () => {
  const source = new File(note, 'scan.png');
  source.write('png');
  const page = await importExternalImage(source, new File(note, '001.jpg'), SHELF_ID, NOW);
  expect(namesIn(note)).toEqual(['001.jpg']);
  expect(page.file).toBe('001.jpg');
  expect(new File(note, '001.jpg').textSync()).toBe('png');
});

test('renumberPageFiles: 並びの順に 001.jpg … へ付け直す（名前がぶつかる入れ替えでも）', () => {
  const files: [string, string][] = [
    ['001.jpg', 'one'],
    ['002.jpg', 'two'],
    ['zz.jpg', 'three'],
  ];
  for (const [name, content] of files) new File(note, name).write(content);
  expect(renumberPageFiles(note, ['002.jpg', 'zz.jpg', '001.jpg'])).toEqual([
    '001.jpg',
    '002.jpg',
    '003.jpg',
  ]);
  expect(['001.jpg', '002.jpg', '003.jpg'].map((name) => new File(note, name).textSync())).toEqual([
    'two',
    'three',
    'one',
  ]);
});

test('resizeToFitWithin: 長辺だけを指定し、小さい画像は拡大しない', () => {
  expect(resizeToFitWithin({ width: 3000, height: 4000 }, 2400)).toEqual({ height: 2400 });
  expect(resizeToFitWithin({ width: 4000, height: 3000 }, 2400)).toEqual({ width: 2400 });
  expect(resizeToFitWithin({ width: 1000, height: 800 }, 2400)).toBeNull();
});

test('discardCapturedImages: 一時画像を消す（ないものは無視する）', () => {
  const image = captured('a');
  discardCapturedImages([image, { uri: new File(Paths.cache, 'none').uri, width: 1, height: 1 }]);
  expect(new File(image.uri).exists).toBe(false);
});
