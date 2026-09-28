// アプリのロゴ（二枚葉。基本設計書 2.5）。形は scripts/generate-icons.py が生成する leavesMarkShape.ts
import Svg, { Polygon } from 'react-native-svg';

import { LEAVES_MARK_FACETS, LEAVES_MARK_SIZE } from './leavesMarkShape';

/** 単色で描くとき、いちばん暗い面の不透明度（明るい面ほど 1 に近づけ、面の区切りを残す） */
const MONOCHROME_MIN_OPACITY = 0.45;

/**
 * size は高さ（pt）。monochrome を渡すと、その色の濃淡だけで描く
 * （ノートブックの表紙など、色の付いた面の上で緑が浮かないように）
 */
export function LeavesMark({ size, monochrome }: { size: number; monochrome?: string }) {
  const width = (size * LEAVES_MARK_SIZE.width) / LEAVES_MARK_SIZE.height;
  return (
    <Svg
      width={width}
      height={size}
      viewBox={`0 0 ${LEAVES_MARK_SIZE.width} ${LEAVES_MARK_SIZE.height}`}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {LEAVES_MARK_FACETS.map((facet) => (
        <Polygon
          key={facet.points}
          points={facet.points}
          fill={monochrome ?? facet.color}
          fillOpacity={
            monochrome
              ? MONOCHROME_MIN_OPACITY + (1 - MONOCHROME_MIN_OPACITY) * facet.brightness
              : 1
          }
        />
      ))}
    </Svg>
  );
}
