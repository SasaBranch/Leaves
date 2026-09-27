// 下から出る選択メニュー（長押しメニュー・書き出しメニューなど）。
// OS 標準のアクションシートは Android にないため、両 OS で同じ見た目の小さなメニューを持つ
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            onPress={() => {
              onClose();
              item.onPress();
            }}
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
