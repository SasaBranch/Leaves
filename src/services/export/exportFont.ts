// PDF に埋め込む日本語フォント（詳細設計書 9.5）。
// アセットの読み込みはネイティブ機能のため別のファイルにし、テストでは同じフォントをディスクから読む
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

export async function loadJapaneseFontBytes(): Promise<Uint8Array> {
  const asset = await Asset.fromModule(NotoSansJP_400Regular).downloadAsync();
  if (!asset.localUri) throw new Error('PDF 用のフォントを読み込めませんでした');
  return new File(asset.localUri).bytes();
}
