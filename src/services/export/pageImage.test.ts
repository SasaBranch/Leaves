import { asNoteId, asPageId } from '../../../test/builders';
import { fakeFiles } from '../../../test/fakeFileSystem';
import { createMigratedTestDb, insertNoteRow, insertPageRow } from '../../../test/migratedTestDb';
import { copyPageImage } from './pageImage';

// 共通の偽物にはコピーがないため、このテストでだけ足す
jest.mock('expo-file-system', () => {
  const fake = jest.requireActual('../../../test/fakeFileSystem');
  class File extends fake.File {
    async copy(destination: { uri: string }) {
      fake.fakeFiles.add(destination.uri);
    }
  }
  return { ...fake, File };
});

async function createNoteWithPages() {
  const db = await createMigratedTestDb();
  await insertNoteRow(db, { id: 'note', title: '議事録: 10/15' });
  // 削除で position に隙間があっても、ページ番号は並び順で数える
  await insertPageRow(db, { id: 'first', noteId: 'note', position: 0 });
  await insertPageRow(db, { id: 'second', noteId: 'note', position: 5 });
  return db;
}

beforeEach(() => fakeFiles.clear());

test('ページ画像を「タイトル_pページ番号.jpg」として書き出し用フォルダにコピーする', async () => {
  const db = await createNoteWithPages();
  fakeFiles.add('doc/pages/second.jpg');

  const file = await copyPageImage(db, asNoteId('note'), { pageId: asPageId('second') });

  expect(file).toEqual({ uri: 'cache/export/議事録_ 10_15_p2.jpg', mimeType: 'image/jpeg' });
  expect(fakeFiles.has('cache/export/議事録_ 10_15_p2.jpg')).toBe(true);
});

test('ノートにないページは書き出さない', async () => {
  const db = await createNoteWithPages();
  await expect(copyPageImage(db, asNoteId('note'), { pageId: asPageId('other') })).rejects.toThrow(
    /ページがノートにありません/,
  );
});
