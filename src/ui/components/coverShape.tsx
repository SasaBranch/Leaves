// ノート・ノートブックの表紙に共通する形（基本設計書 2.4）
import { StyleSheet, View } from 'react-native';

/** 表紙の縦横比（紙のノートに近い 3:4）。ノートとノートブックを同じ比率にしてグリッドの段をそろえる */
export const COVER_ASPECT_RATIO = 3 / 4;

/** ノートブック表紙の左端の背表紙。大きさの違う表紙（一覧・見出し・小さな見本）で同じ見た目にする */
export function NotebookSpine({ width }: { width: number }) {
  return <View style={[styles.spine, { width }]} />;
}

const styles = StyleSheet.create({
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
});
