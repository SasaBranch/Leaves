// ノート表紙（基本設計書 2.4）: 1ページ目のサムネイルを紙として見せ、右下にページ数
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NoteSummary } from '@/domain/types';
import { thumbnailFile } from '@/storage/paths';
import { useTheme } from '@/theme/useTheme';
import { formatListDate } from '@/ui/formatDate';

/** 表紙の縦横比（紙のノートに近い 3:4） */
const COVER_ASPECT_RATIO = 3 / 4;

export function NoteCover({
  note,
  width,
  onPress,
  onLongPress,
}: {
  note: NoteSummary;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${note.title}、${note.pageCount}ページ`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width }}
    >
      <View
        style={[
          styles.paper,
          { width, height: width / COVER_ASPECT_RATIO, backgroundColor: colors.paper },
        ]}
      >
        <Image
          source={{ uri: thumbnailFile(note.coverPageId).uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={note.coverPageId}
        />
        <View style={styles.pageBadge}>
          <Text style={[styles.pageBadgeText, { fontFamily: fonts.bold }]}>{note.pageCount}p</Text>
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={[styles.title, { color: colors.text, fontFamily: fonts.bold }]}
      >
        {note.title}
      </Text>
      <Text style={[styles.meta, { color: colors.muted, fontFamily: fonts.regular }]}>
        {formatListDate(note.updatedAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paper: {
    borderRadius: 5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pageBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(20,32,24,0.72)',
  },
  pageBadgeText: { color: '#FFFFFF', fontSize: 10 },
  title: { marginTop: 8, fontSize: 13 },
  meta: { marginTop: 2, fontSize: 11 },
});
