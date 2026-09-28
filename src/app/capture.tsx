// SC-4 スキャン保存（基本設計書 4.3）。新しいノートを作るか、既存ノートにページを足す（FR-N-06）
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Pencil, Plus, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDefaultNoteTitle } from '@/domain/dateTime';
import { isAppError } from '@/domain/errors';
import { validateName } from '@/domain/name';
import type { CapturedImage, NoteId, NotebookId } from '@/domain/types';
import { captureImages } from '@/hooks/useCaptureLauncher';
import { useNotebookPath } from '@/hooks/useNotebookPath';
import { addPagesToNote, createNoteFromCapture } from '@/services/capture';
import { useShelf } from '@/state/openShelf';
import { discardCapturedImages } from '@/storage/pageImages';
import { useTheme } from '@/theme/useTheme';
import { ActionMenu } from '@/ui/components/ActionMenu';
import { NotebookPicker, NotebookPickerHeader } from '@/ui/components/NotebookPicker';
import { TextPromptModal } from '@/ui/components/TextPromptModal';
import { errorMessages } from '@/ui/errorMessages';
import { showingErrors } from '@/ui/showingErrors';

const PAGE_PREVIEW_WIDTH = 128;
const PAGE_PREVIEW_HEIGHT = 171;

type OpenDialog = 'title' | 'destination' | 'addPages' | null;

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ images: string; notebookId?: string; noteId?: string }>();
  const addingToNoteId = (params.noteId || null) as NoteId | null;
  const [images, setImages] = useState(() => JSON.parse(params.images) as CapturedImage[]);
  const [title, setTitle] = useState(() => formatDefaultNoteTitle(new Date()));
  const [notebookId, setNotebookId] = useState((params.notebookId || null) as NotebookId | null);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const { data: notebookPath } = useNotebookPath(notebookId);
  const shelf = useShelf();
  const { colors, fonts } = useTheme();

  async function save() {
    setIsSaving(true);
    const startedAt = performance.now();
    try {
      if (addingToNoteId) {
        await addPagesToNote(shelf, addingToNoteId, images);
        router.back();
      } else {
        const noteId = await createNoteFromCapture(shelf, { images, title, notebookId });
        router.replace({ pathname: '/note/[id]', params: { id: noteId } });
      }
    } catch (error) {
      setErrorMessage(isAppError(error) ? errorMessages[error.kind] : '保存できませんでした');
      setIsSaving(false);
    } finally {
      // 性能計測（#33、NFR-P-04: 保存から操作可能まで2秒以内）
      if (__DEV__) {
        console.log(
          `[perf] save ${images.length}p: ${(performance.now() - startedAt).toFixed(0)}ms`,
        );
      }
    }
  }

  /** 取り込んだ画像は保存しないと失われるため、閉じる前に確認する（NFR-U-04） */
  function confirmClose() {
    Alert.alert(`${images.length} ページを保存せずに閉じますか？`, undefined, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '閉じる',
        style: 'destructive',
        onPress: () => {
          discardCapturedImages(images);
          router.back();
        },
      },
    ]);
  }

  function removePage(image: CapturedImage) {
    discardCapturedImages([image]);
    setImages((current) => current.filter((item) => item.uri !== image.uri));
  }

  async function addPages(source: 'scan' | 'photos') {
    const added = await captureImages(source);
    if (added) setImages((current) => [...current, ...added]);
  }

  const renameTitle = showingErrors((value) => setTitle(validateName(value)));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="保存せずに閉じる"
          onPress={confirmClose}
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
          <PagePreview
            key={image.uri}
            image={image}
            pageNumber={index + 1}
            onRemove={() => removePage(image)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpenDialog('addPages')}
          style={[styles.addPage, { borderColor: colors.border }]}
        >
          <Plus size={24} color={colors.muted} />
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
            追加で撮影
          </Text>
        </Pressable>
      </ScrollView>

      {addingToNoteId ? null : (
        <>
          <Field label="タイトル" value={title} onPress={() => setOpenDialog('title')}>
            <Pencil size={18} color={colors.muted} />
          </Field>
          <Field
            label="保存先"
            value={notebookPath?.length ? notebookPath.join(' › ') : 'ライブラリ'}
            onPress={() => setOpenDialog('destination')}
          >
            <ChevronRight size={18} color={colors.muted} />
          </Field>
        </>
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
        disabled={isSaving || images.length === 0}
        onPress={save}
        style={[
          styles.saveButton,
          {
            backgroundColor: colors.accent,
            opacity: isSaving || images.length === 0 ? 0.6 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 17 }}>
          {isSaving ? '保存中…' : addingToNoteId ? `${images.length} ページを追加` : '保存する'}
        </Text>
      </Pressable>

      <TextPromptModal
        visible={openDialog === 'title'}
        title="ノートの名前"
        initialValue={title}
        submitLabel="変更"
        onSubmit={renameTitle}
        onClose={() => setOpenDialog(null)}
      />
      <ActionMenu
        visible={openDialog === 'addPages'}
        items={[
          { label: 'スキャン', onPress: () => addPages('scan') },
          { label: '写真から取り込み', onPress: () => addPages('photos') },
        ]}
        onClose={() => setOpenDialog(null)}
      />
      <Modal
        visible={openDialog === 'destination'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenDialog(null)}
      >
        <View style={[styles.destination, { backgroundColor: colors.bg }]}>
          <NotebookPickerHeader title="保存先を選択" onCancel={() => setOpenDialog(null)} />
          <NotebookPicker
            onSelect={(selected) => {
              setNotebookId(selected);
              setOpenDialog(null);
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PagePreview({
  image,
  pageNumber,
  onRemove,
}: {
  image: CapturedImage;
  pageNumber: number;
  onRemove: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.page}>
      <Image
        source={{ uri: image.uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessibilityLabel={`${pageNumber} ページ目`}
      />
      <View style={[styles.pageNumber, { backgroundColor: colors.accent }]}>
        <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 12 }}>
          {pageNumber}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${pageNumber} ページ目を除く`}
        onPress={onRemove}
        hitSlop={8}
        style={styles.removePage}
      >
        <X size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onPress,
  children,
}: {
  label: string;
  value: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <View style={styles.fieldText}>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}
        >
          {value}
        </Text>
      </View>
      {children}
    </Pressable>
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
  removePage: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  addPage: {
    width: PAGE_PREVIEW_WIDTH,
    height: PAGE_PREVIEW_HEIGHT,
    borderRadius: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  field: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldText: { flex: 1, gap: 3 },
  note: { fontSize: 12 },
  spacer: { flex: 1 },
  saveButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  destination: { flex: 1 },
});
