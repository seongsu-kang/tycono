/**
 * Database Service — SQLite for operational data
 *
 * Stores: sessions, messages, waves, wave_messages, activity_events, cost
 * NOT stored: knowledge/, CLAUDE.md, role.yaml, skills/ (stay as files for AI grep + git diff)
 *
 * Location: .tycono/tycono.db (single file, no server)
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { COMPANY_ROOT } from './file-reader.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbDir = path.join(COMPANY_ROOT, '.tycono');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'tycono.db');
  db = new Database(dbPath);

  // Performance: WAL mode for concurrent reads during writes
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- ── Wave Messages (CEO↔Supervisor conversation history) ──
    CREATE TABLE IF NOT EXISTS wave_message (
      seq          INTEGER NOT NULL,
      wave_id      TEXT    NOT NULL,
      role         TEXT    NOT NULL CHECK (role IN ('user', 'assistant', 'summary')),
      content      TEXT    NOT NULL,
      ts           TEXT    NOT NULL,
      execution_id TEXT,
      metadata     TEXT,
      summarizes_start_seq INTEGER,
      summarizes_end_seq   INTEGER,
      PRIMARY KEY (wave_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_wave_message_wave ON wave_message(wave_id);

    -- ── Activity Events (execution event log) ──
    CREATE TABLE IF NOT EXISTS activity_event (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT    NOT NULL,
      seq          INTEGER NOT NULL,
      ts           TEXT    NOT NULL,
      type         TEXT    NOT NULL,
      role_id      TEXT    NOT NULL,
      trace_id     TEXT,
      parent_session_id TEXT,
      data         TEXT    NOT NULL DEFAULT '{}',
      UNIQUE(session_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_event(session_id);
    CREATE INDEX IF NOT EXISTS idx_activity_session_seq ON activity_event(session_id, seq);
  `);
}
