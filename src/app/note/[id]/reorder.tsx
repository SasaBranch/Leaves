// SC-6 ページ並べ替え（基本設計書 4.3）。
// 並べ替えライブラリが複数列に対応していない（numColumns 非対応）ため、2列グリッドではなく
// 大きめのサムネイルの1列リストにする
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { GripVertical, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NoteId, Page, PageId } from '@/domain/types';
import { useNote } from '@/hooks/useNote';
import { deletePage, reorderPages } from '@/services/notes';
import { useShelf } from '@/state/openShelf';
import { thumbnailFile } from '@/storage/paths';
import { storedImageSource } from '@/ui/imageSource';
import { useTheme } from '@/theme/useTheme';

/** 1列で中身が見分けられる大きさ */
const THUMBNAIL_WIDTH = 120;

export default function ReorderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = id as NoteId;
  const { pages, version, isChanged, reorder, removeFromOrder } = usePageOrder(noteId);
  const confirmDelete = useConfirmDeletePage(pages.length, removeFromOrder);
  const shelf = useShelf();
  const { colors } = useTheme();

  async function saveAndClose() {
    if (isChanged) {
      await reorderPages(
        shelf,
        noteId,
        pages.map((page) => page.id),
      );
    }
    router.back();
  }

  return (
    // モーダルは別のネイティブ画面に表示されるため、ここでもジェスチャーの根が必要
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Header onDone={saveAndClose} />
        <ReorderableList
          data={pages}
          keyExtractor={(page) => page.id}
          onReorder={({ from, to }) => reorder(from, to)}
          renderItem={({ item, index }) => (
            <PageRow
              page={item}
              version={version}
              pageNumber={index + 1}
              onDelete={() => confirmDelete(item)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

/**
 * 画面上の並び順。「完了」まで DB に保存しないので、手元で持つ。
 * 並べ替え・削除をするまでは DB の順番をそのまま表示する
 */
function usePageOrder(noteId: NoteId) {
  const { data } = useNote(noteId);
  const [orderedPages, setOrderedPages] = useState<Page[]>();
  const pages = orderedPages ?? data?.pages ?? [];
  return {
    pages,
    /** サムネイルのキャッシュを差し替えに追従させるためのノートの更新日時 */
    version: data?.note.updatedAt ?? '',
    isChanged: orderedPages !== undefined,
    reorder: (from: number, to: number) => setOrderedPages(reorderItems(pages, from, to)),
    removeFromOrder: (pageId: PageId) =>
      setOrderedPages(pages.filter((page) => page.id !== pageId)),
  };
}

/** ページの削除は確認のうえ即座に行う（キャンセルで戻せるのは並び順だけ）。最後の1ページならノートごと消える（FR-N-08） */
function useConfirmDeletePage(pageCount: number, removeFromOrder: (pageId: PageId) => void) {
  const shelf = useShelf();

  async function remove(page: Page) {
    const { noteDeleted } = await deletePage(shelf, page.id);
    if (noteDeleted) router.dismissTo('/');
    else removeFromOrder(page.id);
  }

  return (page: Page) => {
    const isLastPage = pageCount === 1;
    Alert.alert(
      isLastPage ? 'ノートごと削除しますか？' : 'このページを削除しますか？',
      isLastPage ? '最後のページのため、ノートも削除されます' : undefined,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => remove(page) },
      ],
    );
  };
}

function Header({ onDone }: { onDone: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.header, { borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.headerButton}
      >
        <Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 15 }}>
          キャンセル
        </Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.bold }]}
      >
        ページの並べ替え
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={[styles.headerButton, styles.doneButton]}
      >
        <Text style={{ color: colors.accentText, fontFamily: fonts.bold, fontSize: 15 }}>完了</Text>
      </Pressable>
    </View>
  );
}

function PageRow({
  page,
  version,
  pageNumber,
  onDelete,
}: {
  page: Page;
  version: string;
  pageNumber: number;
  onDelete: () => void;
}) {
  const drag = useReorderableDrag();
  const { colors, fonts } = useTheme();
  const shelf = useShelf();
  return (
    <Pressable
      accessibilityLabel={`${pageNumber} ページ目`}
      accessibilityHint="長押ししてドラッグすると並べ替えられます"
      onLongPress={drag}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <GripVertical size={20} color={colors.muted} />
      <Image
        source={storedImageSource(thumbnailFile(shelf.id, page.id), version)}
        style={[
          styles.thumbnail,
          { aspectRatio: page.width / page.height, backgroundColor: colors.paper },
        ]}
        contentFit="cover"
      />
      <Text style={[styles.pageNumber, { color: colors.text, fontFamily: fonts.bold }]}>
        {pageNumber}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${pageNumber} ページ目を削除`}
        onPress={onDelete}
        style={styles.deleteButton}
      >
        <Trash2 size={20} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { minWidth: 88, height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  doneButton: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 16 },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  thumbnail: { width: THUMBNAIL_WIDTH, borderRadius: 4 },
  pageNumber: { flex: 1, fontSize: 17 },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
