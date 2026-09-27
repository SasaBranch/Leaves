// SC-5 ノート表示（最小版。#18）。ズーム・ボトムシート・ページ操作は M3 で行う
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NoteId, OcrStatus, Page } from '@/domain/types';
import { useNote } from '@/hooks/useNote';
import { retryOcr } from '@/services/ocrQueue';
import { useDb } from '@/state/database';
import { pageImageFile } from '@/storage/paths';
import { useTheme } from '@/theme/useTheme';

const OCR_STATUS_LABELS: Record<OcrStatus, string> = {
  pending: '認識待ち',
  processing: '認識中…',
  done: '認識済み',
  failed: '認識できませんでした',
};

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useNote(id as NoteId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { width } = useWindowDimensions();
  const { colors, fonts } = useTheme();
  const db = useDb();

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.stage }} />;
  const currentPage: Page | undefined = data.pages[currentIndex];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.stage }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.bold }]}>
          {data.note.title}
        </Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular }}>
          {['ライブラリ', ...data.notebookPath].join(' › ')} · {currentIndex + 1} /{' '}
          {data.pages.length}
        </Text>
      </View>
      <FlatList
        data={data.pages}
        horizontal
        pagingEnabled
        keyExtractor={(page) => page.id}
        onMomentumScrollEnd={(event) =>
          setCurrentIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={[styles.pageContainer, { width }]}>
            <Image
              source={{ uri: pageImageFile(item.id).uri }}
              style={[styles.page, { aspectRatio: item.width / item.height }]}
              contentFit="contain"
            />
          </View>
        )}
      />
      {currentPage ? (
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.accentText, fontFamily: fonts.bold }}>
            文字認識: {OCR_STATUS_LABELS[currentPage.ocrStatus]}
          </Text>
          {currentPage.ocrStatus === 'failed' ? (
            <Pressable accessibilityRole="button" onPress={() => retryOcr(db, currentPage.id)}>
              <Text style={{ color: colors.accentText, fontFamily: fonts.medium }}>再実行</Text>
            </Pressable>
          ) : null}
          <Text
            selectable
            numberOfLines={6}
            style={{ color: colors.text, fontFamily: fonts.regular }}
          >
            {currentPage.ocrText}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12, gap: 4 },
  title: { fontSize: 17 },
  pageContainer: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  page: { width: '100%', borderRadius: 4 },
  sheet: { borderTopWidth: 1, padding: 20, gap: 8, minHeight: 180 },
});
