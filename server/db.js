"use strict";
/* Database SQLite memakai modul bawaan Node (node:sqlite), tanpa dependency. */
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nama          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  pw_changed_at  INTEGER NOT NULL DEFAULT 0   -- epoch detik; sesi lebih lama dari ini tidak berlaku
);

CREATE TABLE IF NOT EXISTS email_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('verify','reset')),
  token_hash TEXT    NOT NULL UNIQUE,   -- SHA-256 dari token; token asli hanya ada di email
  created_at INTEGER NOT NULL,          -- epoch ms
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS questions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt    TEXT    NOT NULL,
  options   TEXT    NOT NULL,           -- JSON array
  correct   TEXT    NOT NULL,
  explain   TEXT    NOT NULL DEFAULT '',
  kind      TEXT    NOT NULL DEFAULT 'manual',  -- static | dynamic | manual
  active    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (prompt)
);

CREATE TABLE IF NOT EXISTS attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_ids TEXT    NOT NULL,        -- JSON array
  status       TEXT    NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','finished')),
  score        INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER NOT NULL,        -- epoch ms
  finished_at  INTEGER,
  duration_ms  INTEGER
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id  INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  answer      TEXT    NOT NULL,
  is_correct  INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_user   ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
`);

/* Migrasi untuk database versi 1 (tanpa kolom verifikasi): akun lama dianggap
   sudah terverifikasi supaya tidak terkunci. */
const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!cols.includes("email_verified")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE users SET email_verified = 1");
}
if (!cols.includes("pw_changed_at")) {
  db.exec("ALTER TABLE users ADD COLUMN pw_changed_at INTEGER NOT NULL DEFAULT 0");
}

module.exports = db;
