import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import {
  MAX_PERF_METRIC_MS,
  normalizePageUrl,
} from '../db/dailyStats.js';
import { parseRangeBound } from './eventQuery.js';

export const statsRouter = Router();

const n = (v: string | number | null | undefined) => Number(v) || 0;
const nOrNull = (v: string | number | null | undefined) => {
  if (v == null || v === '') return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
};

const CACHE_TTL_MS = Number(process.env.STATS_CACHE_TTL_MS) || 120_000;
const PERF_URL_TOP_N = Number(process.env.PERF_URL_TOP_N) || 20;
/** 行为看板：每日访问量最高页数 */
const PV_TOP_N = Number(process.env.PV_TOP_N) || 20;
/** 行为看板：每日访问量最低页数 */
const PV_BOTTOM_N = Number(process.env.PV_BOTTOM_N) || 20;
const statsCache = new Map<string, { expires: number; payload: unknown }>();

function cacheKey(
  appId: string,
  startDate: unknown,
  endDate: unknown,
  hourlyDate: unknown
) {
  return `${appId}|${String(startDate || '')}|${String(endDate || '')}|${String(hourlyDate || '')}`;
}

function avg(sum: number, count: number) {
  if (!count) return 0;
  return Math.round(sum / count);
}

function metricBlock(
  sum: number,
  count: number,
  min: number | null,
  max: number | null,
  p50?: number | null
) {
  return {
    avg: avg(sum, count),
    p50: p50 != null && Number.isFinite(p50) ? Math.round(p50) : 0,
    min: count > 0 && min != null ? min : 0,
    max: count > 0 && max != null ? max : 0,
    count,
  };
}

function weightedP50(
  p50: number | null | undefined,
  count: number
): number | null {
  if (p50 == null || !count) return null;
  return p50;
}

type UrlAggRow = {
  metric: string;
  url: string;
  value_sum: string | number;
  value_count: string | number;
  value_min: string | number | null;
  value_max: string | number | null;
};

/**
 * GET /api/stats
 * 从日/小时/URL 聚合表读取，带短缓存（默认 120s）
 * hourlyDate：小时趋势只查该日（默认 endDate），避免跨日扫小时访客表
 */
statsRouter.get('/', async (req, res) => {
  try {
    const { appId, startDate, endDate, hourlyDate } = req.query;

    if (!appId || typeof appId !== 'string') {
      return res.status(400).json({ error: 'appId is required' });
    }

    const start = parseRangeBound(startDate, 'start');
    const end = parseRangeBound(endDate, 'end');
    const startDay =
      typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
        ? startDate
        : new Date(start).toISOString().slice(0, 10);
    const endDay =
      typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? endDate
        : new Date(end).toISOString().slice(0, 10);
    const hourDay =
      typeof hourlyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hourlyDate)
        ? hourlyDate
        : endDay;

    const key = cacheKey(appId, startDay, endDay, hourDay);
    const cached = statsCache.get(key);
    if (cached && cached.expires > Date.now()) {
      res.setHeader('X-Stats-Cache', 'HIT');
      return res.json(cached.payload);
    }

    const dayParams = [appId, startDay, endDay];
    const hourStart = `${hourDay} 00:00:00`;
    const hourEnd = `${hourDay} 23:59:59`;

    const [
      summary,
      errorTypes,
      uvRow,
      dailyRows,
      hourlyRows,
      hourlyStatsRows,
      urlRows,
      pvUrlRows,
    ] = await Promise.all([
      queryOne<Record<string, string | number | null>>(
        `SELECT
           COALESCE(SUM(js_errors), 0)::int as js_errors,
           COALESCE(SUM(resource_errors), 0)::int as resource_errors,
           COALESCE(SUM(api_errors), 0)::int as api_errors,
           COALESCE(SUM(blank_screens), 0)::int as blank_screens,
           COALESCE(SUM(not_found_404), 0)::int as not_found_404,
           COALESCE(SUM(other_issues), 0)::int as other_issues,
           COALESCE(SUM(pv), 0)::int as pv,
           COALESCE(SUM(clicks), 0)::int as clicks,
           COALESCE(SUM(stay_duration_sum), 0)::bigint as stay_duration_sum,
           COALESCE(SUM(stay_count), 0)::int as stay_count,
           COALESCE(SUM(fcp_sum), 0)::bigint as fcp_sum,
           COALESCE(SUM(fcp_count), 0)::int as fcp_count,
           MIN(fcp_min) as fcp_min,
           MAX(fcp_max) as fcp_max,
           COALESCE(SUM(lcp_sum), 0)::bigint as lcp_sum,
           COALESCE(SUM(lcp_count), 0)::int as lcp_count,
           MIN(lcp_min) as lcp_min,
           MAX(lcp_max) as lcp_max,
           COALESCE(SUM(load_sum), 0)::bigint as load_sum,
           COALESCE(SUM(load_count), 0)::int as load_count,
           MIN(load_min) as load_min,
           MAX(load_max) as load_max,
           COALESCE(SUM(dom_ready_sum), 0)::bigint as dom_ready_sum,
           COALESCE(SUM(dom_ready_count), 0)::int as dom_ready_count,
           MIN(dom_ready_min) as dom_ready_min,
           MAX(dom_ready_max) as dom_ready_max,
           COALESCE(SUM(ttfb_sum), 0)::bigint as ttfb_sum,
           COALESCE(SUM(ttfb_count), 0)::int as ttfb_count,
           MIN(ttfb_min) as ttfb_min,
           MAX(ttfb_max) as ttfb_max,
           COALESCE(SUM(spa_lcp_sum), 0)::bigint as spa_lcp_sum,
           COALESCE(SUM(spa_lcp_count), 0)::int as spa_lcp_count,
           MIN(spa_lcp_min) as spa_lcp_min,
           MAX(spa_lcp_max) as spa_lcp_max,
           CASE WHEN COALESCE(SUM(CASE WHEN fcp_p50 IS NOT NULL THEN fcp_count ELSE 0 END), 0) > 0
             THEN ROUND(
               SUM(CASE WHEN fcp_p50 IS NOT NULL THEN fcp_p50::numeric * fcp_count ELSE 0 END)
               / SUM(CASE WHEN fcp_p50 IS NOT NULL THEN fcp_count ELSE 0 END)
             ) END as fcp_p50,
           CASE WHEN COALESCE(SUM(CASE WHEN lcp_p50 IS NOT NULL THEN lcp_count ELSE 0 END), 0) > 0
             THEN ROUND(
               SUM(CASE WHEN lcp_p50 IS NOT NULL THEN lcp_p50::numeric * lcp_count ELSE 0 END)
               / SUM(CASE WHEN lcp_p50 IS NOT NULL THEN lcp_count ELSE 0 END)
             ) END as lcp_p50,
           CASE WHEN COALESCE(SUM(CASE WHEN load_p50 IS NOT NULL THEN load_count ELSE 0 END), 0) > 0
             THEN ROUND(
               SUM(CASE WHEN load_p50 IS NOT NULL THEN load_p50::numeric * load_count ELSE 0 END)
               / SUM(CASE WHEN load_p50 IS NOT NULL THEN load_count ELSE 0 END)
             ) END as load_p50,
           CASE WHEN COALESCE(SUM(CASE WHEN dom_ready_p50 IS NOT NULL THEN dom_ready_count ELSE 0 END), 0) > 0
             THEN ROUND(
               SUM(CASE WHEN dom_ready_p50 IS NOT NULL THEN dom_ready_p50::numeric * dom_ready_count ELSE 0 END)
               / SUM(CASE WHEN dom_ready_p50 IS NOT NULL THEN dom_ready_count ELSE 0 END)
             ) END as dom_ready_p50,
           CASE WHEN COALESCE(SUM(CASE WHEN ttfb_p50 IS NOT NULL THEN ttfb_count ELSE 0 END), 0) > 0
             THEN ROUND(
               SUM(CASE WHEN ttfb_p50 IS NOT NULL THEN ttfb_p50::numeric * ttfb_count ELSE 0 END)
               / SUM(CASE WHEN ttfb_p50 IS NOT NULL THEN ttfb_count ELSE 0 END)
             ) END as ttfb_p50,
           CASE WHEN COALESCE(SUM(CASE WHEN spa_lcp_p50 IS NOT NULL THEN spa_lcp_count ELSE 0 END), 0) > 0
             THEN ROUND(
               SUM(CASE WHEN spa_lcp_p50 IS NOT NULL THEN spa_lcp_p50::numeric * spa_lcp_count ELSE 0 END)
               / SUM(CASE WHEN spa_lcp_p50 IS NOT NULL THEN spa_lcp_count ELSE 0 END)
             ) END as spa_lcp_p50,
           COALESCE(SUM(perf_over_budget), 0)::int as perf_over_budget
         FROM event_daily_stats
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date`,
        dayParams
      ),

      query<{ sub_type: string; count: string | number }>(
        `SELECT sub_type, SUM(count)::int as count
         FROM event_daily_error_types
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date
           AND sub_type IN ('js', 'promise')
         GROUP BY sub_type
         ORDER BY count DESC`,
        dayParams
      ),

      queryOne<{ count: string | number }>(
        `SELECT COUNT(*)::int as count
         FROM (
           SELECT visitor_id
           FROM event_daily_visitors
           WHERE app_id = ? AND date >= ?::date AND date <= ?::date
           GROUP BY visitor_id
         ) t`,
        dayParams
      ),

      query<Record<string, any>>(
        `SELECT
           to_char(s.date, 'YYYY-MM-DD') as date,
           s.js_errors as errors,
           s.resource_errors as resource_errors,
           s.api_errors as api_errors,
           s.blank_screens as blank_screens,
           s.not_found_404 as not_found_404,
           s.other_issues as other_issues,
           s.pv,
           s.clicks,
           CASE WHEN s.stay_count > 0
             THEN ROUND(s.stay_duration_sum::numeric / s.stay_count)
             ELSE 0 END as avg_stay,
           CASE WHEN s.fcp_count > 0
             THEN ROUND(s.fcp_sum::numeric / s.fcp_count) ELSE 0 END as fcp,
           CASE WHEN s.lcp_count > 0
             THEN ROUND(s.lcp_sum::numeric / s.lcp_count) ELSE 0 END as lcp,
           CASE WHEN s.load_count > 0
             THEN ROUND(s.load_sum::numeric / s.load_count) ELSE 0 END as load,
           CASE WHEN s.dom_ready_count > 0
             THEN ROUND(s.dom_ready_sum::numeric / s.dom_ready_count)
             ELSE 0 END as dom_ready,
           CASE WHEN s.ttfb_count > 0
             THEN ROUND(s.ttfb_sum::numeric / s.ttfb_count) ELSE 0 END as ttfb,
           CASE WHEN s.spa_lcp_count > 0
             THEN ROUND(s.spa_lcp_sum::numeric / s.spa_lcp_count)
             ELSE 0 END as spa_lcp,
           COALESCE(s.fcp_p50, 0)::bigint as fcp_p50,
           COALESCE(s.lcp_p50, 0)::bigint as lcp_p50,
           COALESCE(s.load_p50, 0)::bigint as load_p50,
           COALESCE(s.dom_ready_p50, 0)::bigint as dom_ready_p50,
           COALESCE(s.ttfb_p50, 0)::bigint as ttfb_p50,
           COALESCE(s.spa_lcp_p50, 0)::bigint as spa_lcp_p50,
           COALESCE(v.uv, 0)::int as uv
         FROM event_daily_stats s
         LEFT JOIN (
           SELECT date, COUNT(*)::int as uv
           FROM event_daily_visitors
           WHERE app_id = ? AND date >= ?::date AND date <= ?::date
           GROUP BY date
         ) v ON v.date = s.date
         WHERE s.app_id = ? AND s.date >= ?::date AND s.date <= ?::date
         ORDER BY s.date ASC
         LIMIT 90`,
        [...dayParams, ...dayParams]
      ),

      // 小时性能：仅查 hourlyDate 当天
      query<{
        hour_label: string;
        metric: string;
        avg_value: string | number;
        p50_value: string | number | null;
      }>(
        `SELECT
           to_char(hour_start, 'YYYY-MM-DD HH24:00') as hour_label,
           metric,
           CASE WHEN value_count > 0
             THEN ROUND(value_sum::numeric / value_count) ELSE 0 END as avg_value,
           value_p50 as p50_value
         FROM event_hourly_perf
         WHERE app_id = ?
           AND hour_start >= ?::timestamp
           AND hour_start <= ?::timestamp
         ORDER BY hour_start ASC`,
        [appId, hourStart, hourEnd]
      ),

      // 小时行为/稳定性：仅查当天；UV 用子查询但范围仅 24h
      query<Record<string, string | number | null>>(
        `SELECT
           to_char(h.hour_start, 'YYYY-MM-DD HH24:00') as hour_label,
           h.js_errors as errors,
           h.resource_errors as resource_errors,
           h.api_errors as api_errors,
           h.blank_screens as blank_screens,
           h.not_found_404 as not_found_404,
           h.other_issues as other_issues,
           h.pv,
           h.clicks,
           CASE WHEN h.stay_count > 0
             THEN ROUND(h.stay_duration_sum::numeric / h.stay_count)
             ELSE 0 END as avg_stay,
           COALESCE(v.uv, 0)::int as uv
         FROM event_hourly_stats h
         LEFT JOIN (
           SELECT hour_start, COUNT(*)::int as uv
           FROM event_hourly_visitors
           WHERE app_id = ?
             AND hour_start >= ?::timestamp
             AND hour_start <= ?::timestamp
           GROUP BY hour_start
         ) v ON v.hour_start = h.hour_start
         WHERE h.app_id = ?
           AND h.hour_start >= ?::timestamp
           AND h.hour_start <= ?::timestamp
         ORDER BY h.hour_start ASC`,
        [appId, hourStart, hourEnd, appId, hourStart, hourEnd]
      ),

      // URL 写入时已 normalize，读路径不再 regexp
      query<UrlAggRow>(
        `SELECT metric, url,
           SUM(value_sum)::bigint as value_sum,
           SUM(value_count)::int as value_count,
           MIN(value_min) as value_min,
           MAX(value_max) as value_max
         FROM event_daily_perf_urls
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date
         GROUP BY metric, url`,
        dayParams
      ),

      query<{
        date: string;
        url: string;
        pv: string | number;
        rn_desc: string | number;
        rn_asc: string | number;
      }>(
        `WITH ranked AS (
           SELECT
             to_char(date, 'YYYY-MM-DD') as date,
             url,
             pv,
             ROW_NUMBER() OVER (
               PARTITION BY date ORDER BY pv DESC, url ASC
             ) as rn_desc,
             ROW_NUMBER() OVER (
               PARTITION BY date ORDER BY pv ASC, url ASC
             ) as rn_asc
           FROM event_daily_pv_urls
           WHERE app_id = ? AND date >= ?::date AND date <= ?::date
             AND pv > 0
         )
         SELECT date, url, pv, rn_desc, rn_asc
         FROM ranked
         WHERE rn_desc <= ? OR rn_asc <= ?
         ORDER BY date ASC, pv DESC`,
        [...dayParams, PV_TOP_N, PV_BOTTOM_N]
      ),
    ]);

    const s = summary || {};
    const rowNum = (key: string) => n(s[key]);
    const rowMin = (key: string) => nOrNull(s[key]);

    const daily = dailyRows.map((row) => ({
      date: row.date,
      pv: n(row.pv),
      uv: n(row.uv),
      errors: n(row.errors),
      resourceErrors: n(row.resource_errors ?? row.resourceErrors),
      apiErrors: n(row.api_errors ?? row.apiErrors),
      blankScreens: n(row.blank_screens ?? row.blankScreens),
      notFound404: n(row.not_found_404 ?? row.notFound404),
      otherIssues: n(row.other_issues ?? row.otherIssues),
      fcp: n(row.fcp),
      lcp: n(row.lcp),
      load: n(row.load),
      domReady: n(row.dom_ready ?? row.domReady),
      ttfb: n(row.ttfb),
      spaLcp: n(row.spa_lcp ?? row.spaLcp),
      fcpP50: n(row.fcp_p50 ?? row.fcpP50),
      lcpP50: n(row.lcp_p50 ?? row.lcpP50),
      loadP50: n(row.load_p50 ?? row.loadP50),
      avgStay: n(row.avg_stay ?? row.avgStay),
      clicks: n(row.clicks),
    }));

    const hourlyMap = new Map<
      string,
      {
        hour: string;
        fcp: number;
        lcp: number;
        load: number;
        domReady: number;
        ttfb: number;
        spaLcp: number;
        fcpP50: number;
        lcpP50: number;
        loadP50: number;
      }
    >();
    for (const row of hourlyRows) {
      const hour = String(row.hour_label);
      let point = hourlyMap.get(hour);
      if (!point) {
        point = {
          hour,
          fcp: 0,
          lcp: 0,
          load: 0,
          domReady: 0,
          ttfb: 0,
          spaLcp: 0,
          fcpP50: 0,
          lcpP50: 0,
          loadP50: 0,
        };
        hourlyMap.set(hour, point);
      }
      const value = n(row.avg_value);
      const p50 = nOrNull(row.p50_value) ?? 0;
      if (row.metric === 'fcp') {
        point.fcp = value;
        point.fcpP50 = p50;
      } else if (row.metric === 'lcp') {
        point.lcp = value;
        point.lcpP50 = p50;
      } else if (row.metric === 'load') {
        point.load = value;
        point.loadP50 = p50;
      } else if (row.metric === 'dom_ready') point.domReady = value;
      else if (row.metric === 'ttfb') point.ttfb = value;
      else if (row.metric === 'spa_lcp') point.spaLcp = value;
    }
    const hourly = Array.from(hourlyMap.values()).sort((a, b) =>
      a.hour.localeCompare(b.hour)
    );

    const hourlyStats = hourlyStatsRows.map((row) => ({
      hour: String(row.hour_label || ''),
      errors: n(row.errors),
      resourceErrors: n(row.resource_errors ?? row.resourceErrors),
      apiErrors: n(row.api_errors ?? row.apiErrors),
      blankScreens: n(row.blank_screens ?? row.blankScreens),
      notFound404: n(row.not_found_404 ?? row.notFound404),
      otherIssues: n(row.other_issues ?? row.otherIssues),
      pv: n(row.pv),
      uv: n(row.uv),
      clicks: n(row.clicks),
      avgStay: n(row.avg_stay ?? row.avgStay),
    }));

    const emptyUrlList = () =>
      [] as Array<{
        url: string;
        avg: number;
        min: number;
        max: number;
        count: number;
      }>;
    const perfByUrl = {
      fcp: emptyUrlList(),
      lcp: emptyUrlList(),
      load: emptyUrlList(),
      domReady: emptyUrlList(),
      ttfb: emptyUrlList(),
      spaLcp: emptyUrlList(),
    };
    const buckets: Record<string, typeof perfByUrl.fcp> = {
      fcp: perfByUrl.fcp,
      lcp: perfByUrl.lcp,
      load: perfByUrl.load,
      dom_ready: perfByUrl.domReady,
      ttfb: perfByUrl.ttfb,
      spa_lcp: perfByUrl.spaLcp,
    };
    for (const row of urlRows) {
      const bucket = buckets[row.metric];
      if (!bucket) continue;
      const count = n(row.value_count);
      if (!count) continue;
      bucket.push({
        url: normalizePageUrl(row.url),
        avg: avg(n(row.value_sum), count),
        min: nOrNull(row.value_min) ?? 0,
        max: nOrNull(row.value_max) ?? 0,
        count,
      });
    }
    for (const list of Object.values(perfByUrl)) {
      list.sort((a, b) => b.avg - a.avg || b.count - a.count);
      list.splice(PERF_URL_TOP_N);
    }

    type PvPageRow = { url: string; pv: number };
    const pvPagesByDayMap = new Map<
      string,
      { date: string; top: PvPageRow[]; bottom: PvPageRow[] }
    >();
    for (const row of pvUrlRows) {
      const date = String(row.date);
      let bucket = pvPagesByDayMap.get(date);
      if (!bucket) {
        bucket = { date, top: [], bottom: [] };
        pvPagesByDayMap.set(date, bucket);
      }
      const item = { url: normalizePageUrl(row.url), pv: n(row.pv) };
      if (n(row.rn_desc) <= PV_TOP_N) bucket.top.push(item);
      if (n(row.rn_asc) <= PV_BOTTOM_N) bucket.bottom.push(item);
    }
    const pvPagesByDay = Array.from(pvPagesByDayMap.values()).map((day) => {
      const dedupe = (list: PvPageRow[], desc: boolean) => {
        const seen = new Set<string>();
        const out: PvPageRow[] = [];
        for (const item of list) {
          if (seen.has(item.url)) continue;
          seen.add(item.url);
          out.push(item);
        }
        out.sort((a, b) =>
          desc
            ? b.pv - a.pv || a.url.localeCompare(b.url)
            : a.pv - b.pv || a.url.localeCompare(b.url)
        );
        return out;
      };
      return {
        date: day.date,
        top: dedupe(day.top, true).slice(0, PV_TOP_N),
        bottom: dedupe(day.bottom, false).slice(0, PV_BOTTOM_N),
      };
    });

    const payload = {
      errors: {
        total: rowNum('js_errors'),
        byType: errorTypes.map((item) => ({
          sub_type: item.sub_type,
          count: n(item.count),
        })),
      },
      stability: {
        resourceErrors: rowNum('resource_errors'),
        apiErrors: rowNum('api_errors'),
        blankScreens: rowNum('blank_screens'),
        notFound404: rowNum('not_found_404'),
        otherIssues: rowNum('other_issues'),
      },
      performance: {
        fcp: metricBlock(
          rowNum('fcp_sum'),
          rowNum('fcp_count'),
          rowMin('fcp_min'),
          rowMin('fcp_max'),
          weightedP50(rowMin('fcp_p50'), rowNum('fcp_count'))
        ),
        lcp: metricBlock(
          rowNum('lcp_sum'),
          rowNum('lcp_count'),
          rowMin('lcp_min'),
          rowMin('lcp_max'),
          weightedP50(rowMin('lcp_p50'), rowNum('lcp_count'))
        ),
        load: metricBlock(
          rowNum('load_sum'),
          rowNum('load_count'),
          rowMin('load_min'),
          rowMin('load_max'),
          weightedP50(rowMin('load_p50'), rowNum('load_count'))
        ),
        domReady: metricBlock(
          rowNum('dom_ready_sum'),
          rowNum('dom_ready_count'),
          rowMin('dom_ready_min'),
          rowMin('dom_ready_max'),
          weightedP50(rowMin('dom_ready_p50'), rowNum('dom_ready_count'))
        ),
        ttfb: metricBlock(
          rowNum('ttfb_sum'),
          rowNum('ttfb_count'),
          rowMin('ttfb_min'),
          rowMin('ttfb_max'),
          weightedP50(rowMin('ttfb_p50'), rowNum('ttfb_count'))
        ),
        spaLcp: metricBlock(
          rowNum('spa_lcp_sum'),
          rowNum('spa_lcp_count'),
          rowMin('spa_lcp_min'),
          rowMin('spa_lcp_max'),
          weightedP50(rowMin('spa_lcp_p50'), rowNum('spa_lcp_count'))
        ),
        overBudget: rowNum('perf_over_budget'),
        maxMetricMs: MAX_PERF_METRIC_MS,
        note:
          '各指标样本集独立（count 可能不同）；P50 来自日/小时聚合表（单日精确；跨日按样本数加权近似）。',
      },
      behavior: {
        pv: rowNum('pv'),
        uv: n(uvRow?.count),
        avgStay: avg(rowNum('stay_duration_sum'), rowNum('stay_count')),
        totalClicks: rowNum('clicks'),
      },
      daily,
      hourly,
      hourlyStats,
      hourlyDate: hourDay,
      perfByUrl,
      pvPagesByDay,
    };

    statsCache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload });
    if (statsCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of statsCache) {
        if (v.expires <= now) statsCache.delete(k);
      }
    }

    res.setHeader('X-Stats-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const invalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const INVALIDATE_DEBOUNCE_MS =
  Number(process.env.STATS_CACHE_INVALIDATE_DEBOUNCE_MS) || 3_000;

/** 供上报后主动失效缓存（同进程，默认 debounce 3s，避免打穿缓存） */
export function invalidateStatsCache(appId?: string) {
  if (!appId) {
    for (const t of invalidateTimers.values()) clearTimeout(t);
    invalidateTimers.clear();
    statsCache.clear();
    return;
  }

  const prev = invalidateTimers.get(appId);
  if (prev) clearTimeout(prev);
  invalidateTimers.set(
    appId,
    setTimeout(() => {
      invalidateTimers.delete(appId);
      for (const key of statsCache.keys()) {
        if (key.startsWith(`${appId}|`)) statsCache.delete(key);
      }
    }, INVALIDATE_DEBOUNCE_MS)
  );
}
