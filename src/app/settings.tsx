// SC-10 設定（基本設計書 4.3）。本棚の管理と、保存場所の案内だけを置く
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Check, Ellipsis, Plus, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isAppError } from '@/domain/errors';
import type { Shelf } from '@/domain/types';
import { useShelves } from '@/hooks/useShelves';
import {
  countShelfContents,
  createShelf,
  deleteShelfWithContents,
  renameShelf,
} from '@/services/shelves';
import { useShelfContext } from '@/state/openShelf';
import { useTheme } from '@/theme/useTheme';
import { ActionMenu, type ActionMenuItem } from '@/ui/components/ActionMenu';
import { TextPromptModal } from '@/ui/components/TextPromptModal';
import { errorMessages } from '@/ui/errorMessages';
import { showingErrors } from '@/ui/showingErrors';

type Menu = { title: string; items: ActionMenuItem[] };
type Prompt = {
  title: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
};

export default function SettingsScreen() {
  const { shelf: openShelf, switchShelf } = useShelfContext();
  const { shelves, reload } = useShelves();
  const { colors, fonts } = useTheme();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  // 切り替えると画面の木ごと作り直される（ライブラリに戻る）ため、ここで画面を閉じる必要はない
  const selectShelf = (shelf: Shelf) => {
    if (shelf.id === openShelf.id) router.back();
    else switchShelf(shelf).catch(alertFailure('本棚を開けませんでした'));
  };

  const openCreateShelf = () =>
    setPrompt({
      title: '新しい本棚',
      submitLabel: '作成',
      onSubmit: showingErrors(async (name) => {
        const created = createShelf(name);
        await switchShelf(created);
      }),
    });

  const openShelfMenu = (shelf: Shelf) =>
    setMenu({
      title: shelf.name,
      items: [
        {
          label: '名前を変更',
          onPress: () =>
            setPrompt({
              title: '本棚の名前',
              initialValue: shelf.name,
              submitLabel: '変更',
              onSubmit: showingErrors((name) => rename(shelf, name)),
            }),
        },
        { label: '削除', destructive: true, onPress: () => confirmDelete(shelf) },
      ],
    });

  async function rename(shelf: Shelf, name: string) {
    if (shelf.id !== openShelf.id) {
      renameShelf(shelf, name);
      reload();
      return;
    }
    // 開いている本棚は、走査・保存の途中でフォルダの場所を変えないよう順番待ちに並べる。
    // 変更後はフォルダの場所（OpenShelf.directory）が変わるので開き直す
    const renamed = await openShelf.runExclusively(async () => renameShelf(shelf, name));
    await switchShelf(renamed);
  }

  /** 中身の件数を示してから確認する（FR-V-05。ゴミ箱がないため） */
  async function confirmDelete(shelf: Shelf) {
    const contents = await countShelfContents(shelf, openShelf);
    Alert.alert(
      `「${shelf.name}」を削除しますか？`,
      `本棚「${shelf.name}」と、中のノートブック ${contents.notebooks} 件・ノート ${contents.notes} 件をすべて削除します。元に戻せません`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => deleteShelf(shelf).catch(alertFailure('削除できませんでした')),
        },
      ],
    );
  }

  async function deleteShelf(shelf: Shelf) {
    if (shelf.id !== openShelf.id) {
      deleteShelfWithContents(shelf);
      reload();
      return;
    }
    // 開いている本棚は、先に別の本棚へ切り替えて（DB を閉じて）から消す。
    // 残りがなければ null で本棚の作成画面に戻る（基本設計書 4.3 SC-10）
    const next = shelves.find((candidate) => candidate.id !== shelf.id) ?? null;
    await switchShelf(next);
    deleteShelfWithContents(shelf);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="閉じる"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <X size={22} color={colors.muted} />
        </Pressable>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>設定</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="本棚">
          {shelves.map((shelf) => (
            <View key={shelf.id} style={[styles.row, { borderColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: shelf.id === openShelf.id }}
                onPress={() => selectShelf(shelf)}
                style={styles.rowMain}
              >
                <View style={styles.checkSlot}>
                  {shelf.id === openShelf.id ? <Check size={20} color={colors.accentText} /> : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.rowText, { color: colors.text, fontFamily: fonts.medium }]}
                >
                  {shelf.name}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${shelf.name}のメニュー`}
                onPress={() => openShelfMenu(shelf)}
                style={styles.iconButton}
              >
                <Ellipsis size={20} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={openCreateShelf}
            style={[styles.row, styles.rowMain, { borderColor: colors.border }]}
          >
            <View style={styles.checkSlot}>
              <Plus size={20} color={colors.accentText} />
            </View>
            <Text style={[styles.rowText, { color: colors.accentText, fontFamily: fonts.medium }]}>
              新しい本棚
            </Text>
          </Pressable>
        </Section>

        <Section title="保存場所">
          <View style={styles.textBlock}>
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}>
              「ファイル」アプリ {'>'} このiPhone内 {'>'} Leaves
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
              Mac とケーブルでつなぐと Finder からも開けます
            </Text>
          </View>
        </Section>

        <Section title="情報">
          <View style={[styles.row, styles.infoRow]}>
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}>
              バージョン
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 15 }}>
              {Constants.expoConfig?.version ?? '-'}
            </Text>
          </View>
        </Section>
      </ScrollView>

      <ActionMenu
        visible={menu !== null}
        title={menu?.title}
        items={menu?.items ?? []}
        onClose={() => setMenu(null)}
      />
      <TextPromptModal
        visible={prompt !== null}
        title={prompt?.title ?? ''}
        initialValue={prompt?.initialValue}
        submitLabel={prompt?.submitLabel ?? ''}
        onSubmit={prompt?.onSubmit ?? (async () => {})}
        onClose={() => setPrompt(null)}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, { color: colors.muted, fontFamily: fonts.bold }]}
      >
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function alertFailure(fallback: string) {
  return (error: unknown) => {
    console.error(error);
    Alert.alert(isAppError(error) ? errorMessages[error.kind] : fallback);
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 26 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, paddingHorizontal: 4 },
  card: { borderRadius: 14, overflow: 'hidden' },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: -StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  checkSlot: { width: 44, alignItems: 'center' },
  rowText: { flex: 1, fontSize: 16 },
  textBlock: { padding: 14, gap: 6 },
  infoRow: { justifyContent: 'space-between', paddingHorizontal: 14 },
});
