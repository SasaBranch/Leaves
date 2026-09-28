// DB スキーマの唯一の置き場所（詳細設計書 6.2〜6.3）。
// 既存のマイグレーションは書き換えず、変更は新しいマイグレーションを末尾に追加する。
// 1つのマイグレーションは SQL 文の配列（Db.run は1文ずつ実行するため）。
import type { Db } from './db';

const MIGRATIONS: readonly (readonly string[])[] = [
  // 1: 初期スキーマ
  [
    `CREATE TABLE notebooks (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
      name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
      color       TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )`,
    // parent_id が NULL 同士は UNIQUE で区別されないため、空文字に置き換えて比較する（FR-F-06）
    `CREATE UNIQUE INDEX notebooks_unique_name ON notebooks (ifnull(parent_id, ''), name)`,
    `CREATE TABLE notes (
      id           TEXT PRIMARY KEY,
      notebook_id  TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )`,
    `CREATE INDEX notes_by_notebook ON notes (notebook_id, updated_at DESC)`,
    `CREATE TABLE pages (
      id          TEXT PRIMARY KEY,
      note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      position    INTEGER NOT NULL,
      width       INTEGER NOT NULL,
      height      INTEGER NOT NULL,
      ocr_status  TEXT NOT NULL DEFAULT 'pending'
                  CHECK (ocr_status IN ('pending', 'processing', 'done', 'failed')),
      ocr_text    TEXT NOT NULL DEFAULT '',
      ocr_lines   TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      UNIQUE (note_id, position)
    )`,
    `CREATE INDEX pages_by_ocr_status ON pages (ocr_status)`,
    `CREATE VIRTUAL TABLE pages_fts USING fts5 (
      page_id UNINDEXED,
      title,
      ocr_text,
      tokenize = 'trigram'
    )`,
    // pages_fts はトリガーだけが更新する（検索索引の同期の知識を DB の1か所に置く）
    `CREATE TRIGGER pages_fts_after_page_insert AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts (page_id, title, ocr_text)
      SELECT new.id, notes.title, new.ocr_text FROM notes WHERE notes.id = new.note_id;
    END`,
    `CREATE TRIGGER pages_fts_after_ocr_update AFTER UPDATE OF ocr_text ON pages BEGIN
      UPDATE pages_fts SET ocr_text = new.ocr_text WHERE page_id = new.id;
    END`,
    `CREATE TRIGGER pages_fts_after_page_delete AFTER DELETE ON pages BEGIN
      DELETE FROM pages_fts WHERE page_id = old.id;
    END`,
    `CREATE TRIGGER pages_fts_after_title_update AFTER UPDATE OF title ON notes BEGIN
      UPDATE pages_fts SET title = new.title
      WHERE page_id IN (SELECT id FROM pages WHERE note_id = new.id);
    END`,
  ],
  // 2: 本棚フォルダを正本にする（詳細設計書 v2.0 6.2、ADR 0016・0020）
  [
    // 名前の重複はフォルダ（ファイルシステム）が防ぐ。外部で付けられた名前を走査で取り込めなくなるのを避けるため
    `DROP INDEX notebooks_unique_name`,
    // 前回の走査時のフォルダの更新日時（ミリ秒）。同じなら中身の確認を省く。NULL は未走査
    `ALTER TABLE notebooks ADD COLUMN scanned_modified_at REAL`,
    `ALTER TABLE notes ADD COLUMN scanned_modified_at REAL`,
  ],
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

/** DB を開いた直後に毎回行う設定（詳細設計書 6.1）。トランザクションの外で実行する必要がある */
export async function configureConnection(db: Db): Promise<void> {
  // CASCADE 削除を有効にするため（SQLite は既定で無効）
  await db.run('PRAGMA foreign_keys = ON');
  // 書き込み中も読み取りを止めないため。結果の行を返す PRAGMA なので get で実行する
  await db.get('PRAGMA journal_mode = WAL');
}

/**
 * 未適用のマイグレーションを、1つずつトランザクションで適用する。
 * targetVersion は v1.0 の DB を再現するテスト用（移行の元データ。詳細設計書 9.10）
 */
export async function migrateDatabase(
  db: Db,
  targetVersion: number = LATEST_SCHEMA_VERSION,
): Promise<void> {
  const currentVersion = await readSchemaVersion(db);
  for (let version = currentVersion + 1; version <= targetVersion; version++) {
    const statements = MIGRATIONS[version - 1] ?? [];
    await db.transaction(async (tx) => {
      for (const statement of statements) {
        await tx.run(statement);
      }
      // PRAGMA はパラメータを受け取れないため、数値を直接埋め込む
      await tx.run(`PRAGMA user_version = ${version}`);
    });
  }
}

export async function readSchemaVersion(db: Db): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}
