// ページの編集（四隅の台形補正・回転）の座標計算（詳細設計書 9.12）。
// 四隅は元の画像（回転前）に対する相対座標で持ち、編集画面は回転後の向きで表示する。
import type { PageEdit, PageRotation, Point } from './types';

/** 画像の四隅（左上・右上・右下・左下）。「全体」ボタンと、未編集のページの初期値 */
export const FULL_IMAGE_CORNERS: PageEdit['corners'] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const UNEDITED: PageEdit = { corners: FULL_IMAGE_CORNERS, rotation: 0 };

/** 回転ボタン: 右に 90° */
export function rotateClockwise(rotation: PageRotation): PageRotation {
  return ((rotation + 90) % 360) as PageRotation;
}

/** 元の画像の相対座標を、rotation だけ右に回した表示の相対座標にする */
export function toDisplayPoint(point: Point, rotation: PageRotation): Point {
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: 1 - point.y, y: point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: point.y, y: 1 - point.x };
  }
}

/** toDisplayPoint の逆。ドラッグした表示上の位置を、元の画像の相対座標に戻す */
export function toOriginalPoint(point: Point, rotation: PageRotation): Point {
  return toDisplayPoint(point, ((360 - rotation) % 360) as PageRotation);
}

/** 回転後に表示するときの縦横比（幅 ÷ 高さ）。90°・270° では縦横が入れ替わる */
export function displayAspectRatio(
  size: { width: number; height: number },
  rotation: PageRotation,
): number {
  return rotation % 180 === 0 ? size.width / size.height : size.height / size.width;
}

/** 3点がほぼ一直線（枠がつぶれる）とみなす外積の大きさ。相対座標で、画像の 1% 四方程度 */
const MIN_CROSS = 0.0001;

/**
 * 四隅が凸四角形か（枠がねじれない・つぶれない）。順に辺をたどったときの外積の向きが
 * すべて同じなら凸。どれかが 0 に近ければ、3点が一直線に並んでつぶれている
 */
export function isValidQuadrilateral(corners: PageEdit['corners']): boolean {
  'worklet'; // 編集画面のドラッグ中に UI スレッドで呼ぶため
  const crosses = corners.map((current, index) => {
    const next = corners[(index + 1) % 4]!;
    const afterNext = corners[(index + 2) % 4]!;
    return (
      (next.x - current.x) * (afterNext.y - next.y) - (next.y - current.y) * (afterNext.x - next.x)
    );
  });
  return (
    crosses.every((cross) => cross > MIN_CROSS) || crosses.every((cross) => cross < -MIN_CROSS)
  );
}

/** 画像の外にはみ出さないよう 0〜1 に収める */
export function clampPoint(point: Point): Point {
  'worklet';
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clamp(point.x), y: clamp(point.y) };
}
