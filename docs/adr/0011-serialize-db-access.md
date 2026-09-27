# 0011. DB へのアクセスを1本の順番待ちに並べ、トランザクションは引数の tx で行う

- 状態: 承認
- 日付: 2026-09-28

## 背景
ADR 0008 では、リポジトリが使う `Db` 型（run / get / all / transaction）を expo-sqlite と better-sqlite3 でそれぞれ実装する予定だった。`transaction(work: () => Promise<void>)` の中では、外側と同じ `db` を使う想定だった。

実装にあたり expo-sqlite 57 の API を確認したところ、次のことが分かった（#7）。
- `withTransactionAsync` は、トランザクションの途中に別の非同期クエリが割り込んで、トランザクションに混ざることがある
- `withExclusiveTransactionAsync` は割り込みを防げるが、トランザクション中の処理は引数の `txn` で行う必要があり、その間の別の書き込みは「database is locked」で失敗する

Leaves では OCR キューがノートの保存と並行して DB に書き込むため、どちらもそのままでは問題になる。

## 決定
- **すべての DB 操作を、アプリ内の1本の順番待ちに並べる**。前の操作（トランザクション全体を含む）が終わるまで次の操作を始めない
- トランザクションは `transaction(work: (tx: Db) => Promise<void>)` とし、中の操作は引数の `tx` で行う（`tx` は順番待ちを通らない）。`tx.transaction` は外側に合流する
- 順番待ちとトランザクション（`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`）の仕組みは `createDb(driver)` の1か所に書き、アプリとテストで共有する。ライブラリごとに実装するのは `SqlDriver`（run / get / all の3つ）だけにする

## 検討した選択肢
- `withExclusiveTransactionAsync` を使い、「database is locked」になったら再試行する — 再試行の回数・間隔という新しい判断が必要になり、失敗の仕方も複雑になる
- `withTransactionAsync` を使い、割り込みを許容する — 割り込んだ OCR の保存が、保存失敗時の ROLLBACK で一緒に消える
- ライブラリごとに `Db` を実装する（ADR 0008 のまま） — 一番間違えやすい順番待ちとトランザクションの仕組みが2か所に分かれ、アプリ側の実装だけがテストされない

## 結果
- 割り込みもロックエラーも起きない。順番待ちとトランザクションの仕組みが Node.js 上のテストで検証される
- 読み取りも順番待ちに並ぶため、長いトランザクションの間は画面の読み取りが待たされる。Leaves のトランザクションは短い（ノート1件の登録程度）ため許容する
- ADR 0008 の「`Db` を expo-sqlite と better-sqlite3 で実装する」は、「`SqlDriver` を2つ実装し、`Db` は共通の `createDb` で作る」に置き換える
