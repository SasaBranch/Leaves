// 下から出る選択メニュー（長押しメニュー・書き出しメニューなど）。
// OS 標準のアクションシートは Android にないため、両 OS で同じ見た目の小さなメニューを持つ
import { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

export type ActionMenuItem = {
  label: string;
  onPress: () => void;
  /** 削除など取り消せない操作は目立たせる */
  destructive?: boolean;
};

export function ActionMenu({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title?: string;
  items: ActionMenuItem[];
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  // iOS は閉じる途中のモーダルの上に別の画面（フォルダ選択など）を出せないため、閉じ終わってから実行する
  const pendingAction = useRef<(() => void) | null>(null);
  const choose = (item: ActionMenuItem) => {
    onClose();
    if (Platform.OS === 'ios') pendingAction.current = item.onPress;
    else item.onPress();
  };
  const runPendingAction = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={runPendingAction}
    >
      <Pressable accessibilityLabel="閉じる" style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 },
        ]}
      >
        {title ? (
          <Text style={[styles.title, { color: colors.muted, fontFamily: fonts.medium }]}>
            {title}
          </Text>
        ) : null}
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={() => choose(item)}
            style={[styles.item, { borderColor: colors.border }]}
          >
            <Text
              style={{
                color: item.destructive ? colors.danger : colors.text,
                fontFamily: fonts.medium,
                fontSize: 16,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.item}>
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 16 }}>
            キャンセル
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 },
  title: { textAlign: 'center', fontSize: 13, paddingVertical: 10 },
  item: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
