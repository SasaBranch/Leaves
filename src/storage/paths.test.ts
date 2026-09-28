import { Directory, Paths } from 'expo-file-system';

import { entryName, noteDirectory, pageFileName } from './paths';

test('ページのファイル名は 1 始まりの3桁ゼロ埋め。1000 ページ目以降は桁が増える', () => {
  expect(pageFileName(0)).toBe('001.jpg');
  expect(pageFileName(41)).toBe('042.jpg');
  expect(pageFileName(999)).toBe('1000.jpg');
});

test('ノートの場所は、本棚 ＋ 祖先のノートブック名 ＋ ノート名', () => {
  const shelf = new Directory(Paths.document, '大学');
  expect(noteDirectory(shelf, ['線形代数', '第3章'], '固有値').uri).toBe(
    new Directory(Paths.document, '大学', '線形代数', '第3章', '固有値').uri,
  );
});

test('ファイルシステムの名前は NFC にそろえる（iOS の list() は NFD を返す）', () => {
  const folder = new Directory(Paths.document, 'ノートブック');
  folder.create({ idempotent: true });
  const [listed] = new Directory(Paths.document).list().filter((entry) => entry.name !== '');
  expect(entryName(listed!)).toBe('ノートブック');
});
