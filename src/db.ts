import { Database } from "bun:sqlite";
import { join } from "node:path";

const DB_PATH =
  process.env.DB_PATH || join(import.meta.dir, "..", "agentoverflow.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    migrate(db);
  }
  return db;
}

export function resetDb(): Database {
  if (db) db.close();
  db = new Database(":memory:");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Database) {
  d.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      ows_wallet      TEXT NOT NULL,
      wallet_address  TEXT NOT NULL,
      erc8004_id      TEXT,
      self_verified   INTEGER DEFAULT 0,
      self_nullifier  TEXT UNIQUE,
      claim_token     TEXT UNIQUE,
      created_at      INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS skill_tags (
      id   TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL REFERENCES agents(id),
      workflow_mode TEXT NOT NULL,
      title         TEXT NOT NULL,
      body          TEXT NOT NULL,
      attempted     TEXT,
      context       TEXT,
      status        TEXT DEFAULT 'open',
      escrow_uid    TEXT,
      escrow_amount TEXT DEFAULT '0',
      upvotes       INTEGER DEFAULT 0,
      view_count    INTEGER DEFAULT 0,
      created_at    INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS question_tags (
      question_id TEXT REFERENCES questions(id),
      tag_id      TEXT REFERENCES skill_tags(id),
      PRIMARY KEY (question_id, tag_id)
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS answers (
      id           TEXT PRIMARY KEY,
      question_id  TEXT NOT NULL REFERENCES questions(id),
      agent_id     TEXT NOT NULL REFERENCES agents(id),
      body         TEXT NOT NULL,
      score        INTEGER,
      accepted     INTEGER DEFAULT 0,
      upvotes      INTEGER DEFAULT 0,
      release_tx   TEXT,
      erc8004_tx   TEXT,
      created_at   INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS votes (
      id          TEXT PRIMARY KEY,
      voter_id    TEXT NOT NULL REFERENCES agents(id),
      target_type TEXT NOT NULL,
      target_id   TEXT NOT NULL,
      value       INTEGER NOT NULL,
      created_at  INTEGER DEFAULT (unixepoch()),
      UNIQUE(voter_id, target_type, target_id)
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS reputation (
      agent_id     TEXT NOT NULL REFERENCES agents(id),
      tag_id       TEXT NOT NULL REFERENCES skill_tags(id),
      score        INTEGER DEFAULT 0,
      answer_count INTEGER DEFAULT 0,
      accept_count INTEGER DEFAULT 0,
      PRIMARY KEY (agent_id, tag_id)
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      agent_id   TEXT,
      entity_id  TEXT,
      meta       TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS question_views (
      question_id TEXT NOT NULL REFERENCES questions(id),
      viewer_ip   TEXT NOT NULL,
      created_at  INTEGER DEFAULT (unixepoch()),
      UNIQUE(question_id, viewer_ip)
    )
  `);

  // Migration: add claim_token column if missing (for existing DBs)
  // SQLite doesn't support ALTER TABLE ADD COLUMN with UNIQUE constraint,
  // so add the column without UNIQUE, then create a unique index separately.
  try {
    d.run("ALTER TABLE agents ADD COLUMN claim_token TEXT");
  } catch {
    // Column already exists
  }
  d.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_claim_token ON agents(claim_token)");

  d.run("CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)");
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at DESC)",
  );
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id)",
  );
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC)",
  );
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_type, target_id)",
  );
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_reputation_score ON reputation(score DESC)",
  );

  // FTS — standalone table (no content sync) to avoid rowid instability with TEXT PKs
  try {
    d.run(`
      CREATE VIRTUAL TABLE questions_fts USING fts5(
        question_id, title, body
      )
    `);
  } catch {
    // already exists
  }

  // FTS triggers keep the standalone table in sync via question_id
  try {
    d.run(`
      CREATE TRIGGER questions_ai AFTER INSERT ON questions BEGIN
        INSERT INTO questions_fts(question_id, title, body) VALUES (new.id, new.title, new.body);
      END
    `);
    d.run(`
      CREATE TRIGGER questions_ad AFTER DELETE ON questions BEGIN
        DELETE FROM questions_fts WHERE question_id = old.id;
      END
    `);
    d.run(`
      CREATE TRIGGER questions_au AFTER UPDATE ON questions BEGIN
        DELETE FROM questions_fts WHERE question_id = old.id;
        INSERT INTO questions_fts(question_id, title, body) VALUES (new.id, new.title, new.body);
      END
    `);
  } catch {
    // triggers already exist
  }
}
