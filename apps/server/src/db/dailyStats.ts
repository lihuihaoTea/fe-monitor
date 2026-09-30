import type { PoolClient } from 'pg';
import { clientQuery, withTransaction } from './index.js';

/** 与 Node 进程本地时区一致的 YYYY-MM-DD */
export function dayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地整点：YYYY-MM-DD HH:00:00 */
export function hourKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:00:00`;
}

export type PerfMetric = 'fcp' | 'lcp' | 'load' | 'dom_ready';

export type RollupEvent = {
  type: string;
  subType: string | null;
  timestamp: number;
  appId: string;
  visitorId: string;
  url?: string | null;
  data: Record<string, unknown> | null;
};

type DailyDelta = {
  jsErrors: number;
  resourceErrors: number;
  apiErrors: number;
  blankScreens: number;
  notFound404: number;
  otherIssues: number;
  pv: number;
  clicks: number;
  stayDurationSum: number;
  stayCount: number;
  fcpSum: number;
  fcpCount: number;
  fcpMin: number | null;
  fcpMax: number | null;
  lcpSum: number;
  lcpCount: number;
  lcpMin: number | null;
  lcpMax: number | null;
  loadSum: number;
  loadCount: number;
  loadMin: number | null;
  loadMax: number | null;
  domReadySum: number;
  domReadyCount: number;
  domReadyMin: number | null;
  domReadyMax: number | null;
};

function emptyDelta(): DailyDelta {
  return {
    jsErrors: 0,
    resourceErrors: 0,
    apiErrors: 0,
    blankScreens: 0,
    notFound404: 0,
    otherIssues: 0,
    pv: 0,
    clicks: 0,
    stayDurationSum: 0,
    stayCount: 0,
    fcpSum: 0,
    fcpCount: 0,
    fcpMin: null,
    fcpMax: null,
    lcpSum: 0,
    lcpCount: 0,
    lcpMin: null,
    lcpMax: null,
    loadSum: 0,
    loadCount: 0,
    loadMin: null,
    loadMax: null,
    domReadySum: 0,
    domReadyCount: 0,
    domReadyMin: null,
    domReadyMax: null,
  };
}

function parseData(data: RollupEvent['data']): Record<string, unknown> {
  if (!data) return {};
  if (typeof data === 'object') return data;
  return {};
}

/** 去掉 query/hash，限制长度，降低 URL 基数（性能 / PV 共用） */
export function normalizePageUrl(raw: string | null | undefined): string {
  const input = (raw || '').trim();
  if (!input) return '(empty)';
  let normalized = input;
  try {
    const u = new URL(input);
    normalized = `${u.origin}${u.pathname}`;
  } catch {
    normalized = input.split(/[?#]/)[0] || input;
  }
  if (normalized.length > 500) normalized = normalized.slice(0, 500);
  return normalized || '(empty)';
}

/** @deprecated 使用 normalizePageUrl */
export const normalizePerfUrl = normalizePageUrl;

export function extractPerfSamples(
  event: RollupEvent
): Array<{ metric: PerfMetric; value: number }> {
  if (event.type !== 'performance') return [];
  const data = parseData(event.data);
  const sub = event.subType || '';
  const samples: Array<{ metric: PerfMetric; value: number }> = [];
  const value = Number(data.value);

  if (sub === 'fcp' && Number.isFinite(value)) {
    samples.push({ metric: 'fcp', value: Math.round(value) });
  } else if (sub === 'lcp' && Number.isFinite(value)) {
    samples.push({ metric: 'lcp', value: Math.round(value) });
  } else if (sub === 'load' && Number.isFinite(value)) {
    samples.push({ metric: 'load', value: Math.round(value) });
    const domReady = Number(data.domReady);
    if (Number.isFinite(domReady)) {
      samples.push({ metric: 'dom_ready', value: Math.round(domReady) });
    }
  }
  return samples;
}

/** 单条事件 → 日聚合增量 */
export function buildDailyDelta(event: RollupEvent): {
  delta: DailyDelta;
  errorSubType: string | null;
  trackVisitor: boolean;
} {
  const delta = emptyDelta();
  const data = parseData(event.data);
  const sub = event.subType || '';
  let errorSubType: string | null = null;
  let trackVisitor = false;

  if (event.type === 'error') {
    if (sub === 'js' || sub === 'promise') {
      delta.jsErrors = 1;
      errorSubType = sub;
    } else {
      delta.otherIssues = 1;
      if (sub === '404' || String(data.message) === '404') {
        delta.notFound404 = 1;
      }
      errorSubType = sub || 'manual';
    }
  } else if (event.type === 'resource') {
    delta.resourceErrors = 1;
  } else if (event.type === 'api') {
    delta.apiErrors = 1;
  } else if (event.type === 'blank') {
    delta.blankScreens = 1;
  } else if (event.type === 'behavior') {
    if (sub === 'pv') {
      delta.pv = 1;
      trackVisitor = true;
    } else if (sub === 'stay') {
      const duration = Number(data.duration);
      const clicks = Number(data.clickCount);
      if (Number.isFinite(duration) && duration > 0) {
        delta.stayDurationSum = Math.round(duration);
        delta.stayCount = 1;
      }
      if (Number.isFinite(clicks) && clicks > 0) {
        delta.clicks = Math.round(clicks);
      }
    }
  } else if (event.type === 'performance') {
    for (const sample of extractPerfSamples(event)) {
      if (sample.metric === 'fcp') {
        delta.fcpSum = sample.value;
        delta.fcpCount = 1;
        delta.fcpMin = sample.value;
        delta.fcpMax = sample.value;
      } else if (sample.metric === 'lcp') {
        delta.lcpSum = sample.value;
        delta.lcpCount = 1;
        delta.lcpMin = sample.value;
        delta.lcpMax = sample.value;
      } else if (sample.metric === 'load') {
        delta.loadSum = sample.value;
        delta.loadCount = 1;
        delta.loadMin = sample.value;
        delta.loadMax = sample.value;
      } else if (sample.metric === 'dom_ready') {
        delta.domReadySum = sample.value;
        delta.domReadyCount = 1;
        delta.domReadyMin = sample.value;
        delta.domReadyMax = sample.value;
      }
    }
  }

  return { delta, errorSubType, trackVisitor };
}

async function upsertHourlyAndUrl(
  client: PoolClient,
  event: RollupEvent
) {
  const samples = extractPerfSamples(event);
  if (samples.length === 0) return;

  const date = dayKeyFromMs(event.timestamp);
  const hour = hourKeyFromMs(event.timestamp);
  const url = normalizePerfUrl(event.url);

  for (const { metric, value } of samples) {
    await clientQuery(
      client,
      `INSERT INTO event_hourly_perf AS h (
         app_id, hour_start, metric, value_sum, value_count, value_min, value_max
       ) VALUES (?, ?::timestamp, ?, ?, 1, ?, ?)
       ON CONFLICT (app_id, hour_start, metric) DO UPDATE SET
         value_sum = h.value_sum + EXCLUDED.value_sum,
         value_count = h.value_count + EXCLUDED.value_count,
         value_min = LEAST(h.value_min, EXCLUDED.value_min),
         value_max = GREATEST(h.value_max, EXCLUDED.value_max)`,
      [event.appId, hour, metric, value, value, value]
    );

    await clientQuery(
      client,
      `INSERT INTO event_daily_perf_urls AS u (
         app_id, date, metric, url, value_sum, value_count, value_min, value_max
       ) VALUES (?, ?::date, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (app_id, date, metric, url) DO UPDATE SET
         value_sum = u.value_sum + EXCLUDED.value_sum,
         value_count = u.value_count + EXCLUDED.value_count,
         value_min = LEAST(u.value_min, EXCLUDED.value_min),
         value_max = GREATEST(u.value_max, EXCLUDED.value_max)`,
      [event.appId, date, metric, url, value, value, value]
    );
  }
}

export async function applyRollupWithClient(
  client: PoolClient,
  event: RollupEvent
) {
  const date = dayKeyFromMs(event.timestamp);
  const { delta, errorSubType, trackVisitor } = buildDailyDelta(event);

  await clientQuery(
    client,
    `INSERT INTO event_daily_stats AS s (
       app_id, date,
       js_errors, resource_errors, api_errors, blank_screens,
       not_found_404, other_issues, pv, clicks,
       stay_duration_sum, stay_count,
       fcp_sum, fcp_count, fcp_min, fcp_max,
       lcp_sum, lcp_count, lcp_min, lcp_max,
       load_sum, load_count, load_min, load_max,
       dom_ready_sum, dom_ready_count, dom_ready_min, dom_ready_max
     ) VALUES (
       ?, ?::date,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?
     )
     ON CONFLICT (app_id, date) DO UPDATE SET
       js_errors = s.js_errors + EXCLUDED.js_errors,
       resource_errors = s.resource_errors + EXCLUDED.resource_errors,
       api_errors = s.api_errors + EXCLUDED.api_errors,
       blank_screens = s.blank_screens + EXCLUDED.blank_screens,
       not_found_404 = s.not_found_404 + EXCLUDED.not_found_404,
       other_issues = s.other_issues + EXCLUDED.other_issues,
       pv = s.pv + EXCLUDED.pv,
       clicks = s.clicks + EXCLUDED.clicks,
       stay_duration_sum = s.stay_duration_sum + EXCLUDED.stay_duration_sum,
       stay_count = s.stay_count + EXCLUDED.stay_count,
       fcp_sum = s.fcp_sum + EXCLUDED.fcp_sum,
       fcp_count = s.fcp_count + EXCLUDED.fcp_count,
       fcp_min = CASE WHEN EXCLUDED.fcp_count > 0
         THEN LEAST(s.fcp_min, EXCLUDED.fcp_min) ELSE s.fcp_min END,
       fcp_max = CASE WHEN EXCLUDED.fcp_count > 0
         THEN GREATEST(s.fcp_max, EXCLUDED.fcp_max) ELSE s.fcp_max END,
       lcp_sum = s.lcp_sum + EXCLUDED.lcp_sum,
       lcp_count = s.lcp_count + EXCLUDED.lcp_count,
       lcp_min = CASE WHEN EXCLUDED.lcp_count > 0
         THEN LEAST(s.lcp_min, EXCLUDED.lcp_min) ELSE s.lcp_min END,
       lcp_max = CASE WHEN EXCLUDED.lcp_count > 0
         THEN GREATEST(s.lcp_max, EXCLUDED.lcp_max) ELSE s.lcp_max END,
       load_sum = s.load_sum + EXCLUDED.load_sum,
       load_count = s.load_count + EXCLUDED.load_count,
       load_min = CASE WHEN EXCLUDED.load_count > 0
         THEN LEAST(s.load_min, EXCLUDED.load_min) ELSE s.load_min END,
       load_max = CASE WHEN EXCLUDED.load_count > 0
         THEN GREATEST(s.load_max, EXCLUDED.load_max) ELSE s.load_max END,
       dom_ready_sum = s.dom_ready_sum + EXCLUDED.dom_ready_sum,
       dom_ready_count = s.dom_ready_count + EXCLUDED.dom_ready_count,
       dom_ready_min = CASE WHEN EXCLUDED.dom_ready_count > 0
         THEN LEAST(s.dom_ready_min, EXCLUDED.dom_ready_min) ELSE s.dom_ready_min END,
       dom_ready_max = CASE WHEN EXCLUDED.dom_ready_count > 0
         THEN GREATEST(s.dom_ready_max, EXCLUDED.dom_ready_max) ELSE s.dom_ready_max END`,
    [
      event.appId,
      date,
      delta.jsErrors,
      delta.resourceErrors,
      delta.apiErrors,
      delta.blankScreens,
      delta.notFound404,
      delta.otherIssues,
      delta.pv,
      delta.clicks,
      delta.stayDurationSum,
      delta.stayCount,
      delta.fcpSum,
      delta.fcpCount,
      delta.fcpMin,
      delta.fcpMax,
      delta.lcpSum,
      delta.lcpCount,
      delta.lcpMin,
      delta.lcpMax,
      delta.loadSum,
      delta.loadCount,
      delta.loadMin,
      delta.loadMax,
      delta.domReadySum,
      delta.domReadyCount,
      delta.domReadyMin,
      delta.domReadyMax,
    ]
  );

  if (errorSubType) {
    await clientQuery(
      client,
      `INSERT INTO event_daily_error_types (app_id, date, sub_type, count)
       VALUES (?, ?::date, ?, 1)
       ON CONFLICT (app_id, date, sub_type) DO UPDATE SET
         count = event_daily_error_types.count + 1`,
      [event.appId, date, errorSubType]
    );
  }

  if (trackVisitor && event.visitorId) {
    await clientQuery(
      client,
      `INSERT INTO event_daily_visitors (app_id, date, visitor_id)
       VALUES (?, ?::date, ?)
       ON CONFLICT DO NOTHING`,
      [event.appId, date, event.visitorId]
    );
  }

  if (delta.pv > 0) {
    const url = normalizePerfUrl(event.url);
    await clientQuery(
      client,
      `INSERT INTO event_daily_pv_urls AS u (app_id, date, url, pv)
       VALUES (?, ?::date, ?, ?)
       ON CONFLICT (app_id, date, url) DO UPDATE SET
         pv = u.pv + EXCLUDED.pv`,
      [event.appId, date, url, delta.pv]
    );
  }

  await upsertHourlyAndUrl(client, event);
}

/** 从 events 全量重建日/小时/URL 聚合 */
export async function rebuildDailyStats(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`
      LOCK TABLE
        event_daily_stats,
        event_daily_error_types,
        event_daily_visitors,
        event_hourly_perf,
        event_daily_perf_urls,
        event_daily_pv_urls
      IN ACCESS EXCLUSIVE MODE
    `);
    await client.query(`
      TRUNCATE
        event_daily_stats,
        event_daily_error_types,
        event_daily_visitors,
        event_hourly_perf,
        event_daily_perf_urls,
        event_daily_pv_urls
    `);

    await clientQuery(
      client,
      `
      INSERT INTO event_daily_stats (
        app_id, date,
        js_errors, resource_errors, api_errors, blank_screens,
        not_found_404, other_issues, pv, clicks,
        stay_duration_sum, stay_count,
        fcp_sum, fcp_count, fcp_min, fcp_max,
        lcp_sum, lcp_count, lcp_min, lcp_max,
        load_sum, load_count, load_min, load_max,
        dom_ready_sum, dom_ready_count, dom_ready_min, dom_ready_max
      )
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date as date,
        COUNT(*) FILTER (WHERE type = 'error' AND sub_type IN ('js', 'promise'))::int,
        COUNT(*) FILTER (WHERE type = 'resource')::int,
        COUNT(*) FILTER (WHERE type = 'api')::int,
        COUNT(*) FILTER (WHERE type = 'blank')::int,
        COUNT(*) FILTER (
          WHERE type = 'error' AND (
            sub_type = '404' OR (data->>'message') = '404'
          )
        )::int,
        COUNT(*) FILTER (
          WHERE type = 'error' AND (
            sub_type IS NULL OR sub_type NOT IN ('js', 'promise')
          )
        )::int,
        COUNT(*) FILTER (WHERE type = 'behavior' AND sub_type = 'pv')::int,
        COALESCE(SUM(CASE WHEN type = 'behavior' AND sub_type = 'stay'
          THEN (data->>'clickCount')::int ELSE 0 END), 0)::int,
        COALESCE(SUM(CASE WHEN type = 'behavior' AND sub_type = 'stay'
          THEN (data->>'duration')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'behavior' AND sub_type = 'stay'
          AND (data->>'duration') IS NOT NULL)::int,
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'fcp'
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'fcp')::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'fcp'),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'fcp'),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'lcp'
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'lcp')::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'lcp'),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'lcp'),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load')::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'load'),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'load'),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
          THEN (data->>'domReady')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load'
          AND data->>'domReady' IS NOT NULL)::int,
        MIN((data->>'domReady')::bigint) FILTER (
          WHERE type = 'performance' AND sub_type = 'load' AND data->>'domReady' IS NOT NULL
        ),
        MAX((data->>'domReady')::bigint) FILTER (
          WHERE type = 'performance' AND sub_type = 'load' AND data->>'domReady' IS NOT NULL
        )
      FROM events
      GROUP BY app_id, to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')
    `,
      []
    );

    await clientQuery(
      client,
      `
      INSERT INTO event_daily_error_types (app_id, date, sub_type, count)
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        COALESCE(NULLIF(TRIM(sub_type), ''), 'manual'),
        COUNT(*)::int
      FROM events
      WHERE type = 'error'
      GROUP BY 1, 2, 3
    `,
      []
    );

    await clientQuery(
      client,
      `
      INSERT INTO event_daily_visitors (app_id, date, visitor_id)
      SELECT DISTINCT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        visitor_id
      FROM events
      WHERE type = 'behavior' AND sub_type = 'pv'
        AND visitor_id IS NOT NULL AND TRIM(visitor_id) != ''
      ON CONFLICT DO NOTHING
    `,
      []
    );

    // 小时聚合：fcp / lcp / load
    await clientQuery(
      client,
      `
      INSERT INTO event_hourly_perf (
        app_id, hour_start, metric, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        date_trunc('hour', to_timestamp(timestamp / 1000.0))::timestamp,
        sub_type,
        COALESCE(SUM((data->>'value')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'value')::bigint),
        MAX((data->>'value')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type IN ('fcp', 'lcp', 'load')
        AND data->>'value' IS NOT NULL
      GROUP BY 1, 2, 3
    `,
      []
    );

    // 小时聚合：dom_ready（嵌在 load）
    await clientQuery(
      client,
      `
      INSERT INTO event_hourly_perf (
        app_id, hour_start, metric, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        date_trunc('hour', to_timestamp(timestamp / 1000.0))::timestamp,
        'dom_ready',
        COALESCE(SUM((data->>'domReady')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'domReady')::bigint),
        MAX((data->>'domReady')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type = 'load'
        AND data->>'domReady' IS NOT NULL
      GROUP BY 1, 2
    `,
      []
    );

    // URL 日聚合：fcp / lcp / load（规范化 URL）
    await clientQuery(
      client,
      `
      INSERT INTO event_daily_perf_urls (
        app_id, date, metric, url, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        sub_type,
        LEFT(
          CASE
            WHEN NULLIF(TRIM(url), '') IS NULL THEN '(empty)'
            WHEN POSITION('://' IN url) > 0 THEN
              SPLIT_PART(SPLIT_PART(url, '?', 1), '#', 1)
            ELSE SPLIT_PART(SPLIT_PART(url, '?', 1), '#', 1)
          END,
          500
        ),
        COALESCE(SUM((data->>'value')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'value')::bigint),
        MAX((data->>'value')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type IN ('fcp', 'lcp', 'load')
        AND data->>'value' IS NOT NULL
      GROUP BY 1, 2, 3, 4
    `,
      []
    );

    await clientQuery(
      client,
      `
      INSERT INTO event_daily_perf_urls (
        app_id, date, metric, url, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        'dom_ready',
        LEFT(
          CASE
            WHEN NULLIF(TRIM(url), '') IS NULL THEN '(empty)'
            ELSE SPLIT_PART(SPLIT_PART(url, '?', 1), '#', 1)
          END,
          500
        ),
        COALESCE(SUM((data->>'domReady')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'domReady')::bigint),
        MAX((data->>'domReady')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type = 'load'
        AND data->>'domReady' IS NOT NULL
      GROUP BY 1, 2, 4
    `,
      []
    );

    // 行为：按 URL 日 PV
    await clientQuery(
      client,
      `
      INSERT INTO event_daily_pv_urls (app_id, date, url, pv)
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        LEFT(
          CASE
            WHEN NULLIF(TRIM(url), '') IS NULL THEN '(empty)'
            ELSE SPLIT_PART(SPLIT_PART(url, '?', 1), '#', 1)
          END,
          500
        ),
        COUNT(*)::int
      FROM events
      WHERE type = 'behavior' AND sub_type = 'pv'
      GROUP BY 1, 2, 3
    `,
      []
    );
  });
}
