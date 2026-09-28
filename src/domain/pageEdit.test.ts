import {
  displayAspectRatio,
  FULL_IMAGE_CORNERS,
  isValidQuadrilateral,
  rotateClockwise,
  toDisplayPoint,
  toOriginalPoint,
} from './pageEdit';
import type { PageEdit, PageRotation } from './types';

const ROTATIONS: PageRotation[] = [0, 90, 180, 270];

test('右に 90° ずつ回り、一周で戻る', () => {
  expect(ROTATIONS.map(rotateClockwise)).toEqual([90, 180, 270, 0]);
});

test('右に 90° 回すと、元の左上は表示の右上に来る', () => {
  expect(toDisplayPoint({ x: 0, y: 0 }, 90)).toEqual({ x: 1, y: 0 });
  expect(toDisplayPoint({ x: 0.25, y: 0.5 }, 180)).toEqual({ x: 0.75, y: 0.5 });
  expect(toDisplayPoint({ x: 0, y: 0 }, 270)).toEqual({ x: 0, y: 1 });
});

test.each(ROTATIONS)('表示の座標から元の座標に戻せる（%s°）', (rotation) => {
  const point = { x: 0.25, y: 0.5 };
  expect(toOriginalPoint(toDisplayPoint(point, rotation), rotation)).toEqual(point);
});

test('90°・270° では表示の縦横比が入れ替わる', () => {
  expect(displayAspectRatio({ width: 300, height: 400 }, 0)).toBe(0.75);
  expect(displayAspectRatio({ width: 300, height: 400 }, 90)).toBeCloseTo(4 / 3);
});

test('凸四角形なら有効、ねじれ・つぶれ・凹みは無効', () => {
  expect(isValidQuadrilateral(FULL_IMAGE_CORNERS)).toBe(true);
  const skewed: PageEdit['corners'] = [
    { x: 0.1, y: 0.2 },
    { x: 0.9, y: 0.05 },
    { x: 0.8, y: 0.95 },
    { x: 0.15, y: 0.85 },
  ];
  expect(isValidQuadrilateral(skewed)).toBe(true);
  expect(isValidQuadrilateral([skewed[0], skewed[2], skewed[1], skewed[3]])).toBe(false);
  expect(
    isValidQuadrilateral([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]),
  ).toBe(false);
  expect(
    isValidQuadrilateral([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.4, y: 0.4 },
      { x: 0, y: 1 },
    ]),
  ).toBe(false);
});
