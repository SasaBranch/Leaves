import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import type { Db } from '@/db/db';
import { openAppDatabase } from '@/db/openAppDatabase';
import { runStartupMaintenance } from '@/services/integrity';
import { DatabaseProvider } from '@/state/database';
import { appFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

// 画面表示に必要なもの（フォント・DB）がそろうまでスプラッシュを表示し続ける（詳細設計書 9.6）
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const db = useAppDatabase();
  const { colors, isDark } = useTheme();
  const isReady = (fontsLoaded || fontError) && db;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  if (!isReady) return null;

  return (
    <DatabaseProvider db={db}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
      </Stack>
    </DatabaseProvider>
  );
}

/** DB を開き、画面表示の後に保守処理（整合性チェック・OCR キュー開始）を裏で始める */
function useAppDatabase(): Db | null {
  const [db, setDb] = useState<Db | null>(null);
  useEffect(() => {
    openAppDatabase().then((opened) => {
      setDb(opened);
      runStartupMaintenance(opened).catch((error: unknown) =>
        console.warn('起動時の保守処理に失敗しました', error),
      );
    });
  }, []);
  return db;
}
