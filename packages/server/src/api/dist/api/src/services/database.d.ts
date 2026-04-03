/**
 * Database Service — SQLite for operational data
 *
 * Stores: sessions, messages, waves, wave_messages, activity_events, cost
 * NOT stored: knowledge/, CLAUDE.md, role.yaml, skills/ (stay as files for AI grep + git diff)
 *
 * Location: .tycono/tycono.db (single file, no server)
 */
import Database from 'better-sqlite3';
export declare function getDb(): Database.Database;
export declare function closeDb(): void;
