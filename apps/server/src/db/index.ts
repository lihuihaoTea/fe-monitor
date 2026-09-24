import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/monitor.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

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

    CREATE TABLE IF NOT EXISTS event_filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      match_type TEXT NOT NULL,
      match_value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(event_type, match_type, match_value)
    );

    CREATE INDEX IF NOT EXISTS idx_event_filters_enabled ON event_filters(enabled);
  `);

  seedDefaultFilters();
  console.log('Database initialized successfully');
}

/** 首次初始化写入默认筛除项（已存在则跳过） */
function seedDefaultFilters() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO event_filters
      (event_type, match_type, match_value, enabled, note, created_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `);
  const now = Date.now();
  const defaults: Array<[string, string, string, string]> = [
    ['api', 'host', 'i.clarity.ms', 'Microsoft Clarity 上报'],
    ['resource', 'url_prefix', 'https://p26.douyinpic.com', '抖音图片 CDN'],
  ];
  for (const [eventType, matchType, matchValue, note] of defaults) {
    insert.run(eventType, matchType, matchValue, note, now);
  }
}
