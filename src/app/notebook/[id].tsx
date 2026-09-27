// SC-2 ノートブック（基本設計書 4.3）
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Ellipsis, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NotebookId, SortOrder } from '@/domain/types';
import { useCaptureLauncher } from '@/hooks/useCaptureLauncher';
import { useItemMenus } from '@/hooks/useItemMenus';
import { useLeaveWhenDeleted } from '@/hooks/useLeaveWhenDeleted';
import { useNotebook } from '@/hooks/useNotebook';
import { useTheme } from '@/theme/useTheme';
import { ACTION_BAR_CLEARANCE, ActionBar } from '@/ui/components/ActionBar';
import { CoverGrid } from '@/ui/components/CoverGrid';
import { NotebookSwatch } from '@/ui/components/NotebookSwatch';
import { SortToggle } from '@/ui/components/SortToggle';
import { formatListDate } from '@/ui/formatDate';

/** 見出しに出す表紙の幅 */
const HEADER_COVER_WIDTH = 54;

export default function NotebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const notebookId = id as NotebookId;
  const [sort, setSort] = useState<SortOrder>('updatedAt');
  const { data } = useNotebook(notebookId, sort);
  useLeaveWhenDeleted(data);
  const { scan, importPhotos } = useCaptureLauncher({ notebookId });
  const { openNotebookMenu, openNoteMenu, menusElement } = useItemMenus();
  const { colors, fonts } = useTheme();

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const { notebook, parentName, childNotebooks, notes, pageCount } = data;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${parentName ?? 'ライブラリ'}に戻る`}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ChevronLeft size={24} color={colors.accentText} />
          <Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 15 }}>
            {parentName ?? 'ライブラリ'}
          </Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="このノートブック内を検索"
            onPress={() => router.push({ pathname: '/search', params: { scope: notebookId } })}
            style={styles.iconButton}
          >
            <Search size={21} color={colors.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="このノートブックの操作"
            onPress={() => openNotebookMenu(notebook)}
            style={styles.iconButton}
          >
            <Ellipsis size={22} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: ACTION_BAR_CLEARANCE }}>
        <View style={styles.titleBlock}>
          <NotebookSwatch color={notebook.color} width={HEADER_COVER_WIDTH} />
          <View style={styles.titleText}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 26 }}
            >
              {notebook.name}
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
              {notes.length} ノート · {pageCount} ページ · {formatListDate(notebook.updatedAt)}更新
            </Text>
          </View>
        </View>

        {childNotebooks.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {childNotebooks.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/notebook/[id]', params: { id: child.id } })
                }
                onLongPress={() => openNotebookMenu(child)}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <NotebookSwatch color={child.color} />
                <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 13 }}>
                  {child.name}
                </Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
                  {child.noteCount}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.sortRow}>
          <SortToggle sort={sort} onChange={setSort} />
        </View>
        <CoverGrid
          notebooks={[]}
          notes={notes}
          columns={2}
          columnGap={16}
          onNotebookLongPress={openNotebookMenu}
          onNoteLongPress={openNoteMenu}
        />
      </ScrollView>
      <ActionBar onScan={scan} onImport={importPhotos} />
      {menusElement}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  back: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 8 },
  headerActions: { flexDirection: 'row' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, paddingTop: 14 },
  titleText: { flex: 1, gap: 4 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  sortRow: { paddingHorizontal: 20, marginTop: 24, marginBottom: 14 },
});
