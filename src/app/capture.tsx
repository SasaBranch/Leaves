// SC-4 スキャン保存（最小版。#18）。仕上げは M3 で行う
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDefaultTitle } from '@/domain/defaultTitle';
import { isAppError } from '@/domain/errors';
import type { CapturedImage, NotebookId } from '@/domain/types';
import { createNoteFromCapture } from '@/services/capture';
import { useDb } from '@/state/database';
import { useTheme } from '@/theme/useTheme';
import { errorMessages } from '@/ui/errorMessages';

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ images: string; notebookId?: string }>();
  const images = useMemo(() => JSON.parse(params.images) as CapturedImage[], [params.images]);
  const [title] = useState(() => formatDefaultTitle(new Date()));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const db = useDb();
  const { colors, fonts } = useTheme();

  async function save() {
    setIsSaving(true);
    try {
      const noteId = await createNoteFromCapture(db, {
        images,
        title,
        notebookId: (params.notebookId as NotebookId | undefined) ?? null,
      });
      router.replace({ pathname: '/note/[id]', params: { id: noteId } });
    } catch (error) {
      setErrorMessage(isAppError(error) ? errorMessages[error.kind] : '保存できませんでした');
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Text style={[styles.heading, { color: colors.text, fontFamily: fonts.bold }]}>
        {images.length} ページを取り込みました
      </Text>
      <ScrollView horizontal contentContainerStyle={styles.pages}>
        {images.map((image, index) => (
          <Image
            key={image.uri}
            source={{ uri: image.uri }}
            style={styles.page}
            contentFit="cover"
            accessibilityLabel={`${index + 1} ページ目`}
          />
        ))}
      </ScrollView>
      <View style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular }}>タイトル</Text>
        <Text style={[styles.fieldValue, { color: colors.text, fontFamily: fonts.bold }]}>
          {title}
        </Text>
      </View>
      {errorMessage ? (
        <Text style={{ color: colors.text, fontFamily: fonts.regular }}>{errorMessage}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isSaving}
        onPress={save}
        style={[styles.saveButton, { backgroundColor: colors.accent, opacity: isSaving ? 0.6 : 1 }]}
      >
        <Text style={[styles.saveLabel, { color: colors.onAccent, fontFamily: fonts.bold }]}>
          {isSaving ? '保存中…' : '保存する'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, gap: 20 },
  heading: { fontSize: 18, marginTop: 16 },
  pages: { gap: 12 },
  page: { width: 128, height: 171, borderRadius: 4 },
  field: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  fieldValue: { fontSize: 16 },
  saveButton: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 17 },
});
