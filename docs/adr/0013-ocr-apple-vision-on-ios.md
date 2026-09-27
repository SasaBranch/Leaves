# 0013. iOS の文字認識は Apple Vision、Android は ML Kit を使う

- 状態: 承認
- 日付: 2026-09-28

## 背景
基本設計・詳細設計では、両 OS とも `@react-native-ml-kit/text-recognition`（Google ML Kit）で文字認識する予定だった。
実装してビルドしたところ、ML Kit の iOS 版は **arm64 の iOS シミュレータに対応していない**（`EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`）ことが分かった（#13）。Apple Silicon の Mac ではシミュレータ向けにビルドできなくなり、画面の開発・確認がすべて実機頼みになる。

## 決定
- **iOS は Apple Vision**（`VNRecognizeTextRequest`、`ja-JP` / `en-US`、精度優先）を使う。Vision を直接呼ぶローカル Expo モジュール `modules/vision-text-recognizer` を作る
- **Android は ML Kit** のまま使う。`react-native.config.js` で ML Kit の iOS 自動リンクを無効にし、iOS のビルドに ML Kit を含めない
- 両者の違いは `src/native/textRecognizer.ts` の中で吸収し、行ごとの文字と位置（左上原点の px）という同じ形で返す。呼び出し側（OCR キュー）は OS の違いを知らない

## 検討した選択肢
- iOS も ML Kit のまま、画面の確認は実機だけで行う — 開発の速度が大きく落ちる
- シミュレータを x86_64（Rosetta）でビルドする — Xcode 27 世代で Rosetta に頼るのは先がない
- 既存の Vision ラッパー（expo-text-extractor）を使う — 文字列しか返さず、PDF の透明テキスト（ADR 0006）に必要な行の位置が取れない

## 結果
- iOS シミュレータで開発できる。iOS のアプリサイズから ML Kit（4言語分のモデル）がなくなる
- iOS と Android で認識エンジンが違うため、認識精度や行の区切り方が OS で異なりうる。受け入れ確認（#34）で両方の結果を確認する
- 抽象化（OS ごとの実装の切り替え）は「今すでに2つの実装が必要」という理由による（詳細設計書 3.3）
- ローカルモジュールの Swift コードは自分たちで保守する（約70行）
