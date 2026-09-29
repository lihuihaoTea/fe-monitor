import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 加载 apps/server/.env（脚本与服务共用）
dotenv.config({ path: path.join(__dirname, '../../.env') });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (e.g. postgresql://monitor:monitor@localhost:5432/fe_monitor)');
}
export const pool = new Pool({
    connectionString: databaseUrl,
});
pool.on('error', (err) => {
    console.error('[pg] unexpected error on idle client', err);
});
/** 将 SQL 中的 `?` 依次替换为 `$1`, `$2`, ... */
export function pgPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}
export async function query(sql, params = []) {
    const result = await pool.query(pgPlaceholders(sql), params);
    return result.rows;
}
export async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
}
export async function execute(sql, params = []) {
    const result = await pool.query(pgPlaceholders(sql), params);
    return result.rowCount ?? 0;
}
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
/** 在事务客户端上执行带 `?` 占位符的 SQL */
export async function clientQuery(client, sql, params = []) {
    const result = await client.query(pgPlaceholders(sql), params);
    return result.rows;
}
export async function initDB() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      sub_type TEXT,
      timestamp BIGINT NOT NULL,
      app_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      url TEXT NOT NULL,
      user_agent TEXT,
      client_ip TEXT,
      data JSONB,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_app_id ON events(app_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_visitor_id ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_app_ts ON events(app_id, timestamp);

    CREATE TABLE IF NOT EXISTS event_filters (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      match_type TEXT NOT NULL,
      match_value TEXT NOT NULL,
      enabled SMALLINT NOT NULL DEFAULT 1,
      note TEXT,
      created_at BIGINT NOT NULL,
      UNIQUE(event_type, match_type, match_value)
    );

    CREATE INDEX IF NOT EXISTS idx_event_filters_enabled ON event_filters(enabled);
  `);
    await seedDefaultFilters();
    console.log('Database initialized successfully');
}
/** 首次初始化写入默认筛除项（已存在则跳过） */
async function seedDefaultFilters() {
    const now = Date.now();
    const defaults = [
        ['api', 'host', 'i.clarity.ms', 'Microsoft Clarity 上报'],
        ['resource', 'url_prefix', 'https://p26.douyinpic.com', '抖音图片 CDN'],
    ];
    for (const [eventType, matchType, matchValue, note] of defaults) {
        await execute(`INSERT INTO event_filters
        (event_type, match_type, match_value, enabled, note, created_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT (event_type, match_type, match_value) DO NOTHING`, [eventType, matchType, matchValue, note, now]);
    }
}
export async function closeDB() {
    await pool.end();
}
//# sourceMappingURL=index.js.map