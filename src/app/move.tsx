// SC-8 移動先選択（基本設計書 4.3）
import { router, useLocalSearchParams } from 'expo-router';
import { FolderPlus, Library } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isAppError } from '@/domain/errors';
import { flattenNotebookTree, type NotebookTreeRow } from '@/domain/notebookTree';
import type { NoteId, NotebookId } from '@/domain/types';
import { useNotebookTree } from '@/hooks/useNotebookTree';
import { createNotebook, moveNotebook } from '@/services/notebooks';
import { moveNote } from '@/services/notes';
import { useDb } from '@/state/database';
import { useTheme } from '@/theme/useTheme';
import { errorMessages } from '@/ui/errorMessages';
import { NotebookSwatch } from '@/ui/components/NotebookSwatch';

type MoveTarget = { kind: 'note'; id: NoteId } | { kind: 'notebook'; id: NotebookId };

/** 階層1段ごとの字下げ */
const INDENT_PER_DEPTH = 20;
/** ライブラリ行の左余白。ノートブックの行はこの右から字下げする */
const ROW_BASE_PADDING = 20;
/** 選べない行の不透明度 */
const DISABLED_OPACITY = 0.35;

export default function MoveScreen() {
  const target = useMoveTarget();
  const { data } = useNotebookTree(target.kind === 'notebook' ? target.id : null);
  const rows = useMemo(() => (data ? flattenNotebookTree(data.roots) : []), [data]);
  const moveTo = useMoveTo(target);
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Header />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.notebook.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<LibraryRow onPress={() => moveTo(null)} />}
        renderItem={({ item }) => (
          <NotebookRow
            row={item}
            isSelectable={!data?.unselectableIds.includes(item.notebook.id)}
            onPress={() => moveTo(item.notebook.id)}
          />
        )}
        ListFooterComponent={<NewNotebookRow />}
      />
    </SafeAreaView>
  );
}

function useMoveTarget(): MoveTarget {
  const { kind, id } = useLocalSearchParams<{ kind: MoveTarget['kind']; id: string }>();
  return kind === 'notebook' ? { kind, id: id as NotebookId } : { kind, id: id as NoteId };
}

/** 選んだ移動先へ移して閉じる。失敗したら理由を表示して、選び直せるように画面に残る */
function useMoveTo(target: MoveTarget) {
  const db = useDb();
  return async (destinationId: NotebookId | null) => {
    try {
      if (target.kind === 'note') await moveNote(db, target.id, destinationId);
      else await moveNotebook(db, target.id, destinationId);
      router.back();
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '移動できませんでした');
    }
  };
}

function Header() {
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
        移動先を選択
      </Text>
      {/* タイトルを中央に保つための、キャンセルと同じ幅の空き */}
      <View style={styles.headerButton} />
    </View>
  );
}

function LibraryRow({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="ライブラリへ移動"
      onPress={onPress}
      style={[styles.row, { paddingLeft: ROW_BASE_PADDING }]}
    >
      <Library size={20} color={colors.accentText} />
      <Text style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.bold }]}>
        ライブラリ
      </Text>
    </Pressable>
  );
}

function NotebookRow({
  row,
  isSelectable,
  onPress,
}: {
  row: NotebookTreeRow;
  isSelectable: boolean;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  // 深さ 0 のノートブックもライブラリの子なので、1段下げて表示する
  const indent = ROW_BASE_PADDING + (row.depth + 1) * INDENT_PER_DEPTH;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.notebook.name}へ移動`}
      accessibilityState={{ disabled: !isSelectable }}
      disabled={!isSelectable}
      onPress={onPress}
      style={[styles.row, { paddingLeft: indent, opacity: isSelectable ? 1 : DISABLED_OPACITY }]}
    >
      <NotebookSwatch color={row.notebook.color} />
      <Text
        numberOfLines={1}
        style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.regular }]}
      >
        {row.notebook.name}
      </Text>
    </Pressable>
  );
}

/** RN には共通の文字入力ダイアログがないため、行の中に入力欄を出す。作る場所はライブラリ直下 */
function NewNotebookRow() {
  const [isEditing, setIsEditing] = useState(false);
  const db = useDb();
  const { colors, fonts } = useTheme();

  async function create(name: string) {
    try {
      await createNotebook(db, name, null);
      setIsEditing(false);
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '作成できませんでした');
    }
  }

  return (
    <View style={[styles.row, { paddingLeft: ROW_BASE_PADDING }]}>
      <FolderPlus size={20} color={colors.accentText} />
      {isEditing ? (
        <TextInput
          autoFocus
          accessibilityLabel="新しいノートブックの名前"
          placeholder="ノートブックの名前"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={(event) => create(event.nativeEvent.text)}
          onBlur={() => setIsEditing(false)}
          style={[styles.rowLabel, styles.input, { color: colors.text, fontFamily: fonts.regular }]}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsEditing(true)}
          style={styles.newNotebookButton}
        >
          <Text
            style={[styles.buttonLabel, { color: colors.accentText, fontFamily: fonts.medium }]}
          >
            新しいノートブック
          </Text>
        </Pressable>
      )}
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
  headerButton: { minWidth: 88, height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 16 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 20,
  },
  rowLabel: { flex: 1, fontSize: 15 },
  buttonLabel: { fontSize: 15 },
  input: { height: 44 },
  newNotebookButton: { flex: 1, height: 44, justifyContent: 'center' },
});
