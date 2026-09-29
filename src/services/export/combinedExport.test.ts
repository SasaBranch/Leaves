import fs from 'node:fs';

import { Directory, File } from 'expo-file-system';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFArray, PDFRef } from 'pdf-lib';

import type { NotebookId, NoteId } from '@/domain/types';
import type { OpenShelf } from '@/state/openShelf';
import { exportDirectory } from '@/storage/paths';

import { buildNote } from '../../../test/builders';
import { insertNotebookRow, insertNoteRow, insertPageRow } from '../../../test/migratedTestDb';
import { nodePathOf } from '../../../test/nodeFileSystem';
import { createTestShelf } from '../../../test/testShelf';
import { TINY_JPEG_BYTES } from '../../../test/tinyJpeg';
import {
  buildIndexMarkdown,
  type CombinedExportOptions,
  noteFolderName,
  shareCombinedExport,
} from './combinedExport';

// フォントはアセットの代わりに、同じフォントをディスクから読む
const mockLoadFont = async () =>
  Uint8Array.from(
    fs.readFileSync(
      require.resolve('@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf'),
    ),
  );
jest.mock('./exportFont', () => ({ loadJapaneseFontBytes: () => mockLoadFont() }));
// 共有シートに渡されたファイルの中身を、後始末で消される前に取っておく
let sharedBytes: Uint8Array | null = null;
const mockShareFile = jest.fn(async (file: { uri: string }) => {
  sharedBytes = await new File(file.uri).bytes();
});
jest.mock('@/native/share', () => ({ shareFile: (file: { uri: string }) => mockShareFile(file) }));

const notebookId = 'linear-algebra' as NotebookId;
let shelf: OpenShelf;

/** ノートブック「線形代数」の直下に、ページ数を指定してノートを作る */
async function createNote(id: string, title: string, pageCount: number): Promise<NoteId> {
  await insertNoteRow(shelf.db, { id, notebookId, title });
  const folder = new Directory(shelf.directory, '線形代数', title);
  folder.create({ intermediates: true });
  for (let position = 0; position < pageCount; position++) {
    await insertPageRow(shelf.db, {
      id: `${id}-p${position}`,
      noteId: id,
      position,
      ocrText: `${title} ${position + 1}`,
    });
    new File(folder, `${String(position + 1).padStart(3, '0')}.jpg`).write(TINY_JPEG_BYTES);
  }
  return id as NoteId;
}

function options(overrides: Partial<CombinedExportOptions> = {}): CombinedExportOptions {
  return { signal: new AbortController().signal, onProgress: () => undefined, ...overrides };
}

const exportFiles = () => (exportDirectory().exists ? exportDirectory().list() : []);

beforeEach(async () => {
  shelf = await createTestShelf();
  sharedBytes = null;
  mockShareFile.mockClear();
  await insertNotebookRow(shelf.db, { id: notebookId, name: '線形代数' });
});

/** しおりのタイトルと、指しているページの番号（0 始まり） */
function readOutline(pdf: PDFDocument): { title: string; pageIndex: number }[] {
  const pageRefs = pdf.getPages().map((page) => page.ref.toString());
  const outlines = pdf.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  const items: { title: string; pageIndex: number }[] = [];
  let ref = outlines.get(PDFName.of('First'));
  while (ref instanceof PDFRef) {
    const item = pdf.context.lookup(ref, PDFDict);
    const dest = item.lookup(PDFName.of('Dest'), PDFArray);
    items.push({
      title: item.lookup(PDFName.of('Title'), PDFHexString).decodeText(),
      pageIndex: pageRefs.indexOf(dest.get(0).toString()),
    });
    ref = item.get(PDFName.of('Next'));
  }
  return items;
}

describe('PDF（FR-E-07）', () => {
  test('選んだ順にページを並べた1つの PDF にし、ノートごとのしおりを付ける', async () => {
    const first = await createNote('a', '第1回 行列', 2);
    await createNote('b', '小テスト', 1);
    const third = await createNote('c', '第3回 固有値', 3);

    const result = await shareCombinedExport(shelf, 'pdf', notebookId, [third, first], options());

    expect(result).toBe('shared');
    const pdf = await PDFDocument.load(sharedBytes!);
    expect(pdf.getPageCount()).toBe(5);
    expect(readOutline(pdf)).toEqual([
      { title: '第3回 固有値', pageIndex: 0 },
      { title: '第1回 行列', pageIndex: 3 },
    ]);
    expect(mockShareFile.mock.calls[0]![0]).toMatchObject({ mimeType: 'application/pdf' });
    expect(decodeURIComponent(mockShareFile.mock.calls[0]![0].uri)).toMatch(/\/線形代数\.pdf$/);
    // 共有シートを閉じたら一時ファイルは消える
    expect(exportFiles()).toEqual([]);
  });

  test('1ノート終わるごとに進み具合を知らせる', async () => {
    const ids = [await createNote('a', 'A', 1), await createNote('b', 'B', 1)];
    const onProgress = jest.fn();
    await shareCombinedExport(shelf, 'pdf', notebookId, ids, options({ onProgress }));
    expect(onProgress.mock.calls).toEqual([
      [{ finishedNotes: 1, totalNotes: 2 }],
      [{ finishedNotes: 2, totalNotes: 2 }],
    ]);
  });
});

describe('Markdown（FR-E-08）', () => {
  test('番号付きのノートのフォルダと、選んだ順の目次を1つの zip にまとめる', async () => {
    const first = await createNote('a', '第1回 行列', 2);
    const second = await createNote('b', '第2回 行列式', 1);

    await shareCombinedExport(shelf, 'markdown', notebookId, [second, first], options());

    const zip = await JSZip.loadAsync(sharedBytes!);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);
    expect(names.sort()).toEqual(
      [
        'index.md',
        '01_第2回 行列式/第2回 行列式.md',
        '01_第2回 行列式/images/p01.jpg',
        '02_第1回 行列/第1回 行列.md',
        '02_第1回 行列/images/p01.jpg',
        '02_第1回 行列/images/p02.jpg',
      ].sort(),
    );
    expect(await zip.file('index.md')!.async('string')).toBe(
      [
        '# 線形代数',
        '',
        '1. [第2回 行列式](<01_第2回 行列式/第2回 行列式.md>)',
        '2. [第1回 行列](<02_第1回 行列/第1回 行列.md>)',
        '',
      ].join('\n'),
    );
    expect(await zip.file('02_第1回 行列/第1回 行列.md')!.async('string')).toContain(
      '- ノートブック: 線形代数',
    );
  });

  test('フォルダの番号はノート数の桁数（最低2桁）でゼロ埋めする', () => {
    const note = buildNote({ id: 'note', title: 'メモ' });
    expect(noteFolderName(note, 0, 9)).toBe('01_メモ');
    expect(noteFolderName(note, 4, 100)).toBe('005_メモ');
  });

  test('目次のリンクは、ファイル名に使えない文字を置き換えた名前を指す', () => {
    const note = buildNote({ id: 'note', title: '議事録 10/15' });
    expect(buildIndexMarkdown('会議', [{ note, folder: '01_議事録 10_15' }])).toContain(
      '1. [議事録 10/15](<01_議事録 10_15/議事録 10_15.md>)',
    );
  });
});

describe('取り消しと失敗（FR-E-09）', () => {
  test('取り消すと共有せず、作りかけのファイルを残さない', async () => {
    const ids = [await createNote('a', 'A', 2), await createNote('b', 'B', 2)];
    const controller = new AbortController();
    const result = await shareCombinedExport(
      shelf,
      'pdf',
      notebookId,
      ids,
      options({ signal: controller.signal, onProgress: () => controller.abort() }),
    );
    expect(result).toBe('canceled');
    expect(mockShareFile).not.toHaveBeenCalled();
    expect(exportFiles()).toEqual([]);
  });

  test('見つからないノートがあれば exportNoteMissing で中止する', async () => {
    const id = await createNote('a', 'A', 1);
    await expect(
      shareCombinedExport(shelf, 'markdown', notebookId, [id, 'gone' as NoteId], options()),
    ).rejects.toMatchObject({ kind: 'exportNoteMissing' });
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  test('途中でノートのフォルダが外部で消されたら exportNoteMissing で中止し、ファイルを残さない', async () => {
    const ids = [await createNote('a', 'A', 1), await createNote('b', 'B', 1)];
    const removeSecond = () =>
      fs.rmSync(nodePathOf(new Directory(shelf.directory, '線形代数', 'B').uri), {
        recursive: true,
      });
    await expect(
      shareCombinedExport(shelf, 'pdf', notebookId, ids, options({ onProgress: removeSecond })),
    ).rejects.toMatchObject({ kind: 'exportNoteMissing' });
    expect(exportFiles()).toEqual([]);
  });
});
