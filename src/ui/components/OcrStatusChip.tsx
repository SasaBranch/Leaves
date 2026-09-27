// 文字認識の状態チップ（基本設計書 4.3 SC-5 の表示）
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { OcrStatus } from '@/domain/types';
import { useTheme } from '@/theme/useTheme';

const OCR_STATUS_LABELS: Record<OcrStatus, string> = {
  pending: '認識待ち',
  processing: '認識中…',
  done: '認識済み',
  failed: '認識できませんでした',
};

export function OcrStatusChip({ status }: { status: OcrStatus }) {
  const { colors, fonts } = useTheme();
  const isDone = status === 'done';
  return (
    <View style={[styles.chip, { backgroundColor: isDone ? colors.accentSoft : colors.surface2 }]}>
      {status === 'processing' ? <ActivityIndicator size="small" color={colors.muted} /> : null}
      <Text
        style={{
          color: isDone ? colors.accentText : colors.muted,
          fontFamily: fonts.bold,
          fontSize: 11,
        }}
      >
        {OCR_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
});
