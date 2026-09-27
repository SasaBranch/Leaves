// ノートブックを小さく示す表紙の見本（チップ・移動先の一覧）。フォルダのアイコンは使わない（基本設計書 2.1）
import { StyleSheet, View } from 'react-native';

export function NotebookSwatch({ color }: { color: string }) {
  return (
    <View style={[styles.cover, { backgroundColor: color }]}>
      <View style={styles.spine} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: 14, height: 18, borderRadius: 2, overflow: 'hidden' },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
});
