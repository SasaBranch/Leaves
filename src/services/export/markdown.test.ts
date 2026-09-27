import { buildNote, buildPage } from '../../../test/builders';
import { buildMarkdown } from './markdown';

// 端末のタイムゾーンによらず 2026-09-28 10:30 と表示される日時
const createdAt = new Date(2026, 8, 28, 10, 30).toISOString();
const note = buildNote({ id: 'note', title: '第3回 固有値と固有ベクトル', createdAt });

test('基本設計書 6.4 の形式で、ページごとに見出し・画像リンク・OCR テキストを書く', () => {
  const pages = [
    buildPage({ id: 'p1', noteId: 'note', ocrText: '§3 固有値と固有ベクトル\n定義：Ax = λx' }),
    buildPage({ id: 'p2', noteId: 'note', position: 1, ocrText: '対称行列' }),
  ];
  expect(buildMarkdown(note, pages, ['大学', '線形代数'])).toBe(
    [
      '# 第3回 固有値と固有ベクトル',
      '',
      '- 作成日時: 2026-09-28 10:30',
      '- ノートブック: 大学 / 線形代数',
      '',
      '## ページ 1',
      '',
      '![ページ 1](images/p01.jpg)',
      '',
      '§3 固有値と固有ベクトル',
      '定義：Ax = λx',
      '',
      '## ページ 2',
      '',
      '![ページ 2](images/p02.jpg)',
      '',
      '対称行列',
      '',
    ].join('\n'),
  );
});

test('ライブラリ直下のノートはノートブックの行を書かない', () => {
  expect(buildMarkdown(note, [], [])).toBe(
    ['# 第3回 固有値と固有ベクトル', '', '- 作成日時: 2026-09-28 10:30', ''].join('\n'),
  );
});

test('OCR テキストがないページは見出しと画像リンクだけにする', () => {
  const pages = [buildPage({ id: 'p1', noteId: 'note', ocrText: '' })];
  expect(buildMarkdown(note, pages, [])).toMatch(
    /## ページ 1\n\n!\[ページ 1\]\(images\/p01\.jpg\)\n$/,
  );
});

test('画像の連番は2桁ゼロ埋めで、10ページ目以降はそのまま', () => {
  const pages = Array.from({ length: 10 }, (_, index) =>
    buildPage({ id: `p${index}`, noteId: 'note', position: index }),
  );
  const markdown = buildMarkdown(note, pages, []);
  expect(markdown).toContain('![ページ 9](images/p09.jpg)');
  expect(markdown).toContain('![ページ 10](images/p10.jpg)');
});
