// 画面下のフローティングアクションバー（基本設計書 2.4、NFR-U-01: 1タップでスキャン開始）
import { Camera, ImagePlus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

/** 画面下端（ホームインジケータの上）からの距離 */
const BOTTOM_MARGIN = 12;

export function ActionBar({ onScan, onImport }: { onScan: () => void; onImport: () => void }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: insets.bottom + BOTTOM_MARGIN }]}
    >
      <View
        style={[styles.capsule, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="写真から取り込み"
          onPress={onImport}
          style={[styles.importButton, { backgroundColor: colors.surface2 }]}
        >
          <ImagePlus size={22} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onScan}
          style={[styles.scanButton, { backgroundColor: colors.accent }]}
        >
          <Camera size={22} color={colors.onAccent} />
          <Text style={[styles.scanLabel, { color: colors.onAccent, fontFamily: fonts.bold }]}>
            スキャン
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    borderRadius: 32,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  importButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    height: 52,
    paddingLeft: 22,
    paddingRight: 26,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanLabel: { fontSize: 16 },
});
