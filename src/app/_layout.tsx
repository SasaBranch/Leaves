import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Shelf } from '@/domain/types';
import { useSyncOnForeground } from '@/hooks/useSyncOnForeground';
import { closeShelf, listShelves, openShelf } from '@/services/shelves';
import { openInitialShelf, runShelfMaintenance } from '@/services/startup';
import { type OpenShelf, ShelfProvider } from '@/state/openShelf';
import { appFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';
import { WelcomeScreen } from '@/ui/components/WelcomeScreen';

// 画面表示に必要なもの（フォント・本棚）がそろうまでスプラッシュを表示し続ける（詳細設計書 9.6）
SplashScreen.preventAutoHideAsync();

/** 基本設計書 4.1 でモーダル表示と決めた画面 */
const MODAL_SCREENS = [
  'capture',
  'search',
  'move',
  'settings',
  'note/[id]/reorder',
  'note/[id]/edit',
];

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const { shelf, switchShelf, reopenShelfAfter, isReopening } = useOpenShelf();
  const { colors, isDark } = useTheme();
  const isReady = (fontsLoaded || fontError) && shelf !== undefined;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  if (!isReady) return null;

  return (
    // ページのズーム・ボトムシート・並べ替えのジェスチャーに必要
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {shelf === null ? (
        // 本棚がないときの入口。戻る先がないため、ルートではなく部品として出す（詳細設計書 9.6）
        <WelcomeScreen onCreated={switchShelf} />
      ) : (
        <ShelfProvider value={{ shelf, switchShelf, reopenShelfAfter }}>
          {/* 閉じている間に反映すると、移動の途中の本棚を「削除された」とみなしてしまうため止める */}
          {isReopening ? null : <SyncOnForeground shelf={shelf} switchShelf={switchShelf} />}
          {/* 本棚を切り替えたら画面の木を作り直す（前の本棚のデータを持った画面を残さないため。詳細設計書 4.4） */}
          {/* 最初の画面を明示する。省くと、作り直したとき（本棚がない状態から作成したときなど）に
              画面の並びの先頭（capture）が最初の画面になり、真っ白で操作できなくなる */}
          <Stack
            key={shelf.id}
            initialRouteName="index"
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
          >
            {MODAL_SCREENS.map((name) => (
              <Stack.Screen key={name} name={name} options={{ presentation: 'modal' }} />
            ))}
          </Stack>
        </ShelfProvider>
      )}
    </GestureHandlerRootView>
  );
}

function SyncOnForeground({
  shelf,
  switchShelf,
}: {
  shelf: OpenShelf;
  switchShelf: (target: Shelf | null) => Promise<void>;
}) {
  useSyncOnForeground(shelf, switchShelf);
  return null;
}

/**
 * 開いている本棚。undefined は読み込み中、null は本棚がない（本棚の作成画面を出す）。
 * 開いた後の保守処理（外部変更の反映・OCR キュー開始）は、画面表示の後に裏で始める
 */
function useOpenShelf() {
  const [shelf, setShelf] = useState<OpenShelf | null | undefined>(undefined);
  const [isReopening, setIsReopening] = useState(false);

  useEffect(() => {
    openInitialShelf().then(
      (opened) => {
        setShelf(opened);
        if (opened) startMaintenance(opened);
      },
      (error: unknown) => {
        console.error('本棚を開けませんでした', error);
        setShelf(null);
      },
    );
  }, []);

  async function switchShelf(target: Shelf | null): Promise<void> {
    if (shelf) await closeShelf(shelf);
    await open(target);
  }

  async function reopenShelfAfter(work: () => Promise<Shelf>): Promise<void> {
    if (!shelf) return;
    setIsReopening(true);
    try {
      await closeShelf(shelf);
      let next: Shelf;
      try {
        next = await work();
      } catch (error) {
        await open(shelfAfterFailedWork(shelf));
        throw error;
      }
      await open(next);
    } finally {
      setIsReopening(false);
    }
  }

  async function open(target: Shelf | null): Promise<void> {
    const opened = target ? await openShelf(target) : null;
    setShelf(opened);
    if (opened) startMaintenance(opened);
  }

  return { shelf, switchShelf, reopenShelfAfter, isReopening };
}

/** 失敗しても元の本棚は残る前提（moveShelf）。見つからなければ開ける本棚、なければ null（本棚の作成画面） */
function shelfAfterFailedWork(closed: OpenShelf): Shelf | null {
  const shelves = listShelves().filter((candidate) => candidate.available);
  return shelves.find((candidate) => candidate.id === closed.id) ?? shelves[0] ?? null;
}

function startMaintenance(shelf: OpenShelf): void {
  runShelfMaintenance(shelf).catch((error: unknown) =>
    console.warn('本棚の保守処理に失敗しました', error),
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  retryButton: { minHeight: 48, paddingHorizontal: 28, borderRadius: 24, justifyContent: 'center' },
});

/** 予期しない例外を画面全体で受け止め、再読み込みできるようにする（基本設計書 7 章） */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, fonts } = useTheme();
  console.error(error);
  return (
    <View style={[styles.errorScreen, { backgroundColor: colors.bg }]}>
      <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>
        問題が発生しました
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={[styles.retryButton, { backgroundColor: colors.accent }]}
      >
        <Text style={{ color: colors.onAccent, fontFamily: fonts.bold, fontSize: 16 }}>
          再読み込み
        </Text>
      </Pressable>
    </View>
  );
}
