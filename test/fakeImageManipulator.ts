// expo-image-manipulator のテスト用の偽物（jest の moduleNameMapper で差し替える）。
// 変換は「元のファイルの中身をキャッシュに写す」だけにし、画像の大きさは記録された値を返す。
import { File, Paths } from 'expo-file-system';

export const fakeImageManipulator = {
  /** 変換前の画像の大きさ（uri ごと）。未登録なら DEFAULT_SIZE */
  sizes: new Map<string, { width: number; height: number }>(),
  /** 何回目の保存を失敗させるか（1 始まり）。null なら失敗させない */
  failOnSave: null as number | null,
  saveCount: 0,
  resizeCalls: [] as unknown[],
  reset() {
    this.sizes.clear();
    this.failOnSave = null;
    this.saveCount = 0;
    this.resizeCalls.length = 0;
  },
};

const DEFAULT_SIZE = { width: 3000, height: 4000 };

export const SaveFormat = { JPEG: 'jpeg' };

export const ImageManipulator = {
  manipulate(uri: string) {
    let size = fakeImageManipulator.sizes.get(uri) ?? DEFAULT_SIZE;
    const context = {
      resize(spec: { width?: number; height?: number }) {
        fakeImageManipulator.resizeCalls.push(spec);
        const ratio = spec.width ? spec.width / size.width : (spec.height ?? size.height) / size.height;
        size = { width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) };
        return context;
      },
      async renderAsync() {
        return {
          ...size,
          async saveAsync() {
            fakeImageManipulator.saveCount += 1;
            if (fakeImageManipulator.failOnSave === fakeImageManipulator.saveCount) {
              throw new Error('変換に失敗');
            }
            const output = new File(Paths.cache, `manipulated-${fakeImageManipulator.saveCount}.jpg`);
            output.write(new File(uri).bytesSync());
            return { uri: output.uri, ...size };
          },
        };
      },
    };
    return context;
  },
};
