// OS の共有シート（FR-E-03）
import { shareAsync } from 'expo-sharing';

export async function shareFile(file: { uri: string; mimeType: string }): Promise<void> {
  await shareAsync(file.uri, { mimeType: file.mimeType });
}
