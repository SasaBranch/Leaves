import { AppError } from '@/domain/errors';
import type { CapturedImage } from '@/domain/types';

import { fakeDisk, fakeFiles } from '../../test/fakeFileSystem';
import {
  clearImageOperationMark,
  deletePageImages,
  discardCapturedImages,
  listStoredPageIds,
  resizeToFitWithin,
  storePageImages,
  wasImageOperationInterrupted,
  withImageOperation,
} from './pageImages';

jest.mock('expo-file-system', () => jest.requireActual('../../test/fakeFileSystem'));

// jest.mock の中から参照できるのは mock で始まる名前だけのため、偽物の状態をまとめて持つ
const mockState = {
  nextId: 0,
  resizeCalls: [] as unknown[],
  failOnSave: null as number | null,
  saveCount: 0,
};

jest.mock('@/native/randomId', () => ({ newPageId: () => `page${mockState.nextId++}` }));

// 画像変換の偽物: 変換結果を一時ファイルとして「作り」、どの指定で変換されたかを記録する
jest.mock('expo-image-manipulator', () => {
  const { fakeFiles: mockFiles } = jest.requireActual('../../test/fakeFileSystem');
  return {
    SaveFormat: { JPEG: 'jpeg' },
    ImageManipulator: {
      manipulate: () => {
        let size = { width: 3000, height: 4000 };
        const context = {
          resize: (spec: { width?: number; height?: number }) => {
            mockState.resizeCalls.push(spec);
            size = spec.height ? { width: (3000 * spec.height) / 4000, height: spec.height } : size;
            return context;
          },
          renderAsync: async () => ({
            saveAsync: async () => {
              mockState.saveCount += 1;
              if (mockState.failOnSave === mockState.saveCount) throw new Error('変換に失敗');
              const uri = `cache/tmp${mockState.saveCount}.jpg`;
              mockFiles.add(uri);
              return { uri, ...size };
            },
          }),
        };
        return context;
      },
    },
  };
});

const captured = (name: string): CapturedImage => ({
  uri: `cache/capture/${name}`,
  width: 3000,
  height: 4000,
});

beforeEach(() => {
  fakeFiles.clear();
  fakeDisk.availableDiskSpace = 1024 * 1024 * 1024;
  mockState.resizeCalls.length = 0;
  mockState.failOnSave = null;
  mockState.saveCount = 0;
  mockState.nextId = 0;
});

test('ページ画像とサムネイルをページ ID のファイル名で保存し、サイズを返す', async () => {
  const stored = await storePageImages([captured('a.jpg'), captured('b.jpg')]);
  expect(stored).toEqual([
    { id: 'page0', width: 1800, height: 2400 },
    { id: 'page1', width: 1800, height: 2400 },
  ]);
  expect([...fakeFiles].sort()).toEqual([
    'doc/pages/page0.jpg',
    'doc/pages/page1.jpg',
    'doc/thumbs/page0.jpg',
    'doc/thumbs/page1.jpg',
  ]);
  expect(mockState.resizeCalls).toEqual([
    { height: 2400 },
    { height: 480 },
    { height: 2400 },
    { height: 480 },
  ]);
});

test('途中で失敗したら、それまでに保存したファイルを消して例外を投げる', async () => {
  mockState.failOnSave = 4; // 2枚目のサムネイルで失敗
  await expect(storePageImages([captured('a.jpg'), captured('b.jpg')])).rejects.toThrow(
    '変換に失敗',
  );
  const remainingSavedImages = [...fakeFiles].filter((file) => file.startsWith('doc/'));
  expect(remainingSavedImages).toEqual([]);
});

test('空き容量が足りなければ、何も書かずに storageFull を投げる', async () => {
  fakeDisk.availableDiskSpace = 1024;
  await expect(storePageImages([captured('a.jpg')])).rejects.toEqual(new AppError('storageFull'));
  expect(fakeFiles.size).toBe(0);
});

test('resizeToFitWithin: 長辺だけを指定し、小さい画像は拡大しない', () => {
  expect(resizeToFitWithin({ width: 3000, height: 4000 }, 2400)).toEqual({ height: 2400 });
  expect(resizeToFitWithin({ width: 4000, height: 3000 }, 2400)).toEqual({ width: 2400 });
  expect(resizeToFitWithin({ width: 1200, height: 1600 }, 2400)).toBeNull();
  expect(resizeToFitWithin({ width: 2400, height: 2400 }, 2400)).toBeNull();
});

test('listStoredPageIds と deletePageImages: 片方だけ残った画像も見つけて消せる', () => {
  fakeFiles.add('doc/pages/p1.jpg');
  fakeFiles.add('doc/thumbs/p1.jpg');
  fakeFiles.add('doc/thumbs/p2.jpg'); // ページ画像のないサムネイル
  fakeFiles.add('doc/pages/.DS_Store');
  expect(listStoredPageIds().sort()).toEqual(['p1', 'p2']);
  deletePageImages(['p1', 'p2'] as never);
  expect([...fakeFiles]).toEqual(['doc/pages/.DS_Store']);
});

test('discardCapturedImages: 一時画像を消す', () => {
  fakeFiles.add('cache/capture/a.jpg');
  discardCapturedImages([captured('a.jpg')]);
  expect(fakeFiles.size).toBe(0);
});

test('withImageOperation: 実行中は印を残し、終わったら（失敗しても）消す', async () => {
  let markedDuringOperation = false;
  await withImageOperation(async () => {
    markedDuringOperation = wasImageOperationInterrupted();
  });
  expect(markedDuringOperation).toBe(true);
  expect(wasImageOperationInterrupted()).toBe(false);

  await expect(
    withImageOperation(async () => {
      throw new Error('失敗');
    }),
  ).rejects.toThrow('失敗');
  expect(wasImageOperationInterrupted()).toBe(false);
});

test('withImageOperation: 重なって実行されたときは、最後の操作が終わるまで印を消さない', async () => {
  let finishFirst = () => {};
  const first = withImageOperation(() => new Promise<void>((resolve) => (finishFirst = resolve)));
  await withImageOperation(async () => {});
  expect(wasImageOperationInterrupted()).toBe(true);
  finishFirst();
  await first;
  expect(wasImageOperationInterrupted()).toBe(false);
});

test('clearImageOperationMark: 前回の実行で残った印を消す', () => {
  fakeFiles.add('doc/image-operation-in-progress');
  expect(wasImageOperationInterrupted()).toBe(true);
  clearImageOperationMark();
  expect(wasImageOperationInterrupted()).toBe(false);
});
