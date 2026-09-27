// OS 標準のドキュメントスキャナ（iOS: VisionKit / Android: ML Kit）。輪郭検出・台形補正・複数ページは OS 側の機能
import { requestCameraPermissionsAsync } from 'expo-image-picker';
import { Image, Platform } from 'react-native';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';

import { AppError } from '@/domain/errors';
import type { CapturedImage } from '@/domain/types';

/** 最高画質で受け取り、保存時に 2400px・JPEG 0.8 へ変換する（二重に劣化させないため） */
const SCANNER_IMAGE_QUALITY = 100;

/** キャンセルされたら null（キャンセルは正常な操作なので例外にしない） */
export async function scanDocument(): Promise<CapturedImage[] | null> {
  await ensureCameraPermission();
  const response = await DocumentScanner.scanDocument({
    croppedImageQuality: SCANNER_IMAGE_QUALITY,
    responseType: ResponseType.ImageFilePath,
  });
  if (response.status === ScanDocumentResponseStatus.Cancel || !response.scannedImages?.length) {
    return null;
  }
  return Promise.all(response.scannedImages.map(toCapturedImage));
}

/**
 * スキャナを開く前にカメラの許可を確かめる。拒否されたままスキャナを開くと、OS によっては
 * 何も表示されずに終わり、利用者が理由を知る手段がないため（FR-S-08）
 */
async function ensureCameraPermission(): Promise<void> {
  // Android の ML Kit スキャナは Google Play 開発者サービス側のカメラ画面で撮るため、アプリの許可は不要
  if (Platform.OS !== 'ios') return;
  const { granted } = await requestCameraPermissionsAsync();
  if (!granted) throw new AppError('cameraPermissionDenied');
}

async function toCapturedImage(path: string): Promise<CapturedImage> {
  // スキャナは OS によって file:// なしのパスを返すことがあるため URI にそろえる（#4 で実機確認）
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  const { width, height } = await Image.getSize(uri);
  return { uri, width, height };
}
