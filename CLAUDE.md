@AGENTS.md

# Leaves プロジェクトの進め方

紙のノートを撮影・OCR し、ノートブック（フォルダ階層）で整理するスマホアプリ。

## 設計書と判断の記録
- 要件定義書: `docs/01_requirements/requirements.md`
- 基本設計書: `docs/02_basic-design/basic-design.md`
- 詳細設計書: `docs/03_detailed-design/detailed-design.md`（モジュール構成・型・DB・命名規則）
- ADR: `docs/adr/`。**設計書と ADR が食い違う場合は新しい ADR が優先**。設計判断をしたら ADR を1件追加する（過去の ADR は書き換えない）

## コードを書くときの約束
- 詳細設計書 3 章（設計原則の適用方針）と 2 章（用語・命名規則）に従う
  - フォルダの概念はコード上も `notebook`（ADR 0007）
  - 抽象化は「今すでに2つの実装が必要な場合」だけ
  - 意味のある数値は `src/config.ts` の名前付き定数にする
- 画面が DB を更新するときは必ず `src/services` を通す
- 作業の区切りで `npm run check`（型チェック・lint・テスト）を通す
- タスクは GitHub Issues（SasaBranch/Leaves）で管理。コミットメッセージに `#番号` を入れる
