// SC-5 ノート表示（基本設計書 4.3）
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowUpDown,
  Camera,
  ChevronLeft,
  Copy,
  FileText,
  FolderInput,
  Share,
  Trash2,
  Type,
} from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fitContainer, Gallery, type GalleryRefType } from 'react-native-zoom-toolkit';

import { isAppError } from '@/domain/errors';
import type { NoteId, Page } from '@/domain/types';
import { useCaptureLauncher } from '@/hooks/useCaptureLauncher';
import { useLeaveWhenDeleted } from '@/hooks/useLeaveWhenDeleted';
import { useNote } from '@/hooks/useNote';
import { shareExport, type ExportFormat } from '@/services/export/shareExport';
import { deleteNote, renameNote } from '@/services/notes';
import { retryOcr } from '@/services/ocrQueue';
import { useDb } from '@/state/database';
import { pageImageFile, thumbnailFile } from '@/storage/paths';
import { useTheme } from '@/theme/useTheme';
import { ActionMenu, type ActionMenuItem } from '@/ui/components/ActionMenu';
import { OcrStatusChip } from '@/ui/components/OcrStatusChip';
import { TextPromptModal } from '@/ui/components/TextPromptModal';
import { errorMessages } from '@/ui/errorMessages';
import { formatListDate } from '@/ui/formatDate';

/** 折りたたんだボトムシートの高さ（OCR テキスト2行と操作ボタンが見える） */
const SHEET_COLLAPSED_HEIGHT = 220;
const SHEET_SNAP_POINTS = [SHEET_COLLAPSED_HEIGHT, '75%'];
/** ページを画面いっぱいより少し内側に置き、紙として見せる余白 */
const PAGE_MARGIN = 16;

type OpenMenu = 'export' | 'addPages' | null;

export default function NoteScreen() {
  const params = useLocalSearchParams<{ id: string; page?: string }>();
  const noteId = params.id as NoteId;
  const { data } = useNote(noteId);
  useLeaveWhenDeleted(data);
  const [currentIndex, setCurrentIndex] = useState(() => Number(params.page ?? 0));
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const galleryRef = useRef<GalleryRefType>(null);
  const db = useDb();
  const { colors, fonts } = useTheme();
  const { scan, importPhotos } = useCaptureLauncher({ noteId });

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.stage }} />;
  const { note, pages, notebookPath } = data;
  const currentPage = pages[Math.min(currentIndex, pages.length - 1)];

  function showPage(index: number) {
    setCurrentIndex(index);
    galleryRef.current?.setIndex(index);
  }

  async function exportAs(format: ExportFormat) {
    try {
      await shareExport(db, format, noteId, { pageId: currentPage?.id });
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '書き出しに失敗しました');
    }
  }

  async function rename(title: string) {
    try {
      await renameNote(db, noteId, title);
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '名前を変更できませんでした');
      throw error; // ダイアログを閉じずに入力し直してもらう
    }
  }

  /** 取り消せないため、消えるページ数を示して確認する（NFR-U-04） */
  function confirmDelete() {
    Alert.alert(`「${note.title}」を削除しますか？`, `${pages.length} ページが削除されます`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => deleteNote(db, noteId) },
    ]);
  }

  const menus: Record<Exclude<OpenMenu, null>, ActionMenuItem[]> = {
    export: [
      { label: 'PDF で書き出し', onPress: () => exportAs('pdf') },
      { label: 'Markdown で書き出し', onPress: () => exportAs('markdown') },
      { label: 'このページの画像を共有', onPress: () => exportAs('pageImage') },
    ],
    addPages: [
      { label: 'スキャン', onPress: scan },
      { label: '写真から取り込み', onPress: importPhotos },
    ],
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.stage }]}>
      <View style={styles.header}>
        <IconButton label="戻る" onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.accentText} />
        </IconButton>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="タップすると名前を変更できます"
          onPress={() => setIsRenaming(true)}
          style={styles.headerTitle}
        >
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}
          >
            {note.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}
          >
            {[...(notebookPath.length > 0 ? notebookPath : ['ライブラリ'])].join(' › ')} ·{' '}
            {formatListDate(note.updatedAt)}
          </Text>
        </Pressable>
        <IconButton label="共有・書き出し" onPress={() => setOpenMenu('export')}>
          <Share size={21} color={colors.text} />
        </IconButton>
      </View>

      <PageGallery
        pages={pages}
        initialIndex={currentIndex}
        galleryRef={galleryRef}
        onIndexChange={setCurrentIndex}
      />
      <PageStrip pages={pages} currentIndex={currentIndex} onSelect={showPage} />

      <BottomSheet
        snapPoints={SHEET_SNAP_POINTS}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.toolbar}>
            <ToolButton label="ページ追加" onPress={() => setOpenMenu('addPages')}>
              <Camera size={22} color={colors.text} />
            </ToolButton>
            <ToolButton
              label="並べ替え"
              onPress={() =>
                router.push({ pathname: '/note/[id]/reorder', params: { id: noteId } })
              }
            >
              <ArrowUpDown size={22} color={colors.text} />
            </ToolButton>
            <ToolButton label="書き出し" onPress={() => setOpenMenu('export')}>
              <FileText size={22} color={colors.text} />
            </ToolButton>
            <ToolButton
              label="移動"
              onPress={() =>
                router.push({ pathname: '/move', params: { kind: 'note', id: noteId } })
              }
            >
              <FolderInput size={22} color={colors.text} />
            </ToolButton>
            <ToolButton label="削除" onPress={confirmDelete} destructive>
              <Trash2 size={22} color={colors.danger} />
            </ToolButton>
          </View>
          {currentPage ? (
            <OcrSection page={currentPage} onRetry={() => retryOcr(db, currentPage.id)} />
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>

      <ActionMenu
        visible={openMenu !== null}
        items={openMenu ? menus[openMenu] : []}
        onClose={() => setOpenMenu(null)}
      />
      <TextPromptModal
        visible={isRenaming}
        title="ノートの名前"
        initialValue={note.title}
        submitLabel="変更"
        onSubmit={rename}
        onClose={() => setIsRenaming(false)}
      />
    </SafeAreaView>
  );
}

/** ページを左右スワイプで切り替え、ピンチで拡大する（FR-N-01〜02） */
function PageGallery({
  pages,
  initialIndex,
  galleryRef,
  onIndexChange,
}: {
  pages: Page[];
  initialIndex: number;
  galleryRef: React.RefObject<GalleryRefType | null>;
  onIndexChange: (index: number) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View style={styles.gallery} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      {size.width > 0 ? (
        <Gallery
          ref={galleryRef}
          data={pages}
          initialIndex={initialIndex}
          keyExtractor={(page) => page.id}
          onIndexChange={onIndexChange}
          renderItem={(page) => (
            <Image
              source={{ uri: pageImageFile(page.id).uri }}
              style={fitContainer(page.width / page.height, {
                width: size.width - PAGE_MARGIN * 2,
                height: size.height - PAGE_MARGIN * 2,
              })}
              contentFit="contain"
              accessibilityLabel={`${page.position + 1} ページ目`}
            />
          )}
        />
      ) : null}
    </View>
  );
}

/** ページの小さなサムネイル列。今のページを accent の枠で示す */
function PageStrip({
  pages,
  currentIndex,
  onSelect,
}: {
  pages: Page[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.strip}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripThumbs}
      >
        {pages.map((page, index) => (
          <Pressable
            key={page.id}
            accessibilityRole="button"
            accessibilityLabel={`${index + 1} ページ目を表示`}
            onPress={() => onSelect(index)}
            style={[
              styles.stripThumb,
              {
                backgroundColor: colors.paper,
                borderColor: index === currentIndex ? colors.accent : colors.border,
                borderWidth: index === currentIndex ? 2 : 1,
              },
            ]}
          >
            <Image
              source={{ uri: thumbnailFile(page.id).uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          </Pressable>
        ))}
      </ScrollView>
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>
        {currentIndex + 1} / {pages.length}
      </Text>
    </View>
  );
}

/** 文字認識の結果（FR-O-05〜06）。失敗したら再実行できる */
function OcrSection({ page, onRetry }: { page: Page; onRetry: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.ocr}>
      <View style={styles.ocrHeader}>
        <Type size={18} color={colors.accentText} />
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 14 }}>
          文字認識テキスト
        </Text>
        <OcrStatusChip status={page.ocrStatus} />
        <View style={styles.flexSpacer} />
        {page.ocrStatus === 'failed' ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <Text style={{ color: colors.accentText, fontFamily: fonts.bold }}>再実行</Text>
          </Pressable>
        ) : (
          <IconButton
            label="テキストをコピー"
            onPress={() => Clipboard.setStringAsync(page.ocrText)}
          >
            <Copy size={17} color={colors.text} />
          </IconButton>
        )}
      </View>
      <Text
        selectable
        style={{ color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }}
      >
        {page.ocrText}
      </Text>
    </View>
  );
}

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconButton}
    >
      {children}
    </Pressable>
  );
}

function ToolButton({
  label,
  onPress,
  destructive = false,
  children,
}: {
  label: string;
  onPress: () => void;
  /** 削除など取り消せない操作は色で区別する */
  destructive?: boolean;
  children: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.toolButton}>
      {children}
      <Text
        style={{
          color: destructive ? colors.danger : colors.text,
          fontFamily: fonts.regular,
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { flex: 1, gap: 2 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gallery: { flex: 1 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: SHEET_COLLAPSED_HEIGHT + 12,
  },
  stripThumbs: { gap: 8 },
  stripThumb: { width: 34, height: 46, borderRadius: 3, overflow: 'hidden' },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  toolbar: { flexDirection: 'row' },
  toolButton: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 5 },
  ocr: { gap: 8 },
  ocrHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexSpacer: { flex: 1 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
