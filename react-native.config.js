// ML Kit の iOS 版は arm64 のシミュレータに対応していないため、iOS では自動リンクしない。
// iOS の文字認識は modules/vision-text-recognizer（Apple Vision）を使う（ADR 0013）
module.exports = {
  dependencies: {
    '@react-native-ml-kit/text-recognition': {
      platforms: { ios: null },
    },
  },
};
