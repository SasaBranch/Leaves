// アプリ起動時に読み込むフォント。キーは tokens.ts の fontFamilies の値と一致させる
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  ZenKakuGothicNew_400Regular,
  ZenKakuGothicNew_500Medium,
  ZenKakuGothicNew_700Bold,
} from '@expo-google-fonts/zen-kaku-gothic-new';

import { fontFamilies } from './tokens';

export const appFonts = {
  [fontFamilies.logo]: Fraunces_600SemiBold,
  [fontFamilies.regular]: ZenKakuGothicNew_400Regular,
  [fontFamilies.medium]: ZenKakuGothicNew_500Medium,
  [fontFamilies.bold]: ZenKakuGothicNew_700Bold,
};
