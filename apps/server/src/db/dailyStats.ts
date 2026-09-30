import type { PoolClient } from 'pg';
import { clientQuery, execute } from './index.js';

/** 与 Node 进程本地时区一致的 YYYY-MM-DD（对齐 PG to_char(to_timestamp(...))） */
export function dayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type RollupEvent = {
  type: string;
  subType: string | null;
  timestamp: number;
  appId: string;
  visitorId: string;
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
  lcpSum: number;
  lcpCount: number;
  loadSum: number;
  loadCount: number;
  domReadySum: number;
  domReadyCount: number;
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
    lcpSum: 0,
    lcpCount: 0,
    loadSum: 0,
    loadCount: 0,
    domReadySum: 0,
    domReadyCount: 0,
  };
}

function parseData(data: RollupEvent['data']): Record<string, unknown> {
  if (!data) return {};
  if (typeof data === 'object') return data;
  return {};
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
    const value = Number(data.value);
    if (sub === 'fcp' && Number.isFinite(value)) {
      delta.fcpSum = Math.round(value);
      delta.fcpCount = 1;
    } else if (sub === 'lcp' && Number.isFinite(value)) {
      delta.lcpSum = Math.round(value);
      delta.lcpCount = 1;
    } else if (sub === 'load' && Number.isFinite(value)) {
      delta.loadSum = Math.round(value);
      delta.loadCount = 1;
      const domReady = Number(data.domReady);
      if (Number.isFinite(domReady)) {
        delta.domReadySum = Math.round(domReady);
        delta.domReadyCount = 1;
      }
    }
  }

  return { delta, errorSubType, trackVisitor };
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
       fcp_sum, fcp_count, lcp_sum, lcp_count,
       load_sum, load_count, dom_ready_sum, dom_ready_count
     ) VALUES (
       ?, ?::date,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?,
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
       lcp_sum = s.lcp_sum + EXCLUDED.lcp_sum,
       lcp_count = s.lcp_count + EXCLUDED.lcp_count,
       load_sum = s.load_sum + EXCLUDED.load_sum,
       load_count = s.load_count + EXCLUDED.load_count,
       dom_ready_sum = s.dom_ready_sum + EXCLUDED.dom_ready_sum,
       dom_ready_count = s.dom_ready_count + EXCLUDED.dom_ready_count`,
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
      delta.lcpSum,
      delta.lcpCount,
      delta.loadSum,
      delta.loadCount,
      delta.domReadySum,
      delta.domReadyCount,
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
}

/** 从 events 全量重建日聚合（SQL 聚合，快） */
export async function rebuildDailyStats(): Promise<void> {
  await execute(`TRUNCATE event_daily_stats, event_daily_error_types, event_daily_visitors`);

  await execute(`
    INSERT INTO event_daily_stats (
      app_id, date,
      js_errors, resource_errors, api_errors, blank_screens,
      not_found_404, other_issues, pv, clicks,
      stay_duration_sum, stay_count,
      fcp_sum, fcp_count, lcp_sum, lcp_count,
      load_sum, load_count, dom_ready_sum, dom_ready_count
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
      COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'lcp'
        THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
      COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'lcp')::int,
      COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
        THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
      COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load')::int,
      COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
        THEN (data->>'domReady')::bigint ELSE 0 END), 0)::bigint,
      COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load'
        AND data->>'domReady' IS NOT NULL)::int
    FROM events
    GROUP BY app_id, to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')
  `);

  await execute(`
    INSERT INTO event_daily_error_types (app_id, date, sub_type, count)
    SELECT
      app_id,
      to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
      COALESCE(NULLIF(TRIM(sub_type), ''), 'manual'),
      COUNT(*)::int
    FROM events
    WHERE type = 'error'
    GROUP BY 1, 2, 3
  `);

  await execute(`
    INSERT INTO event_daily_visitors (app_id, date, visitor_id)
    SELECT DISTINCT
      app_id,
      to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
      visitor_id
    FROM events
    WHERE type = 'behavior' AND sub_type = 'pv'
      AND visitor_id IS NOT NULL AND TRIM(visitor_id) != ''
    ON CONFLICT DO NOTHING
  `);
}
