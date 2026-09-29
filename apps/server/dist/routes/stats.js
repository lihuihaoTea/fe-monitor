import { Router } from 'express';
import { db } from '../db/index.js';
import { JS_ERROR_SQL, NOT_FOUND_SQL, OTHER_ISSUE_SQL, parseRangeBound, } from './eventQuery.js';
export const statsRouter = Router();
/**
 * GET /api/stats
 * 看板汇总：指标 + 趋势 + 错误类型分布（不含最新列表，列表走 /api/events）
 */
statsRouter.get('/', (req, res) => {
    try {
        const { appId, startDate, endDate } = req.query;
        if (!appId) {
            return res.status(400).json({ error: 'appId is required' });
        }
        const start = parseRangeBound(startDate, 'start');
        const end = parseRangeBound(endDate, 'end');
        const errorStats = db
            .prepare(`SELECT sub_type, COUNT(*) as count
         FROM events
         WHERE app_id = ? AND ${JS_ERROR_SQL} AND timestamp >= ? AND timestamp <= ?
         GROUP BY sub_type`)
            .all(appId, start, end);
        const resourceErrors = db
            .prepare(`SELECT COUNT(*) as count FROM events
         WHERE app_id = ? AND type = 'resource' AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const apiErrors = db
            .prepare(`SELECT COUNT(*) as count FROM events
         WHERE app_id = ? AND type = 'api' AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const blankScreens = db
            .prepare(`SELECT COUNT(*) as count FROM events
         WHERE app_id = ? AND type = 'blank' AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const notFound404 = db
            .prepare(`SELECT COUNT(*) as count FROM events
         WHERE app_id = ? AND ${NOT_FOUND_SQL} AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const otherIssues = db
            .prepare(`SELECT COUNT(*) as count FROM events
         WHERE app_id = ? AND ${OTHER_ISSUE_SQL} AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const performanceMetrics = db
            .prepare(`SELECT sub_type as metric,
                AVG(CAST(json_extract(data, '$.value') AS REAL)) as avg_value
         FROM events
         WHERE app_id = ? AND type = 'performance' AND timestamp >= ? AND timestamp <= ?
         GROUP BY sub_type`)
            .all(appId, start, end);
        const pvCount = db
            .prepare(`SELECT COUNT(*) as count FROM events
         WHERE app_id = ? AND type = 'behavior' AND sub_type = 'pv'
           AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const avgStay = db
            .prepare(`SELECT AVG(CAST(json_extract(data, '$.duration') AS REAL)) as avg_duration
         FROM events
         WHERE app_id = ? AND type = 'behavior' AND sub_type = 'stay'
           AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const clickStats = db
            .prepare(`SELECT SUM(CAST(json_extract(data, '$.clickCount') AS INTEGER)) as total_clicks
         FROM events
         WHERE app_id = ? AND type = 'behavior' AND sub_type = 'stay'
           AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const uvCount = db
            .prepare(`SELECT COUNT(DISTINCT client_ip) as count FROM events
         WHERE app_id = ? AND timestamp >= ? AND timestamp <= ?`)
            .get(appId, start, end);
        const dailyStats = db
            .prepare(`SELECT
          date(timestamp / 1000, 'unixepoch', 'localtime') as date,
          COUNT(CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN 1 END) as pv,
          COUNT(DISTINCT CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN visitor_id END) as uv,
          COUNT(CASE WHEN ${JS_ERROR_SQL} THEN 1 END) as errors,
          COUNT(CASE WHEN type = 'resource' THEN 1 END) as resourceErrors,
          COUNT(CASE WHEN type = 'api' THEN 1 END) as apiErrors,
          COUNT(CASE WHEN type = 'blank' THEN 1 END) as blankScreens,
          COUNT(CASE WHEN ${NOT_FOUND_SQL} THEN 1 END) as notFound404,
          COUNT(CASE WHEN ${OTHER_ISSUE_SQL} THEN 1 END) as otherIssues,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'fcp'
            THEN CAST(json_extract(data, '$.value') AS REAL) END) as fcp,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'lcp'
            THEN CAST(json_extract(data, '$.value') AS REAL) END) as lcp,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'load'
            THEN CAST(json_extract(data, '$.value') AS REAL) END) as load,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'domReady'
            THEN CAST(json_extract(data, '$.value') AS REAL) END) as domReady,
          AVG(CASE WHEN type = 'behavior' AND sub_type = 'stay'
            THEN CAST(json_extract(data, '$.duration') AS REAL) END) as avgStay,
          SUM(CASE WHEN type = 'behavior' AND sub_type = 'stay'
            THEN CAST(json_extract(data, '$.clickCount') AS INTEGER) ELSE 0 END) as clicks
        FROM events
        WHERE app_id = ? AND timestamp >= ? AND timestamp <= ?
        GROUP BY date
        ORDER BY date ASC
        LIMIT 90`)
            .all(appId, start, end)
            .map((row) => ({
            date: row.date,
            pv: row.pv || 0,
            uv: row.uv || 0,
            errors: row.errors || 0,
            resourceErrors: row.resourceErrors || 0,
            apiErrors: row.apiErrors || 0,
            blankScreens: row.blankScreens || 0,
            notFound404: row.notFound404 || 0,
            otherIssues: row.otherIssues || 0,
            fcp: Math.round(row.fcp || 0),
            lcp: Math.round(row.lcp || 0),
            load: Math.round(row.load || 0),
            domReady: Math.round(row.domReady || 0),
            avgStay: Math.round(row.avgStay || 0),
            clicks: row.clicks || 0,
        }));
        res.json({
            errors: {
                total: errorStats.reduce((sum, item) => sum + item.count, 0),
                byType: errorStats,
            },
            stability: {
                resourceErrors: resourceErrors.count,
                apiErrors: apiErrors.count,
                blankScreens: blankScreens.count,
                notFound404: notFound404.count,
                otherIssues: otherIssues.count,
            },
            performance: performanceMetrics.reduce((acc, item) => {
                acc[item.metric] = Math.round(item.avg_value || 0);
                return acc;
            }, {}),
            behavior: {
                pv: pvCount.count,
                uv: uvCount.count,
                avgStay: Math.round(avgStay.avg_duration || 0),
                totalClicks: clickStats.total_clicks || 0,
            },
            daily: dailyStats,
        });
    }
    catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
//# sourceMappingURL=stats.js.map