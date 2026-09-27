import type { Db } from '@/db/db';
import { AppError } from '@/domain/errors';

import { asNoteId, asPageId } from '../../../test/builders';
import { fakeFiles } from '../../../test/fakeFileSystem';
import { shareExport } from './shareExport';

jest.mock('expo-file-system', () => jest.requireActual('../../../test/fakeFileSystem'));

// 各形式のファイル作成は差し替え、共通手順（共有と後始末）だけを確かめる
const mockBuilders = {
  pdf: jest.fn(),
  markdown: jest.fn(),
  pageImage: jest.fn(),
};
jest.mock('./pdf', () => ({ buildPdf: (...args: unknown[]) => mockBuilders.pdf(...args) }));
jest.mock('./markdown', () => ({
  buildMarkdownZip: (...args: unknown[]) => mockBuilders.markdown(...args),
}));
jest.mock('./pageImage', () => ({
  copyPageImage: (...args: unknown[]) => mockBuilders.pageImage(...args),
}));
const mockShareFile = jest.fn();
jest.mock('@/native/share', () => ({ shareFile: (file: unknown) => mockShareFile(file) }));

const db = {} as Db;
const noteId = asNoteId('note');
const pdfFile = { uri: 'cache/export/ノート.pdf', mimeType: 'application/pdf' };

function buildsFile(builder: jest.Mock, file: { uri: string; mimeType: string }) {
  builder.mockImplementation(async () => {
    fakeFiles.add(file.uri);
    return file;
  });
}

beforeEach(() => {
  fakeFiles.clear();
  Object.values(mockBuilders).forEach((builder) => builder.mockReset());
  mockShareFile.mockReset();
});

test('作ったファイルを共有シートに渡し、閉じたら消す', async () => {
  buildsFile(mockBuilders.pdf, pdfFile);
  mockShareFile.mockImplementation(async () => {
    expect(fakeFiles.has(pdfFile.uri)).toBe(true); // 共有中はまだ消さない
  });

  await shareExport(db, 'pdf', noteId);

  expect(mockBuilders.pdf).toHaveBeenCalledWith(db, noteId, {});
  expect(mockShareFile).toHaveBeenCalledWith(pdfFile);
  expect(fakeFiles.size).toBe(0);
});

test('形式に応じたファイルの作り方を選び、ページの指定を渡す', async () => {
  const imageFile = { uri: 'cache/export/ノート_p2.jpg', mimeType: 'image/jpeg' };
  buildsFile(mockBuilders.pageImage, imageFile);

  await shareExport(db, 'pageImage', noteId, { pageId: asPageId('page2') });

  expect(mockBuilders.pageImage).toHaveBeenCalledWith(db, noteId, { pageId: 'page2' });
  expect(mockBuilders.pdf).not.toHaveBeenCalled();
  expect(mockShareFile).toHaveBeenCalledWith(imageFile);
});

test('共有に失敗しても一時ファイルを消し、exportFailed を投げる', async () => {
  buildsFile(mockBuilders.markdown, {
    uri: 'cache/export/ノート.zip',
    mimeType: 'application/zip',
  });
  const cause = new Error('共有シートを開けない');
  mockShareFile.mockRejectedValue(cause);

  const error = await shareExport(db, 'markdown', noteId).catch((thrown: unknown) => thrown);

  expect(error).toEqual(new AppError('exportFailed'));
  expect((error as AppError).cause).toBe(cause);
  expect(fakeFiles.size).toBe(0);
});

test('ファイルを作れなければ共有シートを開かず、exportFailed を投げる', async () => {
  mockBuilders.pdf.mockRejectedValue(new Error('画像がない'));

  await expect(shareExport(db, 'pdf', noteId)).rejects.toEqual(new AppError('exportFailed'));
  expect(mockShareFile).not.toHaveBeenCalled();
});
