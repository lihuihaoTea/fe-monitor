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
    max: Number(process.env.PG_POOL_MAX) || 20,
    idleTimeoutMillis: 30000,
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
    -- 看板 / 列表高频：app + type + 时间
    CREATE INDEX IF NOT EXISTS idx_events_app_type_ts
      ON events(app_id, type, timestamp);
    -- 带 sub_type 的过滤（js/promise、pv/stay、fcp/lcp 等）
    CREATE INDEX IF NOT EXISTS idx_events_app_type_subtype_ts
      ON events(app_id, type, sub_type, timestamp);

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

    -- 日聚合：看板 stats 只读这些表
    CREATE TABLE IF NOT EXISTS event_daily_stats (
      app_id TEXT NOT NULL,
      date DATE NOT NULL,
      js_errors INT NOT NULL DEFAULT 0,
      resource_errors INT NOT NULL DEFAULT 0,
      api_errors INT NOT NULL DEFAULT 0,
      blank_screens INT NOT NULL DEFAULT 0,
      not_found_404 INT NOT NULL DEFAULT 0,
      other_issues INT NOT NULL DEFAULT 0,
      pv INT NOT NULL DEFAULT 0,
      clicks INT NOT NULL DEFAULT 0,
      stay_duration_sum BIGINT NOT NULL DEFAULT 0,
      stay_count INT NOT NULL DEFAULT 0,
      fcp_sum BIGINT NOT NULL DEFAULT 0,
      fcp_count INT NOT NULL DEFAULT 0,
      lcp_sum BIGINT NOT NULL DEFAULT 0,
      lcp_count INT NOT NULL DEFAULT 0,
      load_sum BIGINT NOT NULL DEFAULT 0,
      load_count INT NOT NULL DEFAULT 0,
      dom_ready_sum BIGINT NOT NULL DEFAULT 0,
      dom_ready_count INT NOT NULL DEFAULT 0,
      PRIMARY KEY (app_id, date)
    );

    CREATE TABLE IF NOT EXISTS event_daily_error_types (
      app_id TEXT NOT NULL,
      date DATE NOT NULL,
      sub_type TEXT NOT NULL,
      count INT NOT NULL DEFAULT 0,
      PRIMARY KEY (app_id, date, sub_type)
    );

    CREATE TABLE IF NOT EXISTS event_daily_visitors (
      app_id TEXT NOT NULL,
      date DATE NOT NULL,
      visitor_id TEXT NOT NULL,
      PRIMARY KEY (app_id, date, visitor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_stats_date
      ON event_daily_stats(date);
    CREATE INDEX IF NOT EXISTS idx_daily_visitors_app_date
      ON event_daily_visitors(app_id, date);
  `);
    await seedDefaultFilters();
    // 已有明细但无日聚合时自动回填一次
    const dailyCount = await queryOne(`SELECT COUNT(*)::int as count FROM event_daily_stats`);
    const eventCount = await queryOne(`SELECT COUNT(*)::int as count FROM events`);
    if (Number(dailyCount?.count) === 0 && Number(eventCount?.count) > 0) {
        console.log('检测到历史 events，开始重建日聚合…');
        const { rebuildDailyStats } = await import('./dailyStats.js');
        await rebuildDailyStats();
        console.log('日聚合重建完成');
    }
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