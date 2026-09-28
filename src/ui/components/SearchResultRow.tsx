// 検索結果の1行（基本設計書 4.3 SC-7）: サムネイル、ノート名、ページ番号、所属パス、一致箇所
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SearchHit } from '@/domain/types';
import { useShelf } from '@/state/openShelf';
import { thumbnailFile } from '@/storage/paths';
import { useTheme } from '@/theme/useTheme';

const THUMBNAIL_WIDTH = 50;
const THUMBNAIL_HEIGHT = 66;

export function SearchResultRow({ hit, onPress }: { hit: SearchHit; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const shelf = useShelf();
  const pageNumber = hit.pagePosition + 1;
  const path = hit.notebookPath.length > 0 ? hit.notebookPath.join(' › ') : 'ライブラリ';
  const { before, match, after } = hit.snippet;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hit.noteTitle}、${pageNumber}ページ、${path}、${before}${match}${after}`}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.thumbnail, { backgroundColor: colors.paper }]}>
        <Image
          source={{ uri: thumbnailFile(shelf.id, hit.pageId).uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={hit.pageId}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.text, fontFamily: fonts.bold }]}
          >
            {hit.noteTitle}
          </Text>
          <Text style={[styles.meta, { color: colors.muted, fontFamily: fonts.regular }]}>
            p.{pageNumber}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: colors.muted, fontFamily: fonts.regular }]}
        >
          {path}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.snippet, { color: colors.text, fontFamily: fonts.regular }]}
        >
          {before}
          <Text
            style={{
              color: colors.accentText,
              backgroundColor: colors.accentSoft,
              fontFamily: fonts.bold,
            }}
          >
            {match}
          </Text>
          {after}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnail: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 4,
    overflow: 'hidden',
  },
  body: { flex: 1, gap: 3 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, fontSize: 15 },
  meta: { fontSize: 12 },
  snippet: { marginTop: 2, fontSize: 13, lineHeight: 19 },
});
