// SC-7 検索（基本設計書 4.3）
import { router, useLocalSearchParams } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NotebookId, SearchHit } from '@/domain/types';
import { useSearch, useSearchScopes } from '@/hooks/useSearch';
import { useTheme } from '@/theme/useTheme';
import { SearchResultRow } from '@/ui/components/SearchResultRow';

export default function SearchScreen() {
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const initialScopeId = (scope ?? null) as NotebookId | null;
  const [keyword, setKeyword] = useState('');
  const [scopeId, setScopeId] = useState(initialScopeId);
  const { hits, searchedKeyword } = useSearch(keyword, scopeId);
  const { data: scopes } = useSearchScopes(initialScopeId);
  const { colors, fonts } = useTheme();

  const openHit = (hit: SearchHit) =>
    router.push({
      pathname: '/note/[id]',
      params: { id: hit.noteId, page: String(hit.pagePosition) },
    });

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <SearchField keyword={keyword} onChange={setKeyword} />
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancel}>
          <Text style={{ color: colors.accentText, fontFamily: fonts.medium, fontSize: 15 }}>
            キャンセル
          </Text>
        </Pressable>
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
        >
          <ScopeChip
            label="すべて"
            isSelected={scopeId === null}
            onPress={() => setScopeId(null)}
          />
          {(scopes ?? []).map((notebook) => (
            <ScopeChip
              key={notebook.id}
              label={notebook.name}
              isSelected={scopeId === notebook.id}
              onPress={() => setScopeId(notebook.id)}
            />
          ))}
        </ScrollView>
      </View>

      {searchedKeyword === '' ? (
        <Text style={[styles.status, { color: colors.muted, fontFamily: fonts.regular }]}>
          ノート名と文字認識したテキストから探します
        </Text>
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(hit) => hit.pageId}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <Text style={[styles.status, { color: colors.muted, fontFamily: fonts.regular }]}>
              「{searchedKeyword}」を含むページ {hits.length}件
            </Text>
          }
          renderItem={({ item }) => <SearchResultRow hit={item} onPress={() => openHit(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function SearchField({
  keyword,
  onChange,
}: {
  keyword: string;
  onChange: (keyword: string) => void;
}) {
  const { colors, fonts } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: colors.surface2,
          borderColor: isFocused ? colors.accent : 'transparent',
        },
      ]}
    >
      <Search size={18} color={colors.muted} />
      <TextInput
        accessibilityLabel="検索キーワード"
        value={keyword}
        onChangeText={onChange}
        placeholder="ノートを検索"
        placeholderTextColor={colors.muted}
        autoFocus
        returnKeyType="search"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        selectionColor={colors.accent}
        style={[styles.input, { color: colors.text, fontFamily: fonts.regular }]}
      />
      {keyword !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="キーワードを消去"
          onPress={() => onChange('')}
          style={styles.clear}
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ScopeChip({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`検索範囲: ${label}`}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.chip,
        isSelected
          ? { backgroundColor: colors.accent, borderColor: colors.accent }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text
        style={{
          color: isSelected ? colors.onAccent : colors.text,
          fontFamily: isSelected ? fonts.bold : fonts.medium,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
  },
  field: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
  },
  input: { flex: 1, height: '100%', fontSize: 15 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancel: { height: 44, justifyContent: 'center', paddingHorizontal: 12 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  status: { paddingHorizontal: 20, paddingBottom: 6, fontSize: 13 },
});
