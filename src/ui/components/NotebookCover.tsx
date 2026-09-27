// ノートブック表紙（基本設計書 2.4）: フォルダではなく、色付き表紙に紙が重なった冊子として見せる
import { Leaf } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NotebookSummary } from '@/domain/types';
import { useTheme } from '@/theme/useTheme';

const COVER_ASPECT_RATIO = 3 / 4;
/** 表紙の後ろに重ねる紙1枚あたりのずらし幅 */
const STACKED_PAGE_OFFSET = 3;

export function NotebookCover({
  notebook,
  width,
  onPress,
  onLongPress,
}: {
  notebook: NotebookSummary;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const coverWidth = width - STACKED_PAGE_OFFSET * 2;
  const coverHeight = width / COVER_ASPECT_RATIO;
  const pageEdgeColors = isDark ? ['#A9A69B', '#CFCBBF'] : ['#D2D0C7', '#E4E2DA'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`ノートブック ${notebook.name}、${notebook.noteCount}ノート`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width }}
    >
      <View style={{ height: coverHeight }}>
        {pageEdgeColors.map((color, index) => {
          const offset = STACKED_PAGE_OFFSET * (pageEdgeColors.length - index);
          return (
            <View
              key={color}
              style={[
                styles.stackedPage,
                {
                  left: offset,
                  top: offset,
                  width: coverWidth,
                  height: coverHeight - 6,
                  backgroundColor: color,
                },
              ]}
            />
          );
        })}
        <View
          style={[
            styles.cover,
            { width: coverWidth, height: coverHeight - 6, backgroundColor: notebook.color },
          ]}
        >
          <View style={styles.spine} />
          <View style={styles.label}>
            <Text numberOfLines={1} style={[styles.labelText, { fontFamily: fonts.bold }]}>
              {notebook.name}
            </Text>
          </View>
          <Leaf size={18} color="rgba(255,255,255,0.45)" style={styles.leaf} />
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={[styles.title, { color: colors.text, fontFamily: fonts.bold }]}
      >
        {notebook.name}
      </Text>
      <Text style={[styles.meta, { color: colors.muted, fontFamily: fonts.regular }]}>
        {notebook.noteCount} ノート
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stackedPage: { position: 'absolute', borderRadius: 4 },
  cover: {
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 9,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  label: {
    position: 'absolute',
    left: 19,
    right: 10,
    top: 20,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  labelText: { color: '#1D2A22', fontSize: 11, textAlign: 'center' },
  leaf: { position: 'absolute', right: 10, bottom: 10 },
  title: { marginTop: 9, fontSize: 13 },
  meta: { marginTop: 2, fontSize: 11 },
});
