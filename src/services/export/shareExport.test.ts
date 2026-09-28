import { File, Paths } from 'expo-file-system';

import { AppError } from '@/domain/errors';
import type { OpenShelf } from '@/state/openShelf';

import { asNoteId, asPageId } from '../../../test/builders';
import { resetNodeFileSystem } from '../../../test/nodeFileSystem';
import { shareExport } from './shareExport';

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

const shelf = {} as OpenShelf;
const noteId = asNoteId('note');
const exportUri = (name: string) => new File(Paths.cache, name).uri;
const pdfFile = { uri: exportUri('ノート.pdf'), mimeType: 'application/pdf' };
const exists = (uri: string) => new File(uri).exists;

function buildsFile(builder: jest.Mock, file: { uri: string; mimeType: string }) {
  builder.mockImplementation(async () => {
    new File(file.uri).write('書き出したファイル');
    return file;
  });
}

beforeEach(() => {
  resetNodeFileSystem();
  Object.values(mockBuilders).forEach((builder) => builder.mockReset());
  mockShareFile.mockReset();
});

test('作ったファイルを共有シートに渡し、閉じたら消す', async () => {
  buildsFile(mockBuilders.pdf, pdfFile);
  mockShareFile.mockImplementation(async () => {
    expect(exists(pdfFile.uri)).toBe(true); // 共有中はまだ消さない
  });

  await shareExport(shelf, 'pdf', noteId);

  expect(mockBuilders.pdf).toHaveBeenCalledWith(shelf, noteId, {});
  expect(mockShareFile).toHaveBeenCalledWith(pdfFile);
  expect(exists(pdfFile.uri)).toBe(false);
});

test('形式に応じたファイルの作り方を選び、ページの指定を渡す', async () => {
  const imageFile = { uri: exportUri('ノート_p2.jpg'), mimeType: 'image/jpeg' };
  buildsFile(mockBuilders.pageImage, imageFile);

  await shareExport(shelf, 'pageImage', noteId, { pageId: asPageId('page2') });

  expect(mockBuilders.pageImage).toHaveBeenCalledWith(shelf, noteId, { pageId: 'page2' });
  expect(mockBuilders.pdf).not.toHaveBeenCalled();
  expect(mockShareFile).toHaveBeenCalledWith(imageFile);
});

test('共有に失敗しても一時ファイルを消し、exportFailed を投げる', async () => {
  const zipFile = { uri: exportUri('ノート.zip'), mimeType: 'application/zip' };
  buildsFile(mockBuilders.markdown, zipFile);
  const cause = new Error('共有シートを開けない');
  mockShareFile.mockRejectedValue(cause);

  const error = await shareExport(shelf, 'markdown', noteId).catch((thrown: unknown) => thrown);

  expect(error).toEqual(new AppError('exportFailed'));
  expect((error as AppError).cause).toBe(cause);
  expect(exists(zipFile.uri)).toBe(false);
});

test('ファイルを作れなければ共有シートを開かず、exportFailed を投げる', async () => {
  mockBuilders.pdf.mockRejectedValue(new Error('画像がない'));

  await expect(shareExport(shelf, 'pdf', noteId)).rejects.toEqual(new AppError('exportFailed'));
  expect(mockShareFile).not.toHaveBeenCalled();
});
