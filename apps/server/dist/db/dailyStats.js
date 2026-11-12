import { clientQuery, withTransaction } from './index.js';
/** 与 Node 进程本地时区一致的 YYYY-MM-DD */
export function dayKeyFromMs(ms) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** 本地整点：YYYY-MM-DD HH:00:00 */
export function hourKeyFromMs(ms) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:00:00`;
}
function emptyDelta() {
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
        ttfbSum: 0,
        ttfbCount: 0,
        ttfbMin: null,
        ttfbMax: null,
        spaLcpSum: 0,
        spaLcpCount: 0,
        spaLcpMin: null,
        spaLcpMax: null,
        perfOverBudget: 0,
    };
}
function applyMetric(delta, metric, value) {
    const set = (keys) => {
        delta[keys.sum] = value;
        delta[keys.count] = 1;
        delta[keys.min] = value;
        delta[keys.max] = value;
    };
    if (metric === 'fcp')
        set({ sum: 'fcpSum', count: 'fcpCount', min: 'fcpMin', max: 'fcpMax' });
    else if (metric === 'lcp')
        set({ sum: 'lcpSum', count: 'lcpCount', min: 'lcpMin', max: 'lcpMax' });
    else if (metric === 'load')
        set({ sum: 'loadSum', count: 'loadCount', min: 'loadMin', max: 'loadMax' });
    else if (metric === 'dom_ready')
        set({
            sum: 'domReadySum',
            count: 'domReadyCount',
            min: 'domReadyMin',
            max: 'domReadyMax',
        });
    else if (metric === 'ttfb')
        set({ sum: 'ttfbSum', count: 'ttfbCount', min: 'ttfbMin', max: 'ttfbMax' });
    else if (metric === 'spa_lcp')
        set({
            sum: 'spaLcpSum',
            count: 'spaLcpCount',
            min: 'spaLcpMin',
            max: 'spaLcpMax',
        });
}
function parseData(data) {
    if (!data)
        return {};
    if (typeof data === 'object')
        return data;
    return {};
}
/**
 * 页面 URL 规范化：
 * - 去掉 search（?a=1）与 hash 内 query（#/path?a=1 → #/path）
 * - 保留 hash 路由（#/、#!/）
 */
export function normalizePageUrl(raw) {
    const input = (raw || '').trim();
    if (!input)
        return '(empty)';
    const stripQueries = (value) => {
        // 先去掉 # 前的 ?query，再去掉 hash 内 ?query
        const withoutSearch = value.replace(/[?][^#]*/, '');
        const hashIdx = withoutSearch.indexOf('#');
        if (hashIdx < 0)
            return withoutSearch;
        const before = withoutSearch.slice(0, hashIdx);
        const hash = withoutSearch.slice(hashIdx).split('?')[0];
        if (hash.startsWith('#/') || hash.startsWith('#!/')) {
            return `${before}${hash}`;
        }
        return before;
    };
    try {
        const u = new URL(input);
        let hash = u.hash || '';
        const q = hash.indexOf('?');
        if (q >= 0)
            hash = hash.slice(0, q);
        const routeHash = hash.startsWith('#/') || hash.startsWith('#!/') ? hash : '';
        // pathname 不含 search；显式忽略 u.search
        let normalized = `${u.origin}${u.pathname}${routeHash}`;
        // 兜底：再跑一遍通用去参（防异常拼接）
        normalized = stripQueries(normalized);
        if (normalized.length > 500)
            normalized = normalized.slice(0, 500);
        return normalized || '(empty)';
    }
    catch {
        let normalized = stripQueries(input);
        if (normalized.length > 500)
            normalized = normalized.slice(0, 500);
        return normalized || '(empty)';
    }
}
/** @deprecated 使用 normalizePageUrl */
export const normalizePerfUrl = normalizePageUrl;
/**
 * 与 SDK 一致：丢弃超长样本（长驻 SPA / Soft Navigation 下 startTime 可达数天，
 * 会把 AVG 拉爆）。可用环境变量 PERF_MAX_METRIC_MS 覆盖（毫秒）。
 */
export const MAX_PERF_METRIC_MS = (() => {
    const n = Number(process.env.PERF_MAX_METRIC_MS);
    return Number.isFinite(n) && n > 0 ? n : 60000;
})();
export function isValidPerfMs(value) {
    return Number.isFinite(value) && value > 0 && value <= MAX_PERF_METRIC_MS;
}
export function extractPerfSamples(event) {
    if (event.type !== 'performance')
        return [];
    const data = parseData(event.data);
    const sub = event.subType || '';
    const samples = [];
    const value = Number(data.value);
    if (sub === 'over_budget') {
        return samples;
    }
    if (sub === 'fcp' && isValidPerfMs(value)) {
        samples.push({ metric: 'fcp', value: Math.round(value) });
    }
    else if (sub === 'lcp' && isValidPerfMs(value)) {
        samples.push({ metric: 'lcp', value: Math.round(value) });
    }
    else if (sub === 'spa_lcp' && isValidPerfMs(value)) {
        samples.push({ metric: 'spa_lcp', value: Math.round(value) });
    }
    else if (sub === 'load' && isValidPerfMs(value)) {
        samples.push({ metric: 'load', value: Math.round(value) });
        const domReady = Number(data.domReady);
        if (isValidPerfMs(domReady)) {
            samples.push({ metric: 'dom_ready', value: Math.round(domReady) });
        }
        const ttfb = Number(data.ttfb);
        if (isValidPerfMs(ttfb)) {
            samples.push({ metric: 'ttfb', value: Math.round(ttfb) });
        }
    }
    else if (sub === 'ttfb' && isValidPerfMs(value)) {
        samples.push({ metric: 'ttfb', value: Math.round(value) });
    }
    return samples;
}
/** 单条事件 → 日聚合增量 */
export function buildDailyDelta(event) {
    const delta = emptyDelta();
    const data = parseData(event.data);
    const sub = event.subType || '';
    let errorSubType = null;
    let trackVisitor = false;
    if (event.type === 'error') {
        if (sub === 'js' || sub === 'promise') {
            delta.jsErrors = 1;
            errorSubType = sub;
        }
        else {
            delta.otherIssues = 1;
            if (sub === '404' || String(data.message) === '404') {
                delta.notFound404 = 1;
            }
            errorSubType = sub || 'manual';
        }
    }
    else if (event.type === 'resource') {
        delta.resourceErrors = 1;
    }
    else if (event.type === 'api') {
        delta.apiErrors = 1;
    }
    else if (event.type === 'blank') {
        delta.blankScreens = 1;
    }
    else if (event.type === 'behavior') {
        if (sub === 'pv') {
            delta.pv = 1;
            trackVisitor = true;
        }
        else if (sub === 'stay') {
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
    }
    else if (event.type === 'performance') {
        if (sub === 'over_budget') {
            delta.perfOverBudget = 1;
        }
        else {
            const samples = extractPerfSamples(event);
            if (samples.length === 0 &&
                Number.isFinite(Number(data.value)) &&
                Number(data.value) > MAX_PERF_METRIC_MS) {
                delta.perfOverBudget = 1;
            }
            for (const sample of samples) {
                applyMetric(delta, sample.metric, sample.value);
            }
        }
    }
    return { delta, errorSubType, trackVisitor };
}
async function upsertHourlyAndUrl(client, event) {
    const samples = extractPerfSamples(event);
    if (samples.length === 0)
        return;
    const date = dayKeyFromMs(event.timestamp);
    const hour = hourKeyFromMs(event.timestamp);
    const url = normalizePerfUrl(event.url);
    for (const { metric, value } of samples) {
        await clientQuery(client, `INSERT INTO event_hourly_perf AS h (
         app_id, hour_start, metric, value_sum, value_count, value_min, value_max
       ) VALUES (?, ?::timestamp, ?, ?, 1, ?, ?)
       ON CONFLICT (app_id, hour_start, metric) DO UPDATE SET
         value_sum = h.value_sum + EXCLUDED.value_sum,
         value_count = h.value_count + EXCLUDED.value_count,
         value_min = CASE WHEN h.value_min IS NULL THEN EXCLUDED.value_min
           ELSE LEAST(h.value_min, EXCLUDED.value_min) END,
         value_max = CASE WHEN h.value_max IS NULL THEN EXCLUDED.value_max
           ELSE GREATEST(h.value_max, EXCLUDED.value_max) END`, [event.appId, hour, metric, value, value, value]);
        await clientQuery(client, `INSERT INTO event_daily_perf_urls AS u (
         app_id, date, metric, url, value_sum, value_count, value_min, value_max
       ) VALUES (?, ?::date, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (app_id, date, metric, url) DO UPDATE SET
         value_sum = u.value_sum + EXCLUDED.value_sum,
         value_count = u.value_count + EXCLUDED.value_count,
         value_min = CASE WHEN u.value_min IS NULL THEN EXCLUDED.value_min
           ELSE LEAST(u.value_min, EXCLUDED.value_min) END,
         value_max = CASE WHEN u.value_max IS NULL THEN EXCLUDED.value_max
           ELSE GREATEST(u.value_max, EXCLUDED.value_max) END`, [event.appId, date, metric, url, value, value, value]);
    }
}
export async function applyRollupWithClient(client, event) {
    const date = dayKeyFromMs(event.timestamp);
    const { delta, errorSubType, trackVisitor } = buildDailyDelta(event);
    await clientQuery(client, `INSERT INTO event_daily_stats AS s (
       app_id, date,
       js_errors, resource_errors, api_errors, blank_screens,
       not_found_404, other_issues, pv, clicks,
       stay_duration_sum, stay_count,
       fcp_sum, fcp_count, fcp_min, fcp_max,
       lcp_sum, lcp_count, lcp_min, lcp_max,
       load_sum, load_count, load_min, load_max,
       dom_ready_sum, dom_ready_count, dom_ready_min, dom_ready_max,
       ttfb_sum, ttfb_count, ttfb_min, ttfb_max,
       spa_lcp_sum, spa_lcp_count, spa_lcp_min, spa_lcp_max,
       perf_over_budget
     ) VALUES (
       ?, ?::date,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?
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
       fcp_min = CASE WHEN EXCLUDED.fcp_count > 0 THEN
         CASE WHEN s.fcp_min IS NULL THEN EXCLUDED.fcp_min
              ELSE LEAST(s.fcp_min, EXCLUDED.fcp_min) END
         ELSE s.fcp_min END,
       fcp_max = CASE WHEN EXCLUDED.fcp_count > 0 THEN
         CASE WHEN s.fcp_max IS NULL THEN EXCLUDED.fcp_max
              ELSE GREATEST(s.fcp_max, EXCLUDED.fcp_max) END
         ELSE s.fcp_max END,
       lcp_sum = s.lcp_sum + EXCLUDED.lcp_sum,
       lcp_count = s.lcp_count + EXCLUDED.lcp_count,
       lcp_min = CASE WHEN EXCLUDED.lcp_count > 0 THEN
         CASE WHEN s.lcp_min IS NULL THEN EXCLUDED.lcp_min
              ELSE LEAST(s.lcp_min, EXCLUDED.lcp_min) END
         ELSE s.lcp_min END,
       lcp_max = CASE WHEN EXCLUDED.lcp_count > 0 THEN
         CASE WHEN s.lcp_max IS NULL THEN EXCLUDED.lcp_max
              ELSE GREATEST(s.lcp_max, EXCLUDED.lcp_max) END
         ELSE s.lcp_max END,
       load_sum = s.load_sum + EXCLUDED.load_sum,
       load_count = s.load_count + EXCLUDED.load_count,
       load_min = CASE WHEN EXCLUDED.load_count > 0 THEN
         CASE WHEN s.load_min IS NULL THEN EXCLUDED.load_min
              ELSE LEAST(s.load_min, EXCLUDED.load_min) END
         ELSE s.load_min END,
       load_max = CASE WHEN EXCLUDED.load_count > 0 THEN
         CASE WHEN s.load_max IS NULL THEN EXCLUDED.load_max
              ELSE GREATEST(s.load_max, EXCLUDED.load_max) END
         ELSE s.load_max END,
       dom_ready_sum = s.dom_ready_sum + EXCLUDED.dom_ready_sum,
       dom_ready_count = s.dom_ready_count + EXCLUDED.dom_ready_count,
       dom_ready_min = CASE WHEN EXCLUDED.dom_ready_count > 0 THEN
         CASE WHEN s.dom_ready_min IS NULL THEN EXCLUDED.dom_ready_min
              ELSE LEAST(s.dom_ready_min, EXCLUDED.dom_ready_min) END
         ELSE s.dom_ready_min END,
       dom_ready_max = CASE WHEN EXCLUDED.dom_ready_count > 0 THEN
         CASE WHEN s.dom_ready_max IS NULL THEN EXCLUDED.dom_ready_max
              ELSE GREATEST(s.dom_ready_max, EXCLUDED.dom_ready_max) END
         ELSE s.dom_ready_max END,
       ttfb_sum = s.ttfb_sum + EXCLUDED.ttfb_sum,
       ttfb_count = s.ttfb_count + EXCLUDED.ttfb_count,
       ttfb_min = CASE WHEN EXCLUDED.ttfb_count > 0 THEN
         CASE WHEN s.ttfb_min IS NULL THEN EXCLUDED.ttfb_min
              ELSE LEAST(s.ttfb_min, EXCLUDED.ttfb_min) END
         ELSE s.ttfb_min END,
       ttfb_max = CASE WHEN EXCLUDED.ttfb_count > 0 THEN
         CASE WHEN s.ttfb_max IS NULL THEN EXCLUDED.ttfb_max
              ELSE GREATEST(s.ttfb_max, EXCLUDED.ttfb_max) END
         ELSE s.ttfb_max END,
       spa_lcp_sum = s.spa_lcp_sum + EXCLUDED.spa_lcp_sum,
       spa_lcp_count = s.spa_lcp_count + EXCLUDED.spa_lcp_count,
       spa_lcp_min = CASE WHEN EXCLUDED.spa_lcp_count > 0 THEN
         CASE WHEN s.spa_lcp_min IS NULL THEN EXCLUDED.spa_lcp_min
              ELSE LEAST(s.spa_lcp_min, EXCLUDED.spa_lcp_min) END
         ELSE s.spa_lcp_min END,
       spa_lcp_max = CASE WHEN EXCLUDED.spa_lcp_count > 0 THEN
         CASE WHEN s.spa_lcp_max IS NULL THEN EXCLUDED.spa_lcp_max
              ELSE GREATEST(s.spa_lcp_max, EXCLUDED.spa_lcp_max) END
         ELSE s.spa_lcp_max END,
       perf_over_budget = s.perf_over_budget + EXCLUDED.perf_over_budget`, [
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
        delta.ttfbSum,
        delta.ttfbCount,
        delta.ttfbMin,
        delta.ttfbMax,
        delta.spaLcpSum,
        delta.spaLcpCount,
        delta.spaLcpMin,
        delta.spaLcpMax,
        delta.perfOverBudget,
    ]);
    if (errorSubType) {
        await clientQuery(client, `INSERT INTO event_daily_error_types (app_id, date, sub_type, count)
       VALUES (?, ?::date, ?, 1)
       ON CONFLICT (app_id, date, sub_type) DO UPDATE SET
         count = event_daily_error_types.count + 1`, [event.appId, date, errorSubType]);
    }
    if (trackVisitor && event.visitorId) {
        await clientQuery(client, `INSERT INTO event_daily_visitors (app_id, date, visitor_id)
       VALUES (?, ?::date, ?)
       ON CONFLICT DO NOTHING`, [event.appId, date, event.visitorId]);
    }
    if (delta.pv > 0) {
        const url = normalizePerfUrl(event.url);
        await clientQuery(client, `INSERT INTO event_daily_pv_urls AS u (app_id, date, url, pv)
       VALUES (?, ?::date, ?, ?)
       ON CONFLICT (app_id, date, url) DO UPDATE SET
         pv = u.pv + EXCLUDED.pv`, [event.appId, date, url, delta.pv]);
    }
    await upsertHourlyStats(client, event, delta, trackVisitor);
    await upsertHourlyAndUrl(client, event);
}
/** 行为 + 稳定性小时聚合（供看板小时趋势，读路径不依赖明细） */
async function upsertHourlyStats(client, event, delta, trackVisitor) {
    const hasCounters = delta.jsErrors ||
        delta.resourceErrors ||
        delta.apiErrors ||
        delta.blankScreens ||
        delta.notFound404 ||
        delta.otherIssues ||
        delta.pv ||
        delta.clicks ||
        delta.stayCount;
    if (!hasCounters && !trackVisitor)
        return;
    const hour = hourKeyFromMs(event.timestamp);
    if (hasCounters) {
        await clientQuery(client, `INSERT INTO event_hourly_stats AS h (
         app_id, hour_start,
         js_errors, resource_errors, api_errors, blank_screens,
         not_found_404, other_issues, pv, clicks,
         stay_duration_sum, stay_count
       ) VALUES (
         ?, ?::timestamp,
         ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?
       )
       ON CONFLICT (app_id, hour_start) DO UPDATE SET
         js_errors = h.js_errors + EXCLUDED.js_errors,
         resource_errors = h.resource_errors + EXCLUDED.resource_errors,
         api_errors = h.api_errors + EXCLUDED.api_errors,
         blank_screens = h.blank_screens + EXCLUDED.blank_screens,
         not_found_404 = h.not_found_404 + EXCLUDED.not_found_404,
         other_issues = h.other_issues + EXCLUDED.other_issues,
         pv = h.pv + EXCLUDED.pv,
         clicks = h.clicks + EXCLUDED.clicks,
         stay_duration_sum = h.stay_duration_sum + EXCLUDED.stay_duration_sum,
         stay_count = h.stay_count + EXCLUDED.stay_count`, [
            event.appId,
            hour,
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
        ]);
    }
    if (trackVisitor && event.visitorId) {
        await clientQuery(client, `INSERT INTO event_hourly_visitors (app_id, hour_start, visitor_id)
       VALUES (?, ?::timestamp, ?)
       ON CONFLICT DO NOTHING`, [event.appId, hour, event.visitorId]);
    }
}
/**
 * rebuild / stats 查询用：与 normalizePageUrl 对齐。
 * 注意：本项目 SQL 用 `?` 作占位符，字面量问号必须写 CHR(63)，否则会被 pgPlaceholders 吃掉。
 * @param col URL 列表达式，默认 `url`
 */
export function sqlNormalizePageUrl(col = 'url') {
    // CHR(63) = '?'
    return `
  LEFT(
    CASE
      WHEN NULLIF(TRIM(${col}), '') IS NULL THEN '(empty)'
      WHEN POSITION('#/' IN ${col}) > 0 OR POSITION('#!/' IN ${col}) > 0 THEN
        regexp_replace(
          regexp_replace(TRIM(${col}), '[' || CHR(63) || '][^#]*', ''),
          '(#[^' || CHR(63) || ']*)[' || CHR(63) || '].*$',
          '\\1'
        )
      ELSE
        SPLIT_PART(SPLIT_PART(TRIM(${col}), CHR(63), 1), '#', 1)
    END,
    500
  )
`;
}
/** @deprecated 使用 sqlNormalizePageUrl() */
const SQL_NORMALIZE_PAGE_URL = sqlNormalizePageUrl('url');
/** 从 events 全量重建日/小时/URL 聚合 */
export async function rebuildDailyStats() {
    await withTransaction(async (client) => {
        await client.query(`
      LOCK TABLE
        event_daily_stats,
        event_daily_error_types,
        event_daily_visitors,
        event_hourly_perf,
        event_hourly_stats,
        event_hourly_visitors,
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
        event_hourly_stats,
        event_hourly_visitors,
        event_daily_perf_urls,
        event_daily_pv_urls
    `);
        await clientQuery(client, `
      INSERT INTO event_daily_stats (
        app_id, date,
        js_errors, resource_errors, api_errors, blank_screens,
        not_found_404, other_issues, pv, clicks,
        stay_duration_sum, stay_count,
        fcp_sum, fcp_count, fcp_min, fcp_max,
        lcp_sum, lcp_count, lcp_min, lcp_max,
        load_sum, load_count, load_min, load_max,
        dom_ready_sum, dom_ready_count, dom_ready_min, dom_ready_max,
        ttfb_sum, ttfb_count, ttfb_min, ttfb_max,
        spa_lcp_sum, spa_lcp_count, spa_lcp_min, spa_lcp_max,
        perf_over_budget
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
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'fcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS})::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'fcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'fcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS})::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS})::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'load'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'load'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
          AND (data->>'domReady')::float > 0 AND (data->>'domReady')::float <= ${MAX_PERF_METRIC_MS}
          THEN (data->>'domReady')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load'
          AND (data->>'domReady')::float > 0 AND (data->>'domReady')::float <= ${MAX_PERF_METRIC_MS})::int,
        MIN((data->>'domReady')::bigint) FILTER (
          WHERE type = 'performance' AND sub_type = 'load'
            AND (data->>'domReady')::float > 0 AND (data->>'domReady')::float <= ${MAX_PERF_METRIC_MS}
        ),
        MAX((data->>'domReady')::bigint) FILTER (
          WHERE type = 'performance' AND sub_type = 'load'
            AND (data->>'domReady')::float > 0 AND (data->>'domReady')::float <= ${MAX_PERF_METRIC_MS}
        ),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'load'
          AND (data->>'ttfb')::float > 0 AND (data->>'ttfb')::float <= ${MAX_PERF_METRIC_MS}
          THEN (data->>'ttfb')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'load'
          AND (data->>'ttfb')::float > 0 AND (data->>'ttfb')::float <= ${MAX_PERF_METRIC_MS})::int,
        MIN((data->>'ttfb')::bigint) FILTER (
          WHERE type = 'performance' AND sub_type = 'load'
            AND (data->>'ttfb')::float > 0 AND (data->>'ttfb')::float <= ${MAX_PERF_METRIC_MS}
        ),
        MAX((data->>'ttfb')::bigint) FILTER (
          WHERE type = 'performance' AND sub_type = 'load'
            AND (data->>'ttfb')::float > 0 AND (data->>'ttfb')::float <= ${MAX_PERF_METRIC_MS}
        ),
        COALESCE(SUM(CASE WHEN type = 'performance' AND sub_type = 'spa_lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}
          THEN (data->>'value')::bigint ELSE 0 END), 0)::bigint,
        COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'spa_lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS})::int,
        MIN((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'spa_lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        MAX((data->>'value')::bigint) FILTER (WHERE type = 'performance' AND sub_type = 'spa_lcp'
          AND (data->>'value')::float > 0 AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}),
        (
          COUNT(*) FILTER (WHERE type = 'performance' AND sub_type = 'over_budget')
          + COUNT(*) FILTER (
              WHERE type = 'performance'
                AND sub_type IN ('fcp', 'lcp', 'load', 'spa_lcp')
                AND (data->>'value')::float > ${MAX_PERF_METRIC_MS}
            )
        )::int
      FROM events
      GROUP BY app_id, to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')
    `, []);
        await clientQuery(client, `
      INSERT INTO event_daily_error_types (app_id, date, sub_type, count)
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        COALESCE(NULLIF(TRIM(sub_type), ''), 'manual'),
        COUNT(*)::int
      FROM events
      WHERE type = 'error'
      GROUP BY 1, 2, 3
    `, []);
        await clientQuery(client, `
      INSERT INTO event_daily_visitors (app_id, date, visitor_id)
      SELECT DISTINCT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        visitor_id
      FROM events
      WHERE type = 'behavior' AND sub_type = 'pv'
        AND visitor_id IS NOT NULL AND TRIM(visitor_id) != ''
      ON CONFLICT DO NOTHING
    `, []);
        // 小时聚合：fcp / lcp / load
        await clientQuery(client, `
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
      WHERE type = 'performance' AND sub_type IN ('fcp', 'lcp', 'load', 'spa_lcp')
        AND (data->>'value')::float > 0
        AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}
      GROUP BY 1, 2, 3
    `, []);
        // 小时聚合：dom_ready / ttfb（嵌在 load）
        await clientQuery(client, `
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
        AND (data->>'domReady')::float > 0
        AND (data->>'domReady')::float <= ${MAX_PERF_METRIC_MS}
      GROUP BY 1, 2
    `, []);
        await clientQuery(client, `
      INSERT INTO event_hourly_perf (
        app_id, hour_start, metric, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        date_trunc('hour', to_timestamp(timestamp / 1000.0))::timestamp,
        'ttfb',
        COALESCE(SUM((data->>'ttfb')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'ttfb')::bigint),
        MAX((data->>'ttfb')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type = 'load'
        AND (data->>'ttfb')::float > 0
        AND (data->>'ttfb')::float <= ${MAX_PERF_METRIC_MS}
      GROUP BY 1, 2
    `, []);
        // URL 日聚合：fcp / lcp / load / spa_lcp
        await clientQuery(client, `
      INSERT INTO event_daily_perf_urls (
        app_id, date, metric, url, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        sub_type,
        ${SQL_NORMALIZE_PAGE_URL},
        COALESCE(SUM((data->>'value')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'value')::bigint),
        MAX((data->>'value')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type IN ('fcp', 'lcp', 'load', 'spa_lcp')
        AND (data->>'value')::float > 0
        AND (data->>'value')::float <= ${MAX_PERF_METRIC_MS}
      GROUP BY 1, 2, 3, 4
    `, []);
        await clientQuery(client, `
      INSERT INTO event_daily_perf_urls (
        app_id, date, metric, url, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        'dom_ready',
        ${SQL_NORMALIZE_PAGE_URL},
        COALESCE(SUM((data->>'domReady')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'domReady')::bigint),
        MAX((data->>'domReady')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type = 'load'
        AND (data->>'domReady')::float > 0
        AND (data->>'domReady')::float <= ${MAX_PERF_METRIC_MS}
      GROUP BY 1, 2, 4
    `, []);
        await clientQuery(client, `
      INSERT INTO event_daily_perf_urls (
        app_id, date, metric, url, value_sum, value_count, value_min, value_max
      )
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        'ttfb',
        ${SQL_NORMALIZE_PAGE_URL},
        COALESCE(SUM((data->>'ttfb')::bigint), 0)::bigint,
        COUNT(*)::int,
        MIN((data->>'ttfb')::bigint),
        MAX((data->>'ttfb')::bigint)
      FROM events
      WHERE type = 'performance' AND sub_type = 'load'
        AND (data->>'ttfb')::float > 0
        AND (data->>'ttfb')::float <= ${MAX_PERF_METRIC_MS}
      GROUP BY 1, 2, 4
    `, []);
        // 行为：按 URL 日 PV
        await clientQuery(client, `
      INSERT INTO event_daily_pv_urls (app_id, date, url, pv)
      SELECT
        app_id,
        to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')::date,
        ${SQL_NORMALIZE_PAGE_URL},
        COUNT(*)::int
      FROM events
      WHERE type = 'behavior' AND sub_type = 'pv'
      GROUP BY 1, 2, 3
    `, []);
        // 行为 + 稳定性：按小时聚合
        await clientQuery(client, `
      INSERT INTO event_hourly_stats (
        app_id, hour_start,
        js_errors, resource_errors, api_errors, blank_screens,
        not_found_404, other_issues, pv, clicks,
        stay_duration_sum, stay_count
      )
      SELECT
        app_id,
        date_trunc('hour', to_timestamp(timestamp / 1000.0))::timestamp,
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
          AND (data->>'duration') IS NOT NULL)::int
      FROM events
      GROUP BY 1, 2
      HAVING
        COUNT(*) FILTER (WHERE type = 'error' AND sub_type IN ('js', 'promise')) > 0
        OR COUNT(*) FILTER (WHERE type = 'resource') > 0
        OR COUNT(*) FILTER (WHERE type = 'api') > 0
        OR COUNT(*) FILTER (WHERE type = 'blank') > 0
        OR COUNT(*) FILTER (
          WHERE type = 'error' AND (
            sub_type IS NULL OR sub_type NOT IN ('js', 'promise')
          )
        ) > 0
        OR COUNT(*) FILTER (WHERE type = 'behavior' AND sub_type = 'pv') > 0
        OR COUNT(*) FILTER (WHERE type = 'behavior' AND sub_type = 'stay') > 0
    `, []);
        await clientQuery(client, `
      INSERT INTO event_hourly_visitors (app_id, hour_start, visitor_id)
      SELECT DISTINCT
        app_id,
        date_trunc('hour', to_timestamp(timestamp / 1000.0))::timestamp,
        visitor_id
      FROM events
      WHERE type = 'behavior' AND sub_type = 'pv'
        AND visitor_id IS NOT NULL AND TRIM(visitor_id) <> ''
    `, []);
    });
}
//# sourceMappingURL=dailyStats.js.map