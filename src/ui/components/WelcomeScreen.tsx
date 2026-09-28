// SC-9 本棚の作成（初回。基本設計書 4.3）。
// 本棚がないときだけルートレイアウトが出す。戻る先がないため、ルートではなく部品にしている（詳細設計書 9.6）
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_SHELF_NAME } from '@/config';
import { isAppError } from '@/domain/errors';
import type { Shelf } from '@/domain/types';
import { createShelf } from '@/services/shelves';
import { useTheme } from '@/theme/useTheme';
import { LeavesMark } from '@/ui/components/LeavesMark';
import { errorMessages } from '@/ui/errorMessages';

/** ロゴの高さ。ワードマーク「Leaves」の大きさに合わせる */
const LOGO_MARK_SIZE = 32;

export function WelcomeScreen({ onCreated }: { onCreated: (shelf: Shelf) => Promise<void> }) {
  const { colors, fonts } = useTheme();
  const [name, setName] = useState(DEFAULT_SHELF_NAME);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function create() {
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await onCreated(createShelf(name));
    } catch (error) {
      // 入力の誤り（空・使えない文字・同名）はその場で直してもらう
      setErrorMessage(isAppError(error) ? errorMessages[error.kind] : '本棚を作成できませんでした');
      setIsCreating(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <View style={styles.logo}>
          <LeavesMark size={LOGO_MARK_SIZE} />
          <Text style={[styles.logoText, { color: colors.text, fontFamily: fonts.logo }]}>
            Leaves
          </Text>
        </View>
        <Text style={[styles.lead, { color: colors.text, fontFamily: fonts.bold }]}>
          紙のノートをしまう本棚を作りましょう
        </Text>

        <View style={styles.field}>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
            本棚の名前
          </Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={create}
            returnKeyType="done"
            accessibilityLabel="本棚の名前"
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.accent,
                backgroundColor: colors.surface2,
                fontFamily: fonts.regular,
              },
            ]}
          />
          {errorMessage ? (
            <Text style={{ color: colors.danger, fontFamily: fonts.medium }}>{errorMessage}</Text>
          ) : null}
        </View>
        <Text style={[styles.note, { color: colors.muted, fontFamily: fonts.regular }]}>
          本棚は「ファイル」アプリの このiPhone内 {'>'} Leaves にフォルダとして表示されます
        </Text>

        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          disabled={isCreating}
          onPress={create}
          style={[
            styles.createButton,
            { backgroundColor: colors.accent, opacity: isCreating ? 0.6 : 1 },
          ]}
        >
          <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 17 }}>
            本棚を作成
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 48, gap: 16 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 34, letterSpacing: -0.5 },
  lead: { fontSize: 18, marginBottom: 16 },
  field: { gap: 8 },
  input: { height: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16 },
  note: { fontSize: 12 },
  spacer: { flex: 1 },
  createButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
});
