// ノートブックを小さく示す表紙の見本（チップ・移動先の一覧・ノートブック画面の見出し）。
// フォルダのアイコンは使わない（基本設計書 2.1）
import { View } from 'react-native';

import { COVER_ASPECT_RATIO, NotebookSpine } from './coverShape';

/** 見本の既定の幅（一覧の行に収まる大きさ） */
const DEFAULT_SWATCH_WIDTH = 14;
/** 背表紙の幅 ÷ 表紙の幅 */
const SPINE_WIDTH_RATIO = 0.12;
/** 小さい見本でも背表紙が見える最小の幅 */
const MIN_SPINE_WIDTH = 3;
/** 角の丸み ÷ 表紙の幅（大きさが変わっても同じ形に見えるように） */
const CORNER_RADIUS_RATIO = 0.07;
const MIN_CORNER_RADIUS = 2;

export function NotebookSwatch({
  color,
  width = DEFAULT_SWATCH_WIDTH,
}: {
  color: string;
  width?: number;
}) {
  return (
    <View
      style={{
        width,
        height: width / COVER_ASPECT_RATIO,
        borderRadius: Math.max(MIN_CORNER_RADIUS, width * CORNER_RADIUS_RATIO),
        overflow: 'hidden',
        backgroundColor: color,
      }}
    >
      <NotebookSpine width={Math.max(MIN_SPINE_WIDTH, width * SPINE_WIDTH_RATIO)} />
    </View>
  );
}
