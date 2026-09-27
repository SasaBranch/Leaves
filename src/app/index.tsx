import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

// 仮のライブラリ画面。SC-1 は #23 で実装する
export default function LibraryScreen() {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.logo, { color: colors.text, fontFamily: fonts.logo }]}>Leaves</Text>
      <Text style={[styles.caption, { color: colors.muted, fontFamily: fonts.regular }]}>
        ノートを撮って、ノートブックに整理する
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  logo: { fontSize: 34 },
  caption: { fontSize: 14 },
});
