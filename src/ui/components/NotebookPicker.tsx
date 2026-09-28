// ノートブックの木から1つを選ぶ一覧（SC-8 移動先選択、SC-4 保存先の選択）。
// 最上段は「ライブラリ」（null）、末尾で新しいノートブックを作れる
import { FolderPlus, Library } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isAppError } from '@/domain/errors';
import { flattenNotebookTree, type NotebookTreeRow } from '@/domain/notebookTree';
import type { NotebookId } from '@/domain/types';
import { useNotebookTree } from '@/hooks/useNotebookTree';
import { createNotebook } from '@/services/notebooks';
import { useShelf } from '@/state/openShelf';
import { useTheme } from '@/theme/useTheme';
import { errorMessages } from '@/ui/errorMessages';

import { NotebookSwatch } from './NotebookSwatch';

/** 階層1段ごとの字下げ */
const INDENT_PER_DEPTH = 20;
/** ライブラリ行の左余白。ノートブックの行はこの右から字下げする */
const ROW_BASE_PADDING = 20;
/** 選べない行の不透明度 */
const DISABLED_OPACITY = 0.35;

/**
 * excludeSubtreeOf: ノートブックを移動するとき、そのノートブック自身と子孫は選べない（FR-F-04）
 */
export function NotebookPicker({
  excludeSubtreeOf = null,
  onSelect,
}: {
  excludeSubtreeOf?: NotebookId | null;
  onSelect: (notebookId: NotebookId | null) => void;
}) {
  const { data } = useNotebookTree(excludeSubtreeOf);
  const rows = useMemo(() => (data ? flattenNotebookTree(data.roots) : []), [data]);
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.notebook.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<LibraryRow onPress={() => onSelect(null)} />}
      renderItem={({ item }) => (
        <NotebookRow
          row={item}
          isSelectable={!data?.unselectableIds.includes(item.notebook.id)}
          onPress={() => onSelect(item.notebook.id)}
        />
      )}
      ListFooterComponent={<NewNotebookRow />}
    />
  );
}

/** ノートブックを選ぶ画面の見出し。タイトルを中央に保つ */
export function NotebookPickerHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.header, { borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.headerButton}>
        <Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 15 }}>
          キャンセル
        </Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.bold }]}
      >
        {title}
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
      accessibilityLabel="ライブラリを選ぶ"
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
      accessibilityLabel={`${row.notebook.name}を選ぶ`}
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
  const shelf = useShelf();
  const { colors, fonts } = useTheme();

  async function create(name: string) {
    try {
      await createNotebook(shelf, name, null);
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
