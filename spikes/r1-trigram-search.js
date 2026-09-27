// R-1 検証: FTS5 trigram テーブルへの LIKE 検索1本で、NFR-P-03（ページ5,000枚で1秒以内）を満たすか。
// 詳細設計書 6.2〜6.4 のスキーマ・トリガー・検索 SQL をそのまま使う。
// 実行: node spikes/r1-trigram-search.js
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');

const NOTE_COUNT = 1000;
const PAGES_PER_NOTE = 5;
const CHARS_PER_PAGE = 400; // 手書きノート1ページの OCR 文字数の目安
const RUNS = 20;

const SENTENCES = [
  '固有値と固有ベクトルの定義を確認する。',
  '行列式が零になる条件から特性方程式を立てる。',
  '線形写像の核と像の次元の関係を整理した。',
  '次回の定例会議までに見積りを出すこと。',
  'リリース日は十月十五日で確定した。',
  'デザインの最終確認を金曜日に行う。',
  'イシューとは答えを出すべき問題のことである。',
  '仮説を立ててから分析の設計を行う。',
  '牛乳とたまごとノートを三冊買う。',
  '京都の嵐山から伏見稲荷へ移動する。',
  '対称行列の固有値は実数になる。',
  '部分空間であるための条件は三つある。',
  'TODO: 佐藤さんに資料を送る',
  'Ax = λx (x ≠ 0) を満たす λ を求める。',
  '課題の提出期限は十月三日、A4で二枚以内。',
];

function makeText(seed) {
  let text = '';
  let i = seed;
  while (text.length < CHARS_PER_PAGE) {
    text += SENTENCES[i % SENTENCES.length];
    i = (i * 7 + 3) % 9973;
  }
  return text.slice(0, CHARS_PER_PAGE);
}

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX notebooks_unique_name ON notebooks (ifnull(parent_id, ''), name);
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX notes_by_notebook ON notes (notebook_id, updated_at DESC);
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','processing','done','failed')),
  ocr_text TEXT NOT NULL DEFAULT '',
  ocr_lines TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (note_id, position)
);
CREATE VIRTUAL TABLE pages_fts USING fts5 (page_id UNINDEXED, title, ocr_text, tokenize = 'trigram');
CREATE TRIGGER pages_fts_after_page_insert AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts (page_id, title, ocr_text)
  SELECT new.id, notes.title, new.ocr_text FROM notes WHERE notes.id = new.note_id;
END;
CREATE TRIGGER pages_fts_after_ocr_update AFTER UPDATE OF ocr_text ON pages BEGIN
  UPDATE pages_fts SET ocr_text = new.ocr_text WHERE page_id = new.id;
END;
CREATE TRIGGER pages_fts_after_page_delete AFTER DELETE ON pages BEGIN
  DELETE FROM pages_fts WHERE page_id = old.id;
END;
CREATE TRIGGER pages_fts_after_title_update AFTER UPDATE OF title ON notes BEGIN
  UPDATE pages_fts SET title = new.title WHERE page_id IN (SELECT id FROM pages WHERE note_id = new.id);
END;
`);

// --- データ投入 ---
const now = new Date().toISOString();
const insertNotebook = db.prepare('INSERT INTO notebooks VALUES (?, ?, ?, ?, ?, ?)');
const insertNote = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?)');
const insertPage = db.prepare(
  "INSERT INTO pages (id, note_id, position, width, height, ocr_status, ocr_text, created_at, updated_at) VALUES (?, ?, ?, 1800, 2400, 'done', ?, ?, ?)",
);
const notebookIds = [];
const seedStart = performance.now();
db.transaction(() => {
  for (let n = 0; n < 20; n++) {
    const id = randomUUID();
    insertNotebook.run(id, null, `ノートブック${n}`, '#2F5D45', now, now);
    notebookIds.push(id);
  }
  for (let n = 0; n < NOTE_COUNT; n++) {
    const noteId = randomUUID();
    const updatedAt = new Date(Date.now() - n * 60000).toISOString();
    insertNote.run(noteId, notebookIds[n % notebookIds.length], `ノート${n}`, updatedAt, updatedAt);
    for (let p = 0; p < PAGES_PER_NOTE; p++) {
      insertPage.run(randomUUID(), noteId, p, makeText(n * PAGES_PER_NOTE + p), now, now);
    }
  }
})();
const seedMs = performance.now() - seedStart;

// --- 検索（詳細設計書 6.4、範囲指定なし）---
const search = db.prepare(`
SELECT pages_fts.page_id, pages_fts.title, pages_fts.ocr_text, pages.position, notes.id AS note_id, notes.notebook_id
FROM pages_fts
JOIN pages ON pages.id = pages_fts.page_id
JOIN notes ON notes.id = pages.note_id
WHERE (pages_fts.title LIKE ? ESCAPE '\\' OR pages_fts.ocr_text LIKE ? ESCAPE '\\')
ORDER BY notes.updated_at DESC, pages.position
LIMIT 100`);

function escapeLike(keyword) {
  return keyword.replace(/[\\%_]/g, (c) => '\\' + c);
}

function measure(keyword) {
  const pattern = `%${escapeLike(keyword)}%`;
  const times = [];
  let hits = 0;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    hits = search.all(pattern, pattern).length;
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  return { keyword, chars: [...keyword].length, hits, medianMs: median.toFixed(2), maxMs: times.at(-1).toFixed(2) };
}

const pageCount = db.prepare('SELECT count(*) AS c FROM pages').get().c;
const version = db.prepare('SELECT sqlite_version() AS v').get().v;
console.log(`SQLite ${version} / notes=${NOTE_COUNT} pages=${pageCount} chars/page=${CHARS_PER_PAGE} / seed ${seedMs.toFixed(0)}ms`);
console.table(
  ['値', '固有', '固有値', '特性方程式', 'ぬゅ', 'λ', '100%', 'ノート99'].map(measure),
);

// 検索索引が LIKE 用に使われているかの確認（3文字以上は FTS の索引、未満は全件走査になるはず）
for (const keyword of ['固有', '固有値']) {
  const plan = db
    .prepare(`EXPLAIN QUERY PLAN SELECT page_id FROM pages_fts WHERE ocr_text LIKE ?`)
    .all(`%${keyword}%`)
    .map((row) => row.detail)
    .join(' / ');
  console.log(`plan(${keyword}): ${plan}`);
}

// トリガーの確認: タイトル変更・CASCADE 削除で索引が追従するか
const someNote = db.prepare('SELECT id FROM notes LIMIT 1').get().id;
db.prepare("UPDATE notes SET title = 'タイトル変更テスト' WHERE id = ?").run(someNote);
const renamed = db.prepare("SELECT count(*) AS c FROM pages_fts WHERE title LIKE '%タイトル変更テスト%'").get().c;
db.prepare('DELETE FROM notebooks WHERE id = ?').run(notebookIds[0]);
const remaining = db.prepare('SELECT (SELECT count(*) FROM pages) AS pages, (SELECT count(*) FROM pages_fts) AS fts').get();
console.log(`title trigger: ${renamed} rows updated (expect ${PAGES_PER_NOTE}) / after cascade delete: pages=${remaining.pages} fts=${remaining.fts} (expect equal)`);
