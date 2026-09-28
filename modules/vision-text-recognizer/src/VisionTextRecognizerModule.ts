import { NativeModule, requireOptionalNativeModule } from 'expo';

export type VisionRecognizedLine = {
  text: string;
  /** 画像上の位置（左上原点の px） */
  frame: { left: number; top: number; width: number; height: number };
};

declare class VisionTextRecognizerModule extends NativeModule<Record<string, never>> {
  recognize(uri: string): Promise<{ text: string; lines: VisionRecognizedLine[] }>;
}

// iOS 専用。Android は ML Kit を使う（src/native/textRecognizer.ts）。
// Android では読み込んだだけで落ちないよう、なければ null にする
export default requireOptionalNativeModule<VisionTextRecognizerModule>('VisionTextRecognizer');
