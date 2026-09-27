import { fakeFiles } from '../../../test/fakeFileSystem';
import { prepareExportFile, sanitizeFileName } from './fileName';

jest.mock('expo-file-system', () => jest.requireActual('../../../test/fakeFileSystem'));

beforeEach(() => fakeFiles.clear());

test('sanitizeFileName: ファイル名に使えない文字を _ に置き換える', () => {
  expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
});

test('sanitizeFileName: 日本語や空白を含むタイトルはそのまま使う', () => {
  expect(sanitizeFileName('第3回 固有値と固有ベクトル')).toBe('第3回 固有値と固有ベクトル');
});

test('sanitizeFileName: 前後の空白と末尾のピリオドを除く', () => {
  expect(sanitizeFileName('  議事録  ')).toBe('議事録');
  expect(sanitizeFileName('v1.2...')).toBe('v1.2');
  expect(sanitizeFileName('メモ . ')).toBe('メモ');
});

test('sanitizeFileName: 空になったら既定の名前にする', () => {
  expect(sanitizeFileName('')).toBe('Leaves');
  expect(sanitizeFileName('   ')).toBe('Leaves');
  expect(sanitizeFileName('...')).toBe('Leaves');
});

test('prepareExportFile: 書き出し用フォルダのファイルを返し、同名の残骸は消す', () => {
  fakeFiles.add('cache/export/ノート.pdf');
  const file = prepareExportFile('ノート.pdf');
  expect(file.uri).toBe('cache/export/ノート.pdf');
  expect(fakeFiles.size).toBe(0);
});
