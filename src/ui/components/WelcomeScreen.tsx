// SC-9 本棚の作成（初回。基本設計書 4.3）。
// 本棚がないときだけルートレイアウトが出す。戻る先がないため、ルートではなく部品にしている（詳細設計書 9.6）
import type { Directory } from 'expo-file-system';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import {
  Keyboard,
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
import { pickFolder } from '@/native/folderAccess';
import { createShelf, openFolderAsShelf } from '@/services/shelves';
import { entryName } from '@/storage/paths';
import { useTheme } from '@/theme/useTheme';
import { ActionMenu } from '@/ui/components/ActionMenu';
import { LeavesMark } from '@/ui/components/LeavesMark';
import { errorMessages } from '@/ui/errorMessages';
import { appShelfNote, canUseOtherLocations } from '@/ui/shelfLocations';

/** ロゴの高さ。ワードマーク「Leaves」の大きさに合わせる */
const LOGO_MARK_SIZE = 32;

export function WelcomeScreen({ onCreated }: { onCreated: (shelf: Shelf) => Promise<void> }) {
  const { colors, fonts } = useTheme();
  const [name, setName] = useState(DEFAULT_SHELF_NAME);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 別の場所に作るときの親フォルダ。null はアプリ内（FR-L-01） */
  const [parent, setParent] = useState<Directory | null>(null);
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

  /** 作成・既存フォルダを開く処理の共通部分。入力の誤り（空・使えない文字・同名）はその場で直してもらう */
  async function run(makeShelf: () => Promise<Shelf | null>, fallbackMessage: string) {
    setIsCreating(true);
    setErrorMessage(null);
    try {
      const shelf = await makeShelf();
      if (shelf) {
        await onCreated(shelf);
        return;
      }
    } catch (error) {
      if (!isAppError(error)) console.error(error);
      setErrorMessage(isAppError(error) ? errorMessages[error.kind] : fallbackMessage);
    }
    setIsCreating(false);
  }

  const create = () => run(async () => createShelf(name, parent), '本棚を作成できませんでした');

  // キャンセルなら何もしない（null を返す）
  const openExistingFolder = () =>
    run(async () => {
      const folder = await pickFolder();
      return folder ? openFolderAsShelf(folder) : null;
    }, 'フォルダを本棚として開けませんでした');

  async function chooseOtherLocation() {
    setErrorMessage(null);
    try {
      const folder = await pickFolder();
      // キャンセルなら前の選択のまま
      if (folder) setParent(folder);
    } catch (error) {
      console.error(error);
      setErrorMessage('フォルダを選べませんでした');
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.screen}
      >
        {/* 入力欄の外をタップするとキーボードを閉じる（「完了」キーは本棚の作成になるため、ほかに閉じる手段がない） */}
        <Pressable accessible={false} onPress={Keyboard.dismiss} style={styles.body}>
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
          {canUseOtherLocations ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="保存場所"
              disabled={isCreating}
              onPress={() => setIsLocationMenuOpen(true)}
              style={[styles.locationRow, { backgroundColor: colors.surface }]}
            >
              <View style={styles.locationText}>
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
                  保存場所
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}
                >
                  {parent
                    ? `選んだ場所: ${entryName(parent)}`
                    : 'アプリ内（このiPhone内 > Leaves）'}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.muted} />
            </Pressable>
          ) : null}
          <Text style={[styles.note, { color: colors.muted, fontFamily: fonts.regular }]}>
            {parent ? '本棚は選んだ場所の中にフォルダとして作られます' : appShelfNote}
          </Text>

          {/* 入力欄のすぐ下に置く（下端に寄せると Android でキーボードに隠れるため） */}
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
          {canUseOtherLocations ? (
            <Pressable
              accessibilityRole="button"
              disabled={isCreating}
              onPress={openExistingFolder}
              style={styles.linkButton}
            >
              <Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 15 }}>
                既存のフォルダを本棚として開く
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>

      <ActionMenu
        visible={isLocationMenuOpen}
        title="保存場所"
        items={[
          { label: 'アプリ内', onPress: () => setParent(null) },
          { label: '別の場所を選ぶ…', onPress: chooseOtherLocation },
        ]}
        onClose={() => setIsLocationMenuOpen(false)}
      />
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
  locationRow: {
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: { flex: 1, gap: 2 },
  note: { fontSize: 12 },
  createButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
