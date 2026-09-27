// 並び順の切り替え（FR-F-08）。更新順 ⇄ 名前順
import { ArrowUpDown } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { SortOrder } from '@/domain/types';
import { useTheme } from '@/theme/useTheme';

const SORT_LABELS: Record<SortOrder, string> = { updatedAt: '更新順', name: '名前順' };

export function SortToggle({
  sort,
  onChange,
}: {
  sort: SortOrder;
  onChange: (sort: SortOrder) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`並び順: ${SORT_LABELS[sort]}`}
      onPress={() => onChange(sort === 'updatedAt' ? 'name' : 'updatedAt')}
      hitSlop={8}
      style={styles.button}
    >
      <ArrowUpDown size={15} color={colors.muted} />
      <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
        {SORT_LABELS[sort]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
});
