import type { OcrLine } from '@/domain/types';

import { placeInvisibleLine } from './pdf';

// 座標計算だけを確かめる。フォントの読み込みはネイティブ機能なので実機で確認する
jest.mock('expo-asset', () => ({ Asset: {} }));
jest.mock('@expo-google-fonts/noto-sans-jp/400Regular', () => ({ NotoSansJP_400Regular: 1 }));

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 793.71;

const line = (overrides: Partial<OcrLine> = {}): OcrLine => ({
  text: '固有値',
  x: 0.1,
  y: 0.2,
  width: 0.5,
  height: 0.04,
  ...overrides,
});

// 文字サイズ × 文字数 の幅になる等幅フォントとして測る
const measureMonospace = (text: string, fontSize: number) => text.length * fontSize;

test('左上原点の相対座標を、PDF の左下原点の pt に変換する（行の下端が基準）', () => {
  const placement = placeInvisibleLine(line(), PAGE_WIDTH, PAGE_HEIGHT, measureMonospace);
  expect(placement.x).toBeCloseTo(0.1 * PAGE_WIDTH);
  expect(placement.y).toBeCloseTo(PAGE_HEIGHT - 0.24 * PAGE_HEIGHT);
});

test('ページ上端の行は上端近く、下端の行は y = 0 に置く', () => {
  const top = placeInvisibleLine(line({ y: 0, height: 0.1 }), 100, 200, measureMonospace);
  expect(top.y).toBeCloseTo(180);
  const bottom = placeInvisibleLine(line({ y: 0.9, height: 0.1 }), 100, 200, measureMonospace);
  expect(bottom.y).toBeCloseTo(0);
});

test('文字サイズは行の高さ（pt）× 0.85', () => {
  const placement = placeInvisibleLine(line({ height: 0.05 }), 100, 200, measureMonospace);
  expect(placement.fontSize).toBeCloseTo(10 * 0.85);
});

test('水平拡大率は、行の幅 ÷ その文字サイズでの文字列の幅（%）', () => {
  // 行の高さ 0.05 × 200 × 0.85 = 8.5pt、3文字で 25.5pt。行の幅は 0.5 × 100 = 50pt
  const placement = placeInvisibleLine(
    line({ text: 'abc', width: 0.5, height: 0.05 }),
    100,
    200,
    measureMonospace,
  );
  expect(placement.horizontalScalePercent).toBeCloseTo((50 / 25.5) * 100);
});

test('文字列の幅がちょうど行の幅なら拡大率は 100%', () => {
  const placement = placeInvisibleLine(line({ text: 'abc' }), 100, 200, () => 0.5 * 100);
  expect(placement.horizontalScalePercent).toBeCloseTo(100);
});

test('文字列の幅は、その行の文字と文字サイズで測る', () => {
  const measure = jest.fn(() => 10);
  placeInvisibleLine(line({ text: '定義', height: 0.05 }), 100, 200, measure);
  expect(measure).toHaveBeenCalledWith('定義', 10 * 0.85);
});
