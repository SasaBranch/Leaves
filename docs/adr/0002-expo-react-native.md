# 0002. Expo（React Native）で iOS/Android 両対応する

- 状態: 承認
- 日付: 2026-09-28

## 背景
iOS と Android の両方で動くスマホアプリが必要。開発者は1人。スキャン（輪郭検出・台形補正）と OCR は OS 標準機能の品質を使いたい。

## 決定
Expo（React Native）＋ TypeScript を採用する。ネイティブ機能は既存ライブラリ（react-native-document-scanner-plugin、@react-native-ml-kit/text-recognition）を使い、Expo Go ではなく開発ビルドで動かす。

## 検討した選択肢
- Swift / SwiftUI（iOS のみ） — VisionKit を直接使えて最高品質だが、Android に対応できない
- Flutter — 両対応できるが、スキャナ・OCR のプラグインの選択肢と成熟度で React Native に劣る
- Kotlin / Swift を別々に開発 — 1人開発では工数が2倍になる

## 結果
- 1つのコードベースで両 OS に対応できる
- 両 OS のスキャナ UI の差（VisionKit と ML Kit）はそのまま受け入れる
- 開発ビルドが必要になり、カメラ機能の確認には実機が必要
