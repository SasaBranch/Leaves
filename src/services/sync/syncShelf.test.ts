import fs from 'node:fs';
import path from 'node:path';

import { Directory, File, Paths } from 'expo-file-system';

import { listAllNotebooks } from '@/db/notebookRepository';
import { findNote, listNoteSummaries } from '@/db/noteRepository';
import { findPage, listPagesOfNote } from '@/db/pageRepository';
import type { CapturedImage, NoteId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { readManifest, writeManifest, type NoteManifest } from '@/storage/manifest';
import { thumbnailFile } from '@/storage/paths';

import { createMigratedTestDb } from '../../../test/migratedTestDb';
import { nodePathOf } from '../../../test/nodeFileSystem';
import { createTestShelf } from '../../../test/testShelf';
import { createNoteFromCapture } from '../capture';
import { createNotebook } from '../notebooks';

import { syncShelf } from './syncShelf';

jest.mock('@/native/randomId', () => {
  let count = 0;
  return {
    newNotebookId: () => `notebook-${++count}`,
    newNoteId: () => `note-${++count}`,
    newPageId: () => `page-${++count}`,
    newShelfId: () => `shelf-${++count}`,
  };
});
jest.mock('@/native/textRecognizer', () => ({ recognizeText: jest.fn() }));

let shelf: OpenShelf;
beforeEach(async () => {
  shelf = await createTestShelf();
});

// ---- 外部変更を起こす道具（node の fs で本棚フォルダを直接書き換える＝「ファイル」アプリ・Finder の操作） ----

const shelfPath = (...parts: string[]) => path.join(nodePathOf(shelf.directory.uri), ...parts);

/** フォルダの更新日時の比較が確実に変わるよう、少し待ってから書き換える */
async function externally(change: () => void): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  change();
}

function capturedImage(name: string, content = name): CapturedImage {
  const file = new File(Paths.cache, name);
  file.write(content);
  return { uri: file.uri, width: 3000, height: 4000 };
}

async function captureNote(title: string, pageContents: string[], notebookId = null) {
  const images = pageContents.map((content, index) =>
    capturedImage(`${title}-${index}.jpg`, content),
  );
  return createNoteFromCapture(shelf, { images, title, notebookId });
}

/** OCR が済んだ状態にする（引き継がれることを確かめるため） */
function markOcrDone(noteFolder: string[], text: string) {
  const directory = new Directory(shelf.directory, ...noteFolder);
  const manifest = readManifest(directory) as NoteManifest;
  writeManifest(directory, {
    ...manifest,
    pages: manifest.pages.map((page) => ({ ...page, ocrStatus: 'done', ocrText: text })),
  });
}

const titles = async () =>
  (await listNoteSummaries(shelf.db, null, 'name')).map((note) => note.title);

// ---- テスト ----

test('変更がなければ DB は変わらず、2回続けても同じ（冪等）', async () => {
  const noteId = await captureNote('講義', ['a', 'b']);
  await syncShelf(shelf);
  const before = await listPagesOfNote(shelf.db, noteId);
  await syncShelf(shelf);
  expect(await listPagesOfNote(shelf.db, noteId)).toEqual(before);
  expect(await titles()).toEqual(['講義']);
});

test('外部で作られたフォルダはノートブックになり、直下の画像は1枚ずつノートになる（FR-X-06）', async () => {
  await externally(() => {
    fs.mkdirSync(shelfPath('旅行'));
    fs.writeFileSync(shelfPath('旅行', 'レシート.PNG'), 'png');
    fs.writeFileSync(shelfPath('旅行', 'メモ.txt'), '対応しないファイル');
  });
  await syncShelf(shelf);

  const [notebook] = await listAllNotebooks(shelf.db);
  expect(notebook?.name).toBe('旅行');
  const [note] = await listNoteSummaries(shelf.db, notebook!.id, 'name');
  expect(note?.title).toBe('レシート');
  expect(fs.readdirSync(shelfPath('旅行', 'レシート')).sort()).toEqual(['.leaves.json', '001.jpg']);
  // 元の画像は取り込んだので消え、対応しないファイルは残る（FR-X-08）
  expect(fs.readdirSync(shelfPath('旅行')).sort()).toEqual([
    '.leaves.json',
    'メモ.txt',
    'レシート',
  ]);
  expect((await listPagesOfNote(shelf.db, note!.id))[0]?.ocrStatus).toBe('pending');
});

test('外部で名前を変えたノートは同じノートとして扱い、OCR 結果を引き継ぐ（FR-X-07）', async () => {
  const noteId = await captureNote('講義', ['a']);
  markOcrDone(['講義'], '固有値');
  await syncShelf(shelf);
  await externally(() => fs.renameSync(shelfPath('講義'), shelfPath('線形代数 第3回')));
  await syncShelf(shelf);

  expect((await findNote(shelf.db, noteId))?.title).toBe('線形代数 第3回');
  expect((await listPagesOfNote(shelf.db, noteId))[0]).toMatchObject({
    ocrStatus: 'done',
    ocrText: '固有値',
  });
});

test('外部でノートを別のノートブックへ移すと、所属が変わる', async () => {
  const noteId = await captureNote('講義', ['a']);
  const notebookId = await createNotebook(shelf, '大学', null);
  await syncShelf(shelf);
  await externally(() => fs.renameSync(shelfPath('講義'), shelfPath('大学', '講義')));
  await syncShelf(shelf);
  expect((await findNote(shelf.db, noteId))?.notebookId).toBe(notebookId);
});

test('外部で消されたノートは DB から消え、サムネイルも消える', async () => {
  const noteId = await captureNote('講義', ['a']);
  const [page] = await listPagesOfNote(shelf.db, noteId);
  expect(thumbnailFile(shelf.id, page!.id).exists).toBe(true);
  await externally(() => fs.rmSync(shelfPath('講義'), { recursive: true }));
  await syncShelf(shelf);
  expect(await findNote(shelf.db, noteId)).toBeNull();
  expect(thumbnailFile(shelf.id, page!.id).exists).toBe(false);
});

test('ノートのフォルダに画像を足す・ファイル名で並べ替えると、ページに反映される（FR-X-05）', async () => {
  const noteId = await captureNote('講義', ['one', 'two']);
  markOcrDone(['講義'], '既存');
  await syncShelf(shelf);
  const [first, second] = await listPagesOfNote(shelf.db, noteId);
  await externally(() => {
    // 2ページ目を先頭に回し（000 は 001 より前）、新しい画像を末尾に足す
    fs.renameSync(shelfPath('講義', '002.jpg'), shelfPath('講義', '000.jpg'));
    fs.writeFileSync(shelfPath('講義', 'zz-追加.heic'), 'new');
  });
  await syncShelf(shelf);

  const pages = await listPagesOfNote(shelf.db, noteId);
  expect(pages.map((page) => page.id).slice(0, 2)).toEqual([second!.id, first!.id]);
  expect(pages[0]?.ocrText).toBe('既存');
  expect(pages[2]?.ocrStatus).toBe('pending');
  expect(fs.readdirSync(shelfPath('講義')).sort()).toEqual([
    '.leaves.json',
    '001.jpg',
    '002.jpg',
    '003.jpg',
  ]);
  expect(fs.readFileSync(shelfPath('講義', '001.jpg'), 'utf8')).toBe('two');
});

test('外部で画像を消すとページが消える。1枚もなくなったノートは一覧から外れる', async () => {
  const noteId = await captureNote('講義', ['a', 'b']);
  await syncShelf(shelf);
  await externally(() => fs.rmSync(shelfPath('講義', '001.jpg')));
  await syncShelf(shelf);
  expect(await listPagesOfNote(shelf.db, noteId)).toHaveLength(1);

  // 残ったページは 001.jpg に付け直されている
  await externally(() => fs.rmSync(shelfPath('講義', '001.jpg')));
  await syncShelf(shelf);
  expect(await findNote(shelf.db, noteId)).toBeNull();
  expect(fs.existsSync(shelfPath('講義'))).toBe(true); // フォルダは消さない
});

test('Finder で複製したノートは別のノートになり、OCR 結果は引き継ぐ', async () => {
  const noteId = await captureNote('講義', ['a']);
  markOcrDone(['講義'], '固有値');
  await syncShelf(shelf);
  await externally(() =>
    fs.cpSync(shelfPath('講義'), shelfPath('講義 のコピー'), { recursive: true }),
  );
  await syncShelf(shelf);

  const notes = await listNoteSummaries(shelf.db, null, 'name');
  expect(notes.map((note) => note.title)).toEqual(['講義', '講義 のコピー']);
  const copy = notes.find((note) => note.id !== noteId)!;
  const copyPages = await listPagesOfNote(shelf.db, copy.id);
  expect(copyPages[0]?.ocrText).toBe('固有値');
  expect(copyPages[0]?.id).not.toBe((await listPagesOfNote(shelf.db, noteId))[0]?.id);
});

test('.leaves.json が壊されたノートはノートブックになり、中の画像はノートとして取り込み直される', async () => {
  await captureNote('講義', ['a']);
  await syncShelf(shelf);
  // 中身の上書きだけではフォルダの更新日時が変わらないため（ADR 0020）、消してから書く
  await externally(() => {
    fs.rmSync(shelfPath('講義', '.leaves.json'));
    fs.writeFileSync(shelfPath('講義', '.leaves.json'), '{壊れた');
  });
  await syncShelf(shelf);

  const [notebook] = await listAllNotebooks(shelf.db);
  expect(notebook?.name).toBe('講義');
  expect((await listNoteSummaries(shelf.db, notebook!.id, 'name')).map((n) => n.title)).toEqual([
    '001',
  ]);
});

test('DB が失われても、本棚フォルダからノートブック・ノート・ページ・OCR 結果を復元できる（NFR-R-05）', async () => {
  const notebookId = await createNotebook(shelf, '大学', null);
  const noteId = await createNoteFromCapture(shelf, {
    images: [capturedImage('x.jpg')],
    title: '講義',
    notebookId,
  });
  markOcrDone(['大学', '講義'], '固有値');
  const [page] = await listPagesOfNote(shelf.db, noteId);

  shelf = { ...shelf, db: await createMigratedTestDb() };
  await syncShelf(shelf);

  expect((await listAllNotebooks(shelf.db)).map((n) => [n.id, n.name])).toEqual([
    [notebookId, '大学'],
  ]);
  expect((await findNote(shelf.db, noteId))?.notebookId).toBe(notebookId);
  expect(await findPage(shelf.db, page!.id)).toMatchObject({
    ocrStatus: 'done',
    ocrText: '固有値',
  });
});

test('ノートの中で読めないフォルダがあっても、ほかの反映は続ける（NFR-R-04）', async () => {
  await captureNote('講義', ['a']);
  await externally(() => {
    fs.mkdirSync(shelfPath('ノートブック'));
    fs.writeFileSync(shelfPath('ノートブック', '.leaves.json'), JSON.stringify({ kind: 'x' }));
  });
  await expect(syncShelf(shelf)).resolves.toBeUndefined();
  expect(await titles()).toEqual(['講義']);
});

test('ノート名の重複：直下に同じ名前のフォルダがあれば、取り込む画像のノートは (2) を付ける', async () => {
  await captureNote('scan', ['a']);
  await externally(() => fs.writeFileSync(shelfPath('scan.jpg'), 'b'));
  await syncShelf(shelf);
  expect(await titles()).toEqual(['scan', 'scan (2)']);
  expect(readManifest(new Directory(shelf.directory, 'scan (2)'))?.kind).toBe('note');
  const noteIds = (await listNoteSummaries(shelf.db, null, 'name')).map((note) => note.id);
  expect(new Set(noteIds).size).toBe(2);
  expect(noteIds.every((id): id is NoteId => typeof id === 'string')).toBe(true);
});

describe('iCloud のダウンロード待ち（FR-L-06、NFR-R-06）', () => {
  const { fakeFolderAccess } = jest.requireActual(
    '../../../test/fakeFolderAccess',
  ) as typeof import('../../../test/fakeFolderAccess');
  beforeEach(() => fakeFolderAccess.reset());

  test('ページ画像がまだ届いていないノートは、ページを消さずに前回のまま保ち、ダウンロードを頼む', async () => {
    const noteId = await captureNote('講義', ['a', 'b']);
    await syncShelf(shelf);
    await externally(() => {
      fs.rmSync(shelfPath('講義', '002.jpg'));
      fs.writeFileSync(shelfPath('講義', '.002.jpg.icloud'), '');
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await syncShelf(shelf);
    } finally {
      jest.useRealTimers();
    }
    expect(await listPagesOfNote(shelf.db, noteId)).toHaveLength(2);
    expect(fakeFolderAccess.requestedDownloads.some((uri) => uri.endsWith('.002.jpg.icloud'))).toBe(
      true,
    );
  });

  test('管理用ファイルがまだ届いていないノートは、ノートブックと取り違えない', async () => {
    const noteId = await captureNote('講義', ['a']);
    await syncShelf(shelf);
    await externally(() => {
      fs.rmSync(shelfPath('講義', '.leaves.json'));
      fs.writeFileSync(shelfPath('講義', '..leaves.json.icloud'), '');
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await syncShelf(shelf);
    } finally {
      jest.useRealTimers();
    }
    expect(await findNote(shelf.db, noteId)).not.toBeNull();
    expect(await listAllNotebooks(shelf.db)).toEqual([]);
    expect(fs.readdirSync(shelfPath('講義')).sort()).toEqual(['..leaves.json.icloud', '001.jpg']);
  });
});
