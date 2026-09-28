import * as fs from 'fs';
import * as path from 'path';

import { Directory, Paths } from 'expo-file-system';

import { DEFAULT_SHELF_NAME } from '@/config';
import type { Db } from '@/db/db';
import type { ShelfId } from '@/domain/types';
import { readManifest } from '@/storage/manifest';

import {
  createSchemaV1TestDb,
  insertNoteRow,
  insertNotebookRow,
  insertPageRow,
  TEST_NOW,
} from '../../test/migratedTestDb';
import { nodePathOf, resetNodeFileSystem } from '../../test/nodeFileSystem';
import { migrateLegacyDataIfPresent } from './legacyMigration';

const mockLegacy = { db: null as Db | null, closed: 0 };
jest.mock('@/db/openLegacyDatabase', () => ({
  openLegacyDatabase: async () => ({
    db: mockLegacy.db,
    close: async () => {
      mockLegacy.closed++;
    },
  }),
}));
let mockShelfCount = 0;
jest.mock('@/native/randomId', () => ({ newShelfId: () => `shelf${++mockShelfCount}` }));
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

const documents = () => nodePathOf(Paths.document.uri);
const shelfPath = (...parts: string[]) => path.join(documents(), DEFAULT_SHELF_NAME, ...parts);

function writeNodeFile(relativePath: string, content: string): void {
  const target = path.join(documents(), relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** v1.0 の DB（中身は mockLegacy.db）・画像・印を置く */
async function setUpLegacyData(): Promise<Db> {
  const db = await createSchemaV1TestDb();
  mockLegacy.db = db;
  writeNodeFile('SQLite/leaves.db', '');
  writeNodeFile('image-operation-in-progress', '');
  return db;
}

/**
 * 大学/線形:代数/ の下に3ページのノート（2ページ目の画像なし）、最上位に「大学」と同じ名前のノートと、
 * 「x:y」「x.y」のノート（どちらも x.y になる）
 */
async function setUpTypicalLegacyData(): Promise<Db> {
  const db = await setUpLegacyData();
  await insertNotebookRow(db, { id: 'univ', name: '大学' });
  await insertNotebookRow(db, { id: 'linear', parentId: 'univ', name: '線形:代数' });
  await insertNoteRow(db, {
    id: 'lecture',
    notebookId: 'linear',
    title: '2026-09-28 10:30',
    updatedAt: '2026-09-29T00:00:00.000Z',
  });
  await insertPageRow(db, {
    id: 'p-last',
    noteId: 'lecture',
    position: 2,
    ocrStatus: 'processing',
  });
  await insertPageRow(db, {
    id: 'p-first',
    noteId: 'lecture',
    position: 0,
    ocrStatus: 'done',
    ocrText: '固有値',
  });
  await insertPageRow(db, { id: 'p-missing', noteId: 'lecture', position: 1 });
  await db.run(`UPDATE pages SET ocr_lines = ? WHERE id = 'p-first'`, [
    JSON.stringify([{ text: '固有値', x: 0.1, y: 0.2, width: 0.3, height: 0.05 }]),
  ]);
  await insertNoteRow(db, { id: 'same-name', title: '大学' });
  await insertNoteRow(db, { id: 'colon', title: 'x:y' });
  await insertNoteRow(db, { id: 'dot', title: 'x.y' });
  writeNodeFile('pages/p-first.jpg', 'first');
  writeNodeFile('pages/p-last.jpg', 'last!');
  writeNodeFile('thumbs/p-first.jpg', 'thumb-first');
  return db;
}

const listNames = (...parts: string[]) =>
  fs
    .readdirSync(shelfPath(...parts))
    .map((name) => name.normalize('NFC'))
    .sort();

beforeEach(() => {
  resetNodeFileSystem();
  mockLegacy.db = null;
  mockLegacy.closed = 0;
  mockShelfCount = 0;
});

test('ノートブック・ノートをフォルダとして作り、名前は使える形にして重複を避ける', async () => {
  await setUpTypicalLegacyData();

  await migrateLegacyDataIfPresent();

  expect(listNames()).toEqual(['.leaves.json', 'x.y', 'x.y (2)', '大学', '大学 (2)']);
  expect(listNames('大学')).toEqual(['.leaves.json', '線形.代数']);
  expect(listNames('大学', '線形.代数')).toEqual(['.leaves.json', '2026-09-28 10.30']);
  // 名前順に並べて先に来た方が元の名前を使う
  expect(readManifest(new Directory(Paths.document, DEFAULT_SHELF_NAME, 'x.y'))?.id).toBe('dot');
  expect(readManifest(new Directory(Paths.document, DEFAULT_SHELF_NAME, '大学'))).toEqual({
    kind: 'notebook',
    version: 1,
    id: 'univ',
    color: '#2F5D45',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  expect(readManifest(new Directory(Paths.document, DEFAULT_SHELF_NAME))).toMatchObject({
    kind: 'shelf',
    id: 'shelf1',
  });
  expect(mockLegacy.closed).toBe(1);
});

test('ページ画像を位置の順に 001.jpg … としてコピーし、画像がないページは飛ばす。OCR 結果を .leaves.json に持つ', async () => {
  await setUpTypicalLegacyData();

  await migrateLegacyDataIfPresent();

  const note = ['大学', '線形.代数', '2026-09-28 10.30'];
  expect(listNames(...note)).toEqual(['.leaves.json', '001.jpg', '002.jpg']);
  expect(fs.readFileSync(shelfPath(...note, '001.jpg'), 'utf8')).toBe('first');
  expect(fs.readFileSync(shelfPath(...note, '002.jpg'), 'utf8')).toBe('last!');
  const manifest = readManifest(new Directory(Paths.document, DEFAULT_SHELF_NAME, ...note));
  expect(manifest).toMatchObject({
    kind: 'note',
    id: 'lecture',
    createdAt: TEST_NOW,
    updatedAt: '2026-09-29T00:00:00.000Z',
  });
  if (manifest?.kind !== 'note') throw new Error('ノートの .leaves.json がありません');
  const stat = fs.statSync(shelfPath(...note, '001.jpg'));
  expect(manifest.pages).toEqual([
    {
      id: 'p-first',
      file: '001.jpg',
      size: 5,
      modifiedAt: Math.floor(stat.mtimeMs),
      width: 1800,
      height: 2400,
      ocrStatus: 'done',
      ocrText: '固有値',
      ocrLines: [{ text: '固有値', x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
      createdAt: TEST_NOW,
    },
    expect.objectContaining({ id: 'p-last', file: '002.jpg', ocrStatus: 'pending' }),
  ]);
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('p-missing'));
});

test('サムネイルを本棚の内部データにコピーし、旧データと印を消す', async () => {
  await setUpTypicalLegacyData();

  await migrateLegacyDataIfPresent();

  const thumbnail = path.join(documents(), '.leaves/shelves/shelf1/thumbs/p-first.jpg');
  expect(fs.readFileSync(thumbnail, 'utf8')).toBe('thumb-first');
  const remaining = fs.readdirSync(documents()).map((name) => name.normalize('NFC'));
  expect(remaining.sort()).toEqual(['.leaves', DEFAULT_SHELF_NAME]);
  expect(fs.readdirSync(path.join(documents(), '.leaves/work'))).toEqual([]);
});

test('本棚フォルダが既にあれば何もしない', async () => {
  await setUpTypicalLegacyData();
  fs.mkdirSync(path.join(documents(), '仕事'));

  await migrateLegacyDataIfPresent();

  expect(fs.existsSync(shelfPath())).toBe(false);
  expect(fs.existsSync(path.join(documents(), 'SQLite/leaves.db'))).toBe(true);
  expect(fs.existsSync(path.join(documents(), 'pages/p-first.jpg'))).toBe(true);
});

test('旧 DB がなければ何もしない', async () => {
  writeNodeFile('pages/p-first.jpg', 'first');

  await migrateLegacyDataIfPresent();

  expect(fs.readdirSync(documents())).toEqual(['pages']);
});

test('途中で終了した作業用フォルダが残っていても、消して最初からやり直す', async () => {
  await setUpTypicalLegacyData();
  writeNodeFile(`.leaves/work/legacy/${DEFAULT_SHELF_NAME}/大学/古い.txt`, '');
  writeNodeFile('.leaves/shelves/old-shelf/thumbs/p-first.jpg', '');

  await migrateLegacyDataIfPresent();

  expect(listNames('大学')).toEqual(['.leaves.json', '線形.代数']);
  expect(readManifest(new Directory(Paths.document, DEFAULT_SHELF_NAME))?.id).toBe(
    'shelf1' as ShelfId,
  );
  expect(fs.existsSync(path.join(documents(), '.leaves/work/legacy'))).toBe(false);
});
