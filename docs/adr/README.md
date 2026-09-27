# ADR（Architecture Decision Record）

設計上の重要な判断を、判断した時点で1件1ファイルで記録する。

## なぜ ADR を使うか
コードは必ず変更される。設計書を一度書いて終わりにすると、書いた瞬間からコードとのずれが始まる。
ADR は「なぜその方式を選んだか」「何を捨てたか」を判断のたびに小さく追記していくことで、
設計の理由（理論）をコードの変更履歴と一緒に残す。

## 運用ルール
- 重要な判断をしたら、新しい番号で1件追加する（ファイル名: `NNNN-短い名前.md`）
- **過去の ADR は書き換えない**。判断を変える場合は新しい ADR を追加し、古い ADR の状態を「〇〇により置き換え」に変更する（状態欄の更新のみ許可）
- 設計書（要件定義書・基本設計書・詳細設計書）と ADR が食い違う場合は、**新しい ADR が優先**する
- 「重要な判断」の目安: 後から「なぜこうなっているのか」と聞かれそうなもの、他の選択肢を検討して捨てたもの

## テンプレート

```markdown
# NNNN. タイトル

- 状態: 提案 / 承認 / 〇〇により置き換え
- 日付: YYYY-MM-DD

## 背景
何が問題で、何を決める必要があったか。

## 決定
何を選んだか。

## 検討した選択肢
- 選択肢A — 採用しなかった理由
- 選択肢B — 採用しなかった理由

## 結果
この決定によって何が良くなり、何を引き受けたか（トレードオフ）。
```

## 一覧

| No | タイトル | 状態 |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | 設計判断を ADR で記録する | 承認 |
| [0002](0002-expo-react-native.md) | Expo（React Native）で iOS/Android 両対応する | 承認 |
| [0003](0003-standalone-local-storage.md) | Obsidian と連携せず、端末内の SQLite ＋画像ファイルで完結させる | 承認 |
| [0004](0004-fulltext-search-trigram.md) | 全文検索に FTS5 trigram を使い、検索経路を1本にする | 承認 |
| [0005](0005-minimum-os-versions.md) | 最低対応 OS を iOS 16.4 / Android 10 とする | 承認 |
| [0006](0006-pdf-invisible-text-layer.md) | PDF に OCR テキストを透明テキストとして埋め込む | 承認 |
| [0007](0007-notebook-ubiquitous-language.md) | フォルダの概念をコード上でも notebook と呼ぶ | 承認 |
| [0008](0008-db-access-wrapper-for-tests.md) | DB アクセスを薄いラッパー経由にし、テストで差し替える | 承認（実装方法は 0011 で更新） |
| [0009](0009-spike-r1-trigram-confirmed.md) | 事前検証 R-1 の結果、trigram への LIKE 1本の検索を維持する | 承認 |
| [0010](0010-spike-r2-pdf-confirmed.md) | 事前検証 R-2 の結果、pdf-lib による透明テキスト付き PDF を採用する | 承認 |
| [0011](0011-serialize-db-access.md) | DB へのアクセスを1本の順番待ちに並べ、トランザクションは引数の tx で行う | 承認 |
| [0012](0012-ios27-scene-lifecycle-plugin.md) | iOS 27 の UIScene 必須化に、独自の config plugin で対応する | 承認 |
| [0013](0013-ocr-apple-vision-on-ios.md) | iOS の文字認識は Apple Vision、Android は ML Kit を使う | 承認 |
| [0014](0014-ios27-appearance-bridge.md) | iOS 27 で外観（ライト/ダーク）の変更を React Native に届け直す | 承認 |
