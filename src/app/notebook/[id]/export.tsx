// SC-12 まとめて書き出し（基本設計書 4.3、詳細設計書 9.14、FR-E-05〜09）。
// ノートブック直下のノートを選び、順番を並べ替えて、1つの PDF か Markdown の zip にまとめて書き出す
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, GripVertical } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isAppError } from '@/domain/errors';
import type { NotebookId, NoteId, NoteSummary, SortOrder } from '@/domain/types';
import { useNotebook } from '@/hooks/useNotebook';
import {
  type CombinedExportFormat,
  type CombinedExportProgress,
  shareCombinedExport,
} from '@/services/export/combinedExport';
import { syncShelf } from '@/services/sync/syncShelf';
import { useShelf } from '@/state/openShelf';
import { thumbnailFile } from '@/storage/paths';
import { useTheme } from '@/theme/useTheme';
import { errorMessages } from '@/ui/errorMessages';
import { storedImageSource } from '@/ui/imageSource';

/** 1列で表紙が見分けられる大きさ */
const THUMBNAIL_WIDTH = 56;

const FORMAT_LABELS: Record<CombinedExportFormat, string> = { pdf: 'PDF', markdown: 'Markdown' };

export default function ExportTogetherScreen() {
  const { id, sort } = useLocalSearchParams<{ id: string; sort?: SortOrder }>();
  const notebookId = id as NotebookId;
  const { data } = useNotebook(notebookId, sort ?? 'updatedAt');
  const selection = useNoteSelection(data?.notes ?? []);
  const [format, setFormat] = useState<CombinedExportFormat>('pdf');
  const { progress, start, cancel } = useCombinedExport(notebookId);
  const { colors, fonts } = useTheme();

  return (
    // モーダルは別のネイティブ画面に表示されるため、ここでもジェスチャーの根が必要
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Header notebookName={data?.notebook.name ?? ''} />
        <View style={styles.summary}>
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>
            {selection.selectedNotes.length} ノート · {selection.selectedPageCount} ページを選択中
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={selection.isAllSelected ? selection.selectNone : selection.selectAll}
            style={styles.summaryButton}
          >
            <Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 14 }}>
              {selection.isAllSelected ? '選択を解除' : 'すべて選択'}
            </Text>
          </Pressable>
        </View>
        <ReorderableList
          data={selection.rows}
          keyExtractor={(row) => row.note.id}
          onReorder={({ from, to }) => selection.reorder(from, to)}
          renderItem={({ item }) => (
            <NoteRow
              note={item.note}
              selected={item.selected}
              onToggle={() => selection.toggle(item.note.id)}
            />
          )}
          contentContainerStyle={styles.list}
        />
        <View style={[styles.footer, { borderColor: colors.border }]}>
          <FormatToggle format={format} onChange={setFormat} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: selection.selectedNotes.length === 0 }}
            disabled={selection.selectedNotes.length === 0}
            onPress={() => start(format, selection.selectedNotes)}
            style={[
              styles.exportButton,
              {
                backgroundColor: colors.accent,
                opacity: selection.selectedNotes.length === 0 ? 0.4 : 1,
              },
            ]}
          >
            <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 16 }}>
              書き出す
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
      {progress ? <ProgressOverlay progress={progress} onCancel={cancel} /> : null}
    </GestureHandlerRootView>
  );
}

type Row = { note: NoteSummary; selected: boolean };

/**
 * 画面上の順番と選択。保存しないので手元で持つ（基本設計書 SC-12）。
 * 一覧が変わったとき（外部で消された・増えた）は、消えたノートを除き、増えたノートを末尾に足す
 */
function useNoteSelection(notes: NoteSummary[]) {
  const [order, setOrder] = useState<NoteId[] | null>(null);
  // 最初はすべて選択（ノートブック全体をまとめる使い方が多いため）。外したノートだけを覚える
  const [unselected, setUnselected] = useState<ReadonlySet<NoteId>>(new Set());

  const byId = new Map(notes.map((note) => [note.id, note]));
  const orderedIds = [
    ...(order ?? []).filter((noteId) => byId.has(noteId)),
    ...notes.map((note) => note.id).filter((noteId) => !order?.includes(noteId)),
  ];
  const rows: Row[] = orderedIds.map((noteId) => ({
    note: byId.get(noteId)!,
    selected: !unselected.has(noteId),
  }));
  const selectedNotes = rows.filter((row) => row.selected).map((row) => row.note);

  return {
    rows,
    selectedNotes,
    selectedPageCount: selectedNotes.reduce((sum, note) => sum + note.pageCount, 0),
    isAllSelected: rows.length > 0 && selectedNotes.length === rows.length,
    reorder: (from: number, to: number) => setOrder(reorderItems(orderedIds, from, to)),
    toggle: (noteId: NoteId) =>
      setUnselected((current) => {
        const next = new Set(current);
        if (next.has(noteId)) next.delete(noteId);
        else next.add(noteId);
        return next;
      }),
    selectAll: () => setUnselected(new Set()),
    selectNone: () => setUnselected(new Set(orderedIds)),
  };
}

/** 書き出しの実行と進み具合。取り消しは AbortController で伝える（FR-E-09） */
function useCombinedExport(notebookId: NotebookId) {
  const shelf = useShelf();
  const [progress, setProgress] = useState<CombinedExportProgress | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function start(format: CombinedExportFormat, notes: NoteSummary[]) {
    controller.current = new AbortController();
    setProgress({ finishedNotes: 0, totalNotes: notes.length });
    try {
      const result = await shareCombinedExport(
        shelf,
        format,
        notebookId,
        notes.map((note) => note.id),
        { signal: controller.current.signal, onProgress: setProgress },
      );
      if (result === 'shared') router.back();
    } catch (error) {
      if (!isAppError(error)) console.error(error);
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : errorMessages.exportFailed);
      // 外部で消されたノートを一覧から消すため、フォルダの状態を読み直す
      if (isAppError(error, 'exportNoteMissing')) {
        syncShelf(shelf).catch((syncError: unknown) => console.warn(syncError));
      }
    } finally {
      setProgress(null);
      controller.current = null;
    }
  }

  return { progress, start, cancel: () => controller.current?.abort() };
}

function Header({ notebookName }: { notebookName: string }) {
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
        まとめて書き出し
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.headerButton,
          styles.headerSide,
          { color: colors.muted, fontFamily: fonts.regular },
        ]}
      >
        {notebookName}
      </Text>
    </View>
  );
}

function NoteRow({
  note,
  selected,
  onToggle,
}: {
  note: NoteSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  const drag = useReorderableDrag();
  const shelf = useShelf();
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${note.title}、${note.pageCount} ページ`}
      onPress={onToggle}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        style={[
          styles.checkbox,
          selected
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { borderColor: colors.muted },
        ]}
      >
        {selected ? <Check size={16} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
      <Image
        source={storedImageSource(thumbnailFile(shelf.id, note.coverPageId), note.updatedAt)}
        style={[styles.thumbnail, { backgroundColor: colors.paper }]}
        contentFit="cover"
      />
      <View style={styles.rowTexts}>
        <Text
          numberOfLines={2}
          style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}
        >
          {note.title}
        </Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
          {note.pageCount} ページ
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${note.title}を並べ替え`}
        accessibilityHint="長押ししてドラッグすると並べ替えられます"
        onLongPress={drag}
        delayLongPress={150}
        style={styles.grip}
      >
        <GripVertical size={22} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

function FormatToggle({
  format,
  onChange,
}: {
  format: CombinedExportFormat;
  onChange: (format: CombinedExportFormat) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.toggle, { backgroundColor: colors.surface2 }]}>
      {(Object.keys(FORMAT_LABELS) as CombinedExportFormat[]).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityState={{ selected: option === format }}
          onPress={() => onChange(option)}
          style={[styles.toggleItem, option === format && { backgroundColor: colors.surface }]}
        >
          <Text
            style={{
              color: option === format ? colors.text : colors.muted,
              fontFamily: option === format ? fonts.bold : fonts.medium,
              fontSize: 14,
            }}
          >
            {FORMAT_LABELS[option]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProgressOverlay({
  progress,
  onCancel,
}: {
  progress: CombinedExportProgress;
  onCancel: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.overlay}>
      <View style={[styles.progressCard, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}>
          書き出し中… {progress.finishedNotes} / {progress.totalNotes} ノート
        </Text>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={{ color: colors.accentText, fontFamily: fonts.bold, fontSize: 15 }}>
            取り消す
          </Text>
        </Pressable>
      </View>
    </View>
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
  headerButton: { minWidth: 88, maxWidth: 110, paddingHorizontal: 8 },
  headerSide: { textAlign: 'right', fontSize: 13 },
  headerTitle: { fontSize: 16 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
  },
  summaryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: { width: THUMBNAIL_WIDTH, aspectRatio: 3 / 4, borderRadius: 4 },
  rowTexts: { flex: 1, gap: 4 },
  grip: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggle: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  toggleItem: { minHeight: 40, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center' },
  exportButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCard: {
    minWidth: 240,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 14,
  },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
