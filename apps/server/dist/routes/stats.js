import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import { parseRangeBound } from './eventQuery.js';
export const statsRouter = Router();
const n = (v) => Number(v) || 0;
const CACHE_TTL_MS = Number(process.env.STATS_CACHE_TTL_MS) || 45000;
const statsCache = new Map();
function cacheKey(appId, startDate, endDate) {
    return `${appId}|${String(startDate || '')}|${String(endDate || '')}`;
}
function avg(sum, count) {
    if (!count)
        return 0;
    return Math.round(sum / count);
}
/**
 * GET /api/stats
 * 从日聚合表读取，带短缓存（默认 45s）
 */
statsRouter.get('/', async (req, res) => {
    try {
        const { appId, startDate, endDate } = req.query;
        if (!appId || typeof appId !== 'string') {
            return res.status(400).json({ error: 'appId is required' });
        }
        const key = cacheKey(appId, startDate, endDate);
        const cached = statsCache.get(key);
        if (cached && cached.expires > Date.now()) {
            res.setHeader('X-Stats-Cache', 'HIT');
            return res.json(cached.payload);
        }
        const start = parseRangeBound(startDate, 'start');
        const end = parseRangeBound(endDate, 'end');
        // 聚合表按 DATE；用本地日界对齐 parseRangeBound 的日字符串
        const startDay = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
            ? startDate
            : new Date(start).toISOString().slice(0, 10);
        const endDay = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
            ? endDate
            : new Date(end).toISOString().slice(0, 10);
        const dayParams = [appId, startDay, endDay];
        const [summary, errorTypes, uvRow, dailyRows] = await Promise.all([
            queryOne(`SELECT
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
           COALESCE(SUM(lcp_sum), 0)::bigint as lcp_sum,
           COALESCE(SUM(lcp_count), 0)::int as lcp_count,
           COALESCE(SUM(load_sum), 0)::bigint as load_sum,
           COALESCE(SUM(load_count), 0)::int as load_count,
           COALESCE(SUM(dom_ready_sum), 0)::bigint as dom_ready_sum,
           COALESCE(SUM(dom_ready_count), 0)::int as dom_ready_count
         FROM event_daily_stats
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date`, dayParams),
            query(`SELECT sub_type, SUM(count)::int as count
         FROM event_daily_error_types
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date
           AND sub_type IN ('js', 'promise')
         GROUP BY sub_type
         ORDER BY count DESC`, dayParams),
            queryOne(`SELECT COUNT(DISTINCT visitor_id)::int as count
         FROM event_daily_visitors
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date`, dayParams),
            query(`SELECT
           to_char(s.date, 'YYYY-MM-DD') as date,
           s.js_errors as errors,
           s.resource_errors as "resourceErrors",
           s.api_errors as "apiErrors",
           s.blank_screens as "blankScreens",
           s.not_found_404 as "notFound404",
           s.other_issues as "otherIssues",
           s.pv,
           s.clicks,
           CASE WHEN s.stay_count > 0
             THEN ROUND(s.stay_duration_sum::numeric / s.stay_count)
             ELSE 0 END as "avgStay",
           CASE WHEN s.fcp_count > 0
             THEN ROUND(s.fcp_sum::numeric / s.fcp_count) ELSE 0 END as fcp,
           CASE WHEN s.lcp_count > 0
             THEN ROUND(s.lcp_sum::numeric / s.lcp_count) ELSE 0 END as lcp,
           CASE WHEN s.load_count > 0
             THEN ROUND(s.load_sum::numeric / s.load_count) ELSE 0 END as load,
           CASE WHEN s.dom_ready_count > 0
             THEN ROUND(s.dom_ready_sum::numeric / s.dom_ready_count)
             ELSE 0 END as "domReady",
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
         LIMIT 90`, [...dayParams, ...dayParams]),
        ]);
        const s = summary || {};
        const rowNum = (key) => n(s[key]);
        const daily = dailyRows.map((row) => ({
            date: row.date,
            pv: n(row.pv),
            uv: n(row.uv),
            errors: n(row.errors),
            resourceErrors: n(row.resourceErrors ?? row.resourceerrors),
            apiErrors: n(row.apiErrors ?? row.apierrors),
            blankScreens: n(row.blankScreens ?? row.blankscreens),
            notFound404: n(row.notFound404 ?? row.notfound404),
            otherIssues: n(row.otherIssues ?? row.otherissues),
            fcp: n(row.fcp),
            lcp: n(row.lcp),
            load: n(row.load),
            domReady: n(row.domReady ?? row.domready),
            avgStay: n(row.avgStay ?? row.avgstay),
            clicks: n(row.clicks),
        }));
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
                fcp: avg(rowNum('fcp_sum'), rowNum('fcp_count')),
                lcp: avg(rowNum('lcp_sum'), rowNum('lcp_count')),
                load: avg(rowNum('load_sum'), rowNum('load_count')),
                domReady: avg(rowNum('dom_ready_sum'), rowNum('dom_ready_count')),
            },
            behavior: {
                pv: rowNum('pv'),
                uv: n(uvRow?.count),
                avgStay: avg(rowNum('stay_duration_sum'), rowNum('stay_count')),
                totalClicks: rowNum('clicks'),
            },
            daily,
        };
        statsCache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload });
        // 简单淘汰：过大时清掉过期项
        if (statsCache.size > 200) {
            const now = Date.now();
            for (const [k, v] of statsCache) {
                if (v.expires <= now)
                    statsCache.delete(k);
            }
        }
        res.setHeader('X-Stats-Cache', 'MISS');
        res.json(payload);
    }
    catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/** 供上报后主动失效缓存（同进程） */
export function invalidateStatsCache(appId) {
    if (!appId) {
        statsCache.clear();
        return;
    }
    for (const key of statsCache.keys()) {
        if (key.startsWith(`${appId}|`))
            statsCache.delete(key);
    }
}
//# sourceMappingURL=stats.js.map