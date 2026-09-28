import { Directory, File } from 'expo-file-system';

import { asNoteId, asPageId } from '../../../test/builders';
import { insertNoteRow, insertPageRow } from '../../../test/migratedTestDb';
import { createTestShelf } from '../../../test/testShelf';
import { copyPageImage } from './pageImage';

async function createNoteWithPages() {
  const shelf = await createTestShelf();
  await insertNoteRow(shelf.db, { id: 'note', title: '議事録 10.15' });
  await insertPageRow(shelf.db, { id: 'first', noteId: 'note', position: 0 });
  await insertPageRow(shelf.db, { id: 'second', noteId: 'note', position: 1 });
  const folder = new Directory(shelf.directory, '議事録 10.15');
  folder.create();
  new File(folder, '001.jpg').write('first');
  new File(folder, '002.jpg').write('second');
  return shelf;
}

test('ページ画像を「タイトル_pページ番号.jpg」として書き出し用フォルダにコピーする', async () => {
  const shelf = await createNoteWithPages();

  const exported = await copyPageImage(shelf, asNoteId('note'), { pageId: asPageId('second') });

  expect(exported.mimeType).toBe('image/jpeg');
  expect(exported.uri.endsWith('/export/%E8%AD%B0%E4%BA%8B%E9%8C%B2%2010.15_p2.jpg')).toBe(true);
  expect(new File(exported.uri).textSync()).toBe('second');
});

test('ノートにないページは書き出さない', async () => {
  const shelf = await createNoteWithPages();
  await expect(
    copyPageImage(shelf, asNoteId('note'), { pageId: asPageId('other') }),
  ).rejects.toThrow(/ページがノートにありません/);
});
