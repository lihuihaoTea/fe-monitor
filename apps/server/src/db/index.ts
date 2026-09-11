import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/monitor.db');

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      sub_type TEXT,
      timestamp INTEGER NOT NULL,
      app_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      url TEXT NOT NULL,
      user_agent TEXT,
      client_ip TEXT,
      data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_app_id ON events(app_id);
    CREATE INDEX IF NOT EXISTS idx_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_visitor_id ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
  `);

  console.log('Database initialized successfully');
}
