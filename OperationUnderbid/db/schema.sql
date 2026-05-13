-- Operation Underbid · SQLite Schema · v2.0
-- Enable WAL for concurrent reads + crash safety
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ─── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,          -- Fiverr/Upwork order ID
  platform      TEXT NOT NULL,             -- 'fiverr' | 'upwork'
  gig_type      TEXT NOT NULL,             -- 'blog' | 'logo' | 'website' | 'seo' | 'caption' | 'social'
  buyer_name    TEXT NOT NULL,
  buyer_username TEXT NOT NULL,
  brief         TEXT NOT NULL,             -- raw brief from buyer
  brief_json    TEXT,                      -- structured JSON parsed from brief
  price_gbp     REAL NOT NULL DEFAULT 0,
  deadline_at   TEXT,                      -- ISO timestamp
  status        TEXT NOT NULL DEFAULT 'new',
                                           -- new | in_progress | qa | review | approved | delivered | revision | dispute | cancelled
  revision_count INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,
  order_id      TEXT REFERENCES orders(id),
  direction     TEXT NOT NULL,             -- 'inbound' | 'outbound'
  sender        TEXT NOT NULL,
  body          TEXT NOT NULL,
  sent_at       TEXT NOT NULL DEFAULT (datetime('now')),
  replied       INTEGER NOT NULL DEFAULT 0
);

-- ─── Deliverables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverables (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  file_path     TEXT NOT NULL,             -- absolute path on disk
  file_type     TEXT NOT NULL,             -- 'text' | 'image' | 'zip' | 'pdf'
  version       INTEGER NOT NULL DEFAULT 1,
  is_final      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Drafts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drafts (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  content       TEXT NOT NULL,             -- raw generated content or file path
  model_used    TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── QA Scores ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_scores (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  draft_id      TEXT NOT NULL REFERENCES drafts(id),
  pass_number   INTEGER NOT NULL,          -- 1 or 2
  score         INTEGER NOT NULL,          -- 1-10
  feedback      TEXT NOT NULL,
  passed        INTEGER NOT NULL DEFAULT 0,
  scored_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Reviews (Claude final) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  draft_id      TEXT NOT NULL REFERENCES drafts(id),
  approved      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  reviewed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Ledger (treasury) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger (
  id            TEXT PRIMARY KEY,
  order_id      TEXT REFERENCES orders(id),
  type          TEXT NOT NULL,             -- 'income' | 'refund' | 'withdrawal' | 'fee'
  amount_gbp    REAL NOT NULL,
  description   TEXT NOT NULL,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Errors ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errors (
  id            TEXT PRIMARY KEY,
  module        TEXT NOT NULL,
  job_id        TEXT,
  order_id      TEXT,
  message       TEXT NOT NULL,
  stack         TEXT,
  recovered     INTEGER NOT NULL DEFAULT 0,
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Job History ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_history (
  id            TEXT PRIMARY KEY,          -- BullMQ job ID
  job_name      TEXT NOT NULL,
  data          TEXT NOT NULL,             -- JSON
  status        TEXT NOT NULL DEFAULT 'pending',
                                           -- pending | active | completed | failed | dead
  attempt       INTEGER NOT NULL DEFAULT 0,
  result        TEXT,
  error         TEXT,
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Discord Inbox ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discord_inbox (
  id            TEXT PRIMARY KEY,
  message_id    TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  username      TEXT NOT NULL,
  command       TEXT NOT NULL,
  args          TEXT,
  processed     INTEGER NOT NULL DEFAULT 0,
  received_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Screenshots ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screenshots (
  id            TEXT PRIMARY KEY,
  job_id        TEXT,
  order_id      TEXT,
  file_path     TEXT NOT NULL,
  label         TEXT,
  taken_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Claude Usage ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claude_usage (
  id            TEXT PRIMARY KEY,
  order_id      TEXT,
  purpose       TEXT NOT NULL,             -- 'qa' | 'review' | 'clarify' | 'edge_case'
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  used_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_platform   ON orders(platform);
CREATE INDEX IF NOT EXISTS idx_messages_order    ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_order ON deliverables(order_id);
CREATE INDEX IF NOT EXISTS idx_drafts_order      ON drafts(order_id);
CREATE INDEX IF NOT EXISTS idx_qa_scores_order   ON qa_scores(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type       ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_job_history_name  ON job_history(job_name);
CREATE INDEX IF NOT EXISTS idx_job_history_status ON job_history(status);
CREATE INDEX IF NOT EXISTS idx_claude_usage_date ON claude_usage(used_at);

-- ─── Triggers (auto-update updated_at) ───────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS orders_updated_at
  AFTER UPDATE ON orders
  BEGIN
    UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
  END;
