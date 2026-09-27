// 名前の入力ダイアログ（ノートブックの作成・名前変更、ノートの名前変更）。
// Alert.prompt は iOS にしかないため、両 OS で使える小さなダイアログを持つ
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/theme/useTheme';

export function TextPromptModal({
  visible,
  title,
  initialValue = '',
  submitLabel,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  submitLabel: string;
  /** 入力エラー（同名など）はこの中で表示し、成功したら閉じる */
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setIsSubmitting(true);
    try {
      await onSubmit(value);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // 開くたびに初期値へ戻す（前回の入力が残らないように）
      onShow={() => setValue(initialValue)}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.dialog, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.bold }]}>
            {title}
          </Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            returnKeyType="done"
            accessibilityLabel={title}
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
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
              <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 16 }}>
                キャンセル
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={submit}
              style={[
                styles.button,
                { backgroundColor: colors.accent, opacity: isSubmitting ? 0.6 : 1 },
              ]}
            >
              <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 16 }}>
                {submitLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dialog: { borderRadius: 18, padding: 20, gap: 16 },
  title: { fontSize: 17 },
  input: { height: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
