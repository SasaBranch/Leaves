// OS のライト/ダーク設定に追従する（NFR-U-03。アプリ内の切り替えは設けない）
import { useColorScheme } from 'react-native';

import { darkColors, fontFamilies, lightColors, type ColorTokens } from './tokens';

export type Theme = { colors: ColorTokens; fonts: typeof fontFamilies; isDark: boolean };

export function useTheme(): Theme {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? darkColors : lightColors, fonts: fontFamilies, isDark };
}
