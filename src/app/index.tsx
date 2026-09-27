import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CapturedImage } from '@/domain/types';
import { pickImages } from '@/native/imagePicker';
import { scanDocument } from '@/native/scanner';
import { useTheme } from '@/theme/useTheme';

// 仮のライブラリ画面（M2 で「スキャン → 保存 → 表示」を通すための最小版）。SC-1 は #23 で実装する
export default function LibraryScreen() {
  const { colors, fonts } = useTheme();

  async function capture(getImages: () => Promise<CapturedImage[] | null>) {
    const images = await getImages();
    if (images) router.push({ pathname: '/capture', params: { images: JSON.stringify(images) } });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.logo, { color: colors.text, fontFamily: fonts.logo }]}>Leaves</Text>
      <Text style={[styles.caption, { color: colors.muted, fontFamily: fonts.regular }]}>
        ノートを撮って、ノートブックに整理する
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => capture(pickImages)}
          style={[styles.button, { backgroundColor: colors.surface2 }]}
        >
          <Text style={{ color: colors.text, fontFamily: fonts.bold }}>写真から取り込み</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => capture(scanDocument)}
          style={[styles.button, { backgroundColor: colors.accent }]}
        >
          <Text style={{ color: colors.onAccent, fontFamily: fonts.bold }}>スキャン</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  logo: { fontSize: 34 },
  caption: { fontSize: 14 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 32 },
  button: { height: 52, paddingHorizontal: 22, borderRadius: 26, justifyContent: 'center' },
});
