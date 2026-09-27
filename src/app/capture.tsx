// SC-4 スキャン保存（基本設計書 4.3）。新しいノートを作るか、既存ノートにページを足す（FR-N-06）
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatLocalDateTime } from '@/domain/dateTime';
import { isAppError } from '@/domain/errors';
import type { CapturedImage, NoteId, NotebookId } from '@/domain/types';
import { addPagesToNote, createNoteFromCapture } from '@/services/capture';
import { useDb } from '@/state/database';
import { useTheme } from '@/theme/useTheme';
import { errorMessages } from '@/ui/errorMessages';

const PAGE_PREVIEW_WIDTH = 128;
const PAGE_PREVIEW_HEIGHT = 171;

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ images: string; notebookId?: string; noteId?: string }>();
  const images = useMemo(() => JSON.parse(params.images) as CapturedImage[], [params.images]);
  const isAddingPages = Boolean(params.noteId);
  const [title] = useState(() => formatLocalDateTime(new Date()));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const db = useDb();
  const { colors, fonts } = useTheme();

  async function save() {
    setIsSaving(true);
    try {
      if (isAddingPages) {
        await addPagesToNote(db, params.noteId as NoteId, images);
        router.back();
      } else {
        const noteId = await createNoteFromCapture(db, {
          images,
          title,
          notebookId: (params.notebookId || null) as NotebookId | null,
        });
        router.replace({ pathname: '/note/[id]', params: { id: noteId } });
      }
    } catch (error) {
      setErrorMessage(isAppError(error) ? errorMessages[error.kind] : '保存できませんでした');
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="保存せずに閉じる"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <X size={22} color={colors.muted} />
        </Pressable>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>
          スキャン完了
        </Text>
        <View style={styles.iconButton} />
      </View>

      <Text style={[styles.heading, { color: colors.text, fontFamily: fonts.bold }]}>
        <Text style={{ color: colors.accentText, fontFamily: fonts.logo, fontSize: 34 }}>
          {images.length}
        </Text>
        {'  '}ページを取り込みました
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pages}
        style={styles.pagesScroll}
      >
        {images.map((image, index) => (
          <View key={image.uri} style={styles.page}>
            <Image
              source={{ uri: image.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={`${index + 1} ページ目`}
            />
            <View style={[styles.pageNumber, { backgroundColor: colors.accent }]}>
              <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 12 }}>
                {index + 1}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {isAddingPages ? null : (
        <View
          style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
            タイトル
          </Text>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{title}</Text>
        </View>
      )}
      <Text style={[styles.note, { color: colors.muted, fontFamily: fonts.regular }]}>
        保存後、端末内で文字認識を行います（通信なし）
      </Text>
      {errorMessage ? (
        <Text style={{ color: colors.danger, fontFamily: fonts.medium }}>{errorMessage}</Text>
      ) : null}

      <View style={styles.spacer} />
      <Pressable
        accessibilityRole="button"
        disabled={isSaving}
        onPress={save}
        style={[styles.saveButton, { backgroundColor: colors.accent, opacity: isSaving ? 0.6 : 1 }]}
      >
        <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 17 }}>
          {isSaving ? '保存中…' : isAddingPages ? `${images.length} ページを追加` : '保存する'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 16 },
  pagesScroll: { flexGrow: 0 },
  pages: { gap: 12 },
  page: {
    width: PAGE_PREVIEW_WIDTH,
    height: PAGE_PREVIEW_HEIGHT,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pageNumber: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  note: { fontSize: 12 },
  spacer: { flex: 1 },
  saveButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
});
