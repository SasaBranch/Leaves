// SC-1 ライブラリ（基本設計書 4.3）
import { router } from 'expo-router';
import { FolderPlus, Leaf, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SortOrder } from '@/domain/types';
import { useCaptureLauncher } from '@/hooks/useCaptureLauncher';
import { useItemMenus } from '@/hooks/useItemMenus';
import { useLibrary } from '@/hooks/useLibrary';
import { useTheme } from '@/theme/useTheme';
import { ActionBar } from '@/ui/components/ActionBar';
import { CoverGrid } from '@/ui/components/CoverGrid';
import { NoteCover } from '@/ui/components/NoteCover';
import { SortToggle } from '@/ui/components/SortToggle';

/** 「最近のノート」の表紙の幅（横スクロール） */
const RECENT_COVER_WIDTH = 112;
/** 画面下のアクションバーに一覧の最後が隠れないための余白 */
const ACTION_BAR_CLEARANCE = 120;

export default function LibraryScreen() {
  const [sort, setSort] = useState<SortOrder>('updatedAt');
  const { data } = useLibrary(sort);
  const { scan, importPhotos } = useCaptureLauncher({ notebookId: null });
  const { openNotebookMenu, openNoteMenu, openCreateNotebook, menusElement } = useItemMenus();
  const { colors, fonts } = useTheme();
  const isEmpty = data && data.notebooks.length === 0 && data.notes.length === 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: ACTION_BAR_CLEARANCE }}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Leaf size={26} color={colors.accentText} />
            <Text style={[styles.logoText, { color: colors.text, fontFamily: fonts.logo }]}>
              Leaves
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新しいノートブック"
            onPress={() => openCreateNotebook(null)}
            style={styles.iconButton}
          >
            <FolderPlus size={22} color={colors.muted} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="search"
          onPress={() => router.push('/search')}
          style={[styles.searchBar, { backgroundColor: colors.surface2 }]}
        >
          <Search size={18} color={colors.muted} />
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 15 }}>
            ノートを検索
          </Text>
        </Pressable>

        {data && data.recentNotes.length > 0 ? (
          <>
            <SectionTitle title="最近のノート" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRow}
            >
              {data.recentNotes.map((note) => (
                <NoteCover
                  key={note.id}
                  note={note}
                  width={RECENT_COVER_WIDTH}
                  onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
                  onLongPress={() => openNoteMenu(note)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionTitle
          title="ライブラリ"
          accessory={<SortToggle sort={sort} onChange={setSort} />}
        />
        {isEmpty ? (
          <Text style={[styles.empty, { color: colors.muted, fontFamily: fonts.regular }]}>
            下の「スキャン」から最初のノートを作りましょう
          </Text>
        ) : (
          <CoverGrid
            notebooks={data?.notebooks ?? []}
            notes={data?.notes ?? []}
            columns={3}
            columnGap={14}
            onNotebookLongPress={openNotebookMenu}
            onNoteLongPress={openNoteMenu}
          />
        )}
      </ScrollView>
      <ActionBar onScan={scan} onImport={importPhotos} />
      {menusElement}
    </SafeAreaView>
  );
}

function SectionTitle({ title, accessory }: { title: string; accessory?: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 15 }}
      >
        {title}
      </Text>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 12,
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 27, letterSpacing: -0.5 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    marginTop: 14,
    marginHorizontal: 20,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 26,
    marginBottom: 12,
  },
  recentRow: { gap: 12, paddingHorizontal: 20 },
  empty: { paddingHorizontal: 20, fontSize: 14 },
});
