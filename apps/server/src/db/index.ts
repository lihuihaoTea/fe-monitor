import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 apps/server/.env（脚本与服务共用）
dotenv.config({ path: path.join(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required (e.g. postgresql://monitor:monitor@localhost:5432/fe_monitor)'
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[pg] unexpected error on idle client', err);
});

/** 将 SQL 中的 `?` 依次替换为 `$1`, `$2`, ... */
export function pgPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(pgPlaceholders(sql), params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<number> {
  const result = await pool.query(pgPlaceholders(sql), params);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** 在事务客户端上执行带 `?` 占位符的 SQL */
export async function clientQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await client.query<T>(pgPlaceholders(sql), params);
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
      fcp_min BIGINT,
      fcp_max BIGINT,
      lcp_sum BIGINT NOT NULL DEFAULT 0,
      lcp_count INT NOT NULL DEFAULT 0,
      lcp_min BIGINT,
      lcp_max BIGINT,
      load_sum BIGINT NOT NULL DEFAULT 0,
      load_count INT NOT NULL DEFAULT 0,
      load_min BIGINT,
      load_max BIGINT,
      dom_ready_sum BIGINT NOT NULL DEFAULT 0,
      dom_ready_count INT NOT NULL DEFAULT 0,
      dom_ready_min BIGINT,
      dom_ready_max BIGINT,
      PRIMARY KEY (app_id, date)
    );

    -- 兼容旧库：补齐 min/max 列
    ALTER TABLE event_daily_stats
      ADD COLUMN IF NOT EXISTS fcp_min BIGINT,
      ADD COLUMN IF NOT EXISTS fcp_max BIGINT,
      ADD COLUMN IF NOT EXISTS lcp_min BIGINT,
      ADD COLUMN IF NOT EXISTS lcp_max BIGINT,
      ADD COLUMN IF NOT EXISTS load_min BIGINT,
      ADD COLUMN IF NOT EXISTS load_max BIGINT,
      ADD COLUMN IF NOT EXISTS dom_ready_min BIGINT,
      ADD COLUMN IF NOT EXISTS dom_ready_max BIGINT;

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

    -- 性能小时聚合（一天内按小时趋势）
    CREATE TABLE IF NOT EXISTS event_hourly_perf (
      app_id TEXT NOT NULL,
      hour_start TIMESTAMP NOT NULL,
      metric TEXT NOT NULL,
      value_sum BIGINT NOT NULL DEFAULT 0,
      value_count INT NOT NULL DEFAULT 0,
      value_min BIGINT,
      value_max BIGINT,
      PRIMARY KEY (app_id, hour_start, metric)
    );

    -- 性能按 URL 日聚合（Top N 下钻）
    CREATE TABLE IF NOT EXISTS event_daily_perf_urls (
      app_id TEXT NOT NULL,
      date DATE NOT NULL,
      metric TEXT NOT NULL,
      url TEXT NOT NULL,
      value_sum BIGINT NOT NULL DEFAULT 0,
      value_count INT NOT NULL DEFAULT 0,
      value_min BIGINT,
      value_max BIGINT,
      PRIMARY KEY (app_id, date, metric, url)
    );

    -- 行为：按 URL 日 PV（Top10 / 最低页）
    CREATE TABLE IF NOT EXISTS event_daily_pv_urls (
      app_id TEXT NOT NULL,
      date DATE NOT NULL,
      url TEXT NOT NULL,
      pv INT NOT NULL DEFAULT 0,
      PRIMARY KEY (app_id, date, url)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_stats_date
      ON event_daily_stats(date);
    CREATE INDEX IF NOT EXISTS idx_daily_visitors_app_date
      ON event_daily_visitors(app_id, date);
    CREATE INDEX IF NOT EXISTS idx_hourly_perf_app_hour
      ON event_hourly_perf(app_id, hour_start);
    CREATE INDEX IF NOT EXISTS idx_daily_perf_urls_lookup
      ON event_daily_perf_urls(app_id, date, metric);
    CREATE INDEX IF NOT EXISTS idx_daily_pv_urls_lookup
      ON event_daily_pv_urls(app_id, date);
  `);

  await seedDefaultFilters();

  // 已有明细但缺关键聚合时自动回填
  const dailyCount = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_daily_stats`
  );
  const hourlyCount = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_hourly_perf`
  );
  const pvUrlCount = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_daily_pv_urls`
  );
  const eventCount = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM events`
  );
  const needRebuild =
    Number(eventCount?.count) > 0 &&
    (Number(dailyCount?.count) === 0 ||
      Number(hourlyCount?.count) === 0 ||
      Number(pvUrlCount?.count) === 0);
  if (needRebuild) {
    console.log('检测到历史 events 或缺聚合，开始重建…');
    const { rebuildDailyStats } = await import('./dailyStats.js');
    await rebuildDailyStats();
    console.log('聚合重建完成');
  }

  console.log('Database initialized successfully');
}

/** 首次初始化写入默认筛除项（已存在则跳过） */
async function seedDefaultFilters() {
  const now = Date.now();
  const defaults: Array<[string, string, string, string]> = [
    ['api', 'host', 'i.clarity.ms', 'Microsoft Clarity 上报'],
    ['resource', 'url_prefix', 'https://p26.douyinpic.com', '抖音图片 CDN'],
  ];

  for (const [eventType, matchType, matchValue, note] of defaults) {
    await execute(
      `INSERT INTO event_filters
        (event_type, match_type, match_value, enabled, note, created_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT (event_type, match_type, match_value) DO NOTHING`,
      [eventType, matchType, matchValue, note, now]
    );
  }
}

export async function closeDB() {
  await pool.end();
}
