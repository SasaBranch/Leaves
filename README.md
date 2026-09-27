# Leaves

紙のノートを撮影してキャプチャし、フォルダ階層で整理するスマホアプリ（iOS / Android）。

- 📷 **スキャン** — 輪郭検出・台形補正・複数ページ撮影
- 🔤 **OCR** — 端末内で日本語テキストを認識し、全文検索可能に
- 🌳 **フォルダ階層** — 無制限にネストできるフォルダでノートを整理
- 📤 **エクスポート** — Markdown / PDF で書き出し

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| フレームワーク | Expo (React Native) + TypeScript |
| スキャン | react-native-document-scanner-plugin (VisionKit / ML Kit) |
| OCR | @react-native-ml-kit/text-recognition |
| データ | expo-sqlite (FTS5 trigram) + ローカル画像ファイル |

## 開発プロセス

要件定義 → 基本設計 → 詳細設計 → 実装 → テスト → デバッグ の順で進めます。

| フェーズ | ドキュメント |
|---|---|
| 要件定義書 | [docs/01_requirements](docs/01_requirements) |
| 基本設計書 | [docs/02_basic-design](docs/02_basic-design) |
| 詳細設計書 | [docs/03_detailed-design](docs/03_detailed-design) |
| テスト | [docs/04_test](docs/04_test) |
| 設計判断の記録（ADR） | [docs/adr](docs/adr) |

## ステータス

🌿 詳細設計フェーズ（要件定義書 v1.1・基本設計書 v1.0 確定）
