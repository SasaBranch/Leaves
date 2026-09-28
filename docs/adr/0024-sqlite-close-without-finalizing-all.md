# 0024. SQLite を閉じる前の「残っている文の一括の片づけ」を切る

- 状態: 承認
- 日付: 2026-09-28

## 背景
iPhone 実機で、開いている本棚の名前を変えるとアプリが落ちた（利用者からの報告）。クラッシュログ（`EXC_BAD_ACCESS`）の呼び出し順は `SQLiteModule.closeDatabase` → `sqlite3Close` → FTS5 の後始末（`fts5DisconnectMethod` → `sqlite3Fts5IndexClose`）→ `sqlite3_finalize` だった。

expo-sqlite は既定（`finalizeUnusedStatementsBeforeClosing: true`）で、DB を閉じる前に `sqlite3_next_stmt` でたどれるすべての文を解放する。その中に全文検索（FTS5）が内部で持っている文も含まれるため、続く `sqlite3_close` で FTS5 が同じ文をもう一度解放し、不正なメモリを読んで落ちる。本棚の名前変更・切り替え・削除（どれも本棚の DB を閉じる）と、v1.0 のデータの移行（旧 DB を閉じる）のすべてで起きうる。

シミュレータで「全文検索を一度使ってから DB を閉じて開き直す」と同じクラッシュが再現し、この設定を切ると再現しなかった。

## 決定
- DB を開くときの設定を1か所（`src/db/expoSqliteDriver.ts` の `SQLITE_OPEN_OPTIONS`）にまとめ、`finalizeUnusedStatementsBeforeClosing: false` にする。本棚の DB・v1.0 の DB の両方で使う
- アプリは文を持ち続けない呼び方（`runAsync` `getFirstAsync` `getAllAsync`。内部で準備・解放まで行う）だけを使っているため、閉じる時点で解放すべき文は残らない

## 検討した選択肢
- **本棚の DB を閉じない（開いたまま使い回す）** — 本棚の削除時に開いたままのファイルを消すことになり、切り替えるたびに接続が増える
- **閉じる前に FTS5 のテーブルを使わないようにする** — FTS5 は一度でも検索・更新すれば内部の文を持つため、避けようがない

## 結果
- 本棚の名前変更・切り替え・削除で落ちなくなる
- 今後、文を準備して持ち続ける API（`prepareAsync`）を使う場合は、自分で `finalizeAsync` する必要がある
