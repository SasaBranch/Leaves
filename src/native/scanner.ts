// OS 標準のドキュメントスキャナ（iOS: VisionKit / Android: ML Kit）。輪郭検出・台形補正・複数ページは OS 側の機能
import { Image } from 'react-native';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';

import type { CapturedImage } from '@/domain/types';

/** 最高画質で受け取り、保存時に 2400px・JPEG 0.8 へ変換する（二重に劣化させないため） */
const SCANNER_IMAGE_QUALITY = 100;

/** キャンセルされたら null（キャンセルは正常な操作なので例外にしない） */
export async function scanDocument(): Promise<CapturedImage[] | null> {
  const response = await DocumentScanner.scanDocument({
    croppedImageQuality: SCANNER_IMAGE_QUALITY,
    responseType: ResponseType.ImageFilePath,
  });
  if (response.status === ScanDocumentResponseStatus.Cancel || !response.scannedImages?.length) {
    return null;
  }
  return Promise.all(response.scannedImages.map(toCapturedImage));
}

async function toCapturedImage(path: string): Promise<CapturedImage> {
  // スキャナは OS によって file:// なしのパスを返すことがあるため URI にそろえる（#4 で実機確認）
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  const { width, height } = await Image.getSize(uri);
  return { uri, width, height };
}
