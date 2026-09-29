// SC-10 設定（基本設計書 4.3）。本棚の管理（各本棚の場所を含む）と、アプリの情報だけを置く
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { Directory } from 'expo-file-system';
import { Check, Ellipsis, FolderOpen, Plus, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isAppError } from '@/domain/errors';
import { validateName } from '@/domain/name';
import type { Shelf } from '@/domain/types';
import { useShelves } from '@/hooks/useShelves';
import { pickFolder } from '@/native/folderAccess';
import {
  countShelfContents,
  createShelf,
  deleteShelfWithContents,
  moveShelf,
  openFolderAsShelf,
  removeShelfFromList,
  renameShelf,
} from '@/services/shelves';
import { entryName } from '@/storage/paths';
import { useShelfContext } from '@/state/openShelf';
import { useTheme } from '@/theme/useTheme';
import { ActionMenu, type ActionMenuItem } from '@/ui/components/ActionMenu';
import { TextPromptModal } from '@/ui/components/TextPromptModal';
import { errorMessages } from '@/ui/errorMessages';
import { canUseOtherLocations, shelfLocationPath } from '@/ui/shelfLocations';
import { showingErrors } from '@/ui/showingErrors';

type Menu = { title: string; items: ActionMenuItem[] };
type Prompt = {
  title: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
};

export default function SettingsScreen() {
  const { shelf: openShelf, switchShelf, reopenShelfAfter } = useShelfContext();
  const { shelves, reload } = useShelves();
  const { colors, fonts } = useTheme();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // 切り替えると画面の木ごと作り直される（ライブラリに戻る）ため、ここで画面を閉じる必要はない
  const selectShelf = (shelf: Shelf) => {
    // 開けない本棚は開こうとせず、選び直すか外すかを選んでもらう（FR-L-04）
    if (!shelf.available) openUnavailableShelfMenu(shelf);
    else if (shelf.id === openShelf.id) router.back();
    else switchShelf(shelf).catch(alertFailure('本棚を開けませんでした'));
  };

  const openCreateShelf = () => {
    if (!canUseOtherLocations) {
      promptNewShelf(false);
      return;
    }
    setMenu({
      title: '新しい本棚',
      items: [
        { label: 'アプリ内に作る', onPress: () => promptNewShelf(false) },
        { label: '別の場所に作る…', onPress: () => promptNewShelf(true) },
      ],
    });
  };

  /** 別の場所なら、名前を決めてからフォルダを選ぶ（フォルダ選択画面から戻った直後に入力欄を出さないため） */
  const promptNewShelf = (inOtherLocation: boolean) =>
    setPrompt({
      title: '新しい本棚',
      submitLabel: inOtherLocation ? '場所を選んで作成' : '作成',
      onSubmit: showingErrors(async (name) => {
        let parent: Directory | null = null;
        if (inOtherLocation) {
          // 名前の誤りは、フォルダを選ぶ前に知らせる
          validateName(name);
          parent = await pickFolder();
          if (!parent) return;
        }
        await switchShelf(createShelf(name, parent));
      }),
    });

  const openFolderAsShelfAndSwitch = async () => {
    const folder = await pickFolder();
    if (!folder) return;
    const shelf = openFolderAsShelf(folder);
    if (shelf.id === openShelf.id) reload();
    else await switchShelf(shelf);
  };

  const openShelfMenu = (shelf: Shelf) => {
    if (!shelf.available) {
      openUnavailableShelfMenu(shelf);
      return;
    }
    const items: ActionMenuItem[] = [
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
    ];
    if (canUseOtherLocations) {
      items.push({
        label: '場所を移す',
        onPress: () => chooseMoveDestination(shelf).catch(alertFailure('本棚を移せませんでした')),
      });
      if (shelf.location !== 'app') {
        items.push({ label: '一覧から外す', onPress: () => confirmRemoveFromList(shelf) });
      }
    }
    items.push({ label: '削除', destructive: true, onPress: () => confirmDelete(shelf) });
    setMenu({ title: shelf.name, items });
  };

  const openUnavailableShelfMenu = (shelf: Shelf) =>
    setMenu({
      title: `「${shelf.name}」を開けません`,
      items: [
        {
          label: '場所を選び直す',
          onPress: () => relocate().catch(alertFailure('本棚を開けませんでした')),
        },
        { label: '一覧から外す', onPress: () => confirmRemoveFromList(shelf) },
      ],
    });

  /** 同じ本棚のフォルダを選べば同じ本棚として参照を新しくし、別のフォルダなら別の本棚として加わる（FR-L-04） */
  async function relocate() {
    const folder = await pickFolder();
    if (!folder) return;
    openFolderAsShelf(folder);
    reload();
  }

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
    // 同じ本棚を開き直すだけなので画面は作り直されない。一覧を読み直して新しい名前にする
    // （古い名前のまま次の操作をすると、もうないフォルダを探して失敗するため）
    reload();
  }

  async function chooseMoveDestination(shelf: Shelf) {
    const destination = await pickFolder();
    if (!destination) return;
    const contents = await countShelfContents(shelf, openShelf);
    Alert.alert(
      `「${shelf.name}」を移しますか？`,
      `本棚「${shelf.name}」を「${entryName(destination)}」に移します（ノート ${contents.notes} 件）`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '移す',
          onPress: () => move(shelf, destination).catch(alertFailure('本棚を移せませんでした')),
        },
      ],
    );
  }

  /** 失敗しても元の場所に残る（moveShelf）。一覧を読み直して、今の場所を表示する */
  async function move(shelf: Shelf, destination: Directory) {
    setIsMoving(true);
    try {
      // 開いている本棚は、OCR・保存が本棚フォルダに書かないよう閉じてから移し、移した先で開き直す
      if (shelf.id === openShelf.id) await reopenShelfAfter(() => moveShelf(shelf, destination));
      else await moveShelf(shelf, destination);
    } finally {
      setIsMoving(false);
      reload();
    }
  }

  function confirmRemoveFromList(shelf: Shelf) {
    Alert.alert(
      `「${shelf.name}」を一覧から外しますか？`,
      `本棚「${shelf.name}」を一覧から外します。フォルダは消えません。もう一度使うときは「フォルダを本棚として開く」から開けます`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '外す',
          onPress: () => removeFromList(shelf).catch(alertFailure('一覧から外せませんでした')),
        },
      ],
    );
  }

  async function removeFromList(shelf: Shelf) {
    if (shelf.id !== openShelf.id) {
      removeShelfFromList(shelf);
      reload();
      return;
    }
    // 開いている本棚は、先に別の本棚へ切り替えて（DB を閉じて）から外す。残りがなければ本棚の作成画面に戻る
    await switchShelf(firstOtherAvailableShelf(shelf));
    removeShelfFromList(shelf);
  }

  const firstOtherAvailableShelf = (shelf: Shelf) =>
    shelves.find((candidate) => candidate.id !== shelf.id && candidate.available) ?? null;

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
    await switchShelf(firstOtherAvailableShelf(shelf));
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
        <Section title="本棚" footer={shelvesFooter}>
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
                <View style={styles.rowTexts}>
                  <Text
                    numberOfLines={1}
                    style={[styles.rowText, { color: colors.text, fontFamily: fonts.medium }]}
                  >
                    {shelf.name}
                  </Text>
                  {/* Android はアプリ内の本棚だけなので、場所を出しても区別にならない（ADR 0026） */}
                  {!shelf.available ? (
                    <Text
                      style={[
                        styles.rowSubText,
                        { color: colors.danger, fontFamily: fonts.medium },
                      ]}
                    >
                      開けません
                    </Text>
                  ) : canUseOtherLocations ? (
                    <Text
                      style={[
                        styles.rowSubText,
                        { color: colors.muted, fontFamily: fonts.regular },
                      ]}
                    >
                      {shelfLocationPath(shelf)}
                    </Text>
                  ) : null}
                </View>
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
          {canUseOtherLocations ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                openFolderAsShelfAndSwitch().catch(
                  alertFailure('フォルダを本棚として開けませんでした'),
                )
              }
              style={[styles.row, styles.rowMain, { borderColor: colors.border }]}
            >
              <View style={styles.checkSlot}>
                <FolderOpen size={20} color={colors.accentText} />
              </View>
              <Text
                style={[styles.rowText, { color: colors.accentText, fontFamily: fonts.medium }]}
              >
                フォルダを本棚として開く
              </Text>
            </Pressable>
          ) : null}
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
      {isMoving ? (
        // 移動中は操作を止める（途中で本棚を切り替えたり消したりしないように）
        <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.overlay]}>
          <View style={[styles.overlayCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator color={colors.accentText} />
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}>
              移動中…
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** footer: 枠の下に添える小さな注記（押せる項目と見間違えないよう、枠の外に出す） */
function Section({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: ReactNode;
}) {
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
      {footer ? (
        <Text style={[styles.sectionFooter, { color: colors.muted, fontFamily: fonts.regular }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** Android のアプリ内の本棚は外から見えない（ADR 0026） */
const shelvesFooter = canUseOtherLocations
  ? 'Mac とケーブルでつなぐと Finder からも開けます'
  : '本棚はアプリの中に保存されます';

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
  sectionFooter: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
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
  rowTexts: { flex: 1, paddingVertical: 6, gap: 2 },
  rowSubText: { fontSize: 12 },
  infoRow: { justifyContent: 'space-between', paddingHorizontal: 14 },
  overlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 14,
  },
});
