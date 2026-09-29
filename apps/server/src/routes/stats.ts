import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import {
  JS_ERROR_SQL,
  NOT_FOUND_SQL,
  OTHER_ISSUE_SQL,
  parseRangeBound,
} from './eventQuery.js';

export const statsRouter = Router();

/**
 * GET /api/stats
 * 看板汇总：指标 + 趋势 + 错误类型分布（不含最新列表，列表走 /api/events）
 */
statsRouter.get('/', async (req, res) => {
  try {
    const { appId, startDate, endDate } = req.query;

    if (!appId || typeof appId !== 'string') {
      return res.status(400).json({ error: 'appId is required' });
    }

    const start = parseRangeBound(startDate, 'start');
    const end = parseRangeBound(endDate, 'end');
    const rangeParams = [appId, start, end];

    const errorStats = await query<{ sub_type: string; count: string | number }>(
      `SELECT sub_type, COUNT(*)::int as count
       FROM events
       WHERE app_id = ? AND ${JS_ERROR_SQL} AND timestamp >= ? AND timestamp <= ?
       GROUP BY sub_type`,
      rangeParams
    );

    const resourceErrors = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*)::int as count FROM events
       WHERE app_id = ? AND type = 'resource' AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const apiErrors = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*)::int as count FROM events
       WHERE app_id = ? AND type = 'api' AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const blankScreens = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*)::int as count FROM events
       WHERE app_id = ? AND type = 'blank' AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const notFound404 = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*)::int as count FROM events
       WHERE app_id = ? AND ${NOT_FOUND_SQL} AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const otherIssues = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*)::int as count FROM events
       WHERE app_id = ? AND ${OTHER_ISSUE_SQL} AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const performanceMetrics = await query<{
      metric: string;
      avg_value: string | number | null;
    }>(
      `SELECT sub_type as metric,
              AVG((data->>'value')::float) as avg_value
       FROM events
       WHERE app_id = ? AND type = 'performance' AND timestamp >= ? AND timestamp <= ?
       GROUP BY sub_type`,
      rangeParams
    );

    // SDK 将 domReady 嵌在 load 事件的 data.domReady，无独立 sub_type
    const domReadyAvg = await queryOne<{ avg_value: string | number | null }>(
      `SELECT AVG((data->>'domReady')::float) as avg_value
       FROM events
       WHERE app_id = ? AND type = 'performance' AND sub_type = 'load'
         AND timestamp >= ? AND timestamp <= ?
         AND data->>'domReady' IS NOT NULL`,
      rangeParams
    );

    const pvCount = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*)::int as count FROM events
       WHERE app_id = ? AND type = 'behavior' AND sub_type = 'pv'
         AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const avgStay = await queryOne<{ avg_duration: string | number | null }>(
      `SELECT AVG((data->>'duration')::float) as avg_duration
       FROM events
       WHERE app_id = ? AND type = 'behavior' AND sub_type = 'stay'
         AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const clickStats = await queryOne<{ total_clicks: string | number | null }>(
      `SELECT COALESCE(SUM((data->>'clickCount')::int), 0)::int as total_clicks
       FROM events
       WHERE app_id = ? AND type = 'behavior' AND sub_type = 'stay'
         AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    const uvCount = await queryOne<{ count: string | number }>(
      `SELECT COUNT(DISTINCT client_ip)::int as count FROM events
       WHERE app_id = ? AND timestamp >= ? AND timestamp <= ?`,
      rangeParams
    );

    // 驼峰别名必须双引号，否则 pg 会折成小写（resourceErrors → resourceerrors）
    const dailyRows = await query<Record<string, any>>(
      `SELECT
          to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD') as date,
          COUNT(CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN 1 END)::int as pv,
          COUNT(DISTINCT CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN visitor_id END)::int as uv,
          COUNT(CASE WHEN ${JS_ERROR_SQL} THEN 1 END)::int as errors,
          COUNT(CASE WHEN type = 'resource' THEN 1 END)::int as "resourceErrors",
          COUNT(CASE WHEN type = 'api' THEN 1 END)::int as "apiErrors",
          COUNT(CASE WHEN type = 'blank' THEN 1 END)::int as "blankScreens",
          COUNT(CASE WHEN ${NOT_FOUND_SQL} THEN 1 END)::int as "notFound404",
          COUNT(CASE WHEN ${OTHER_ISSUE_SQL} THEN 1 END)::int as "otherIssues",
          AVG(CASE WHEN type = 'performance' AND sub_type = 'fcp'
            THEN (data->>'value')::float END) as fcp,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'lcp'
            THEN (data->>'value')::float END) as lcp,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'load'
            THEN (data->>'value')::float END) as load,
          AVG(CASE WHEN type = 'performance' AND sub_type = 'load'
            THEN (data->>'domReady')::float END) as "domReady",
          AVG(CASE WHEN type = 'behavior' AND sub_type = 'stay'
            THEN (data->>'duration')::float END) as "avgStay",
          COALESCE(SUM(CASE WHEN type = 'behavior' AND sub_type = 'stay'
            THEN (data->>'clickCount')::int ELSE 0 END), 0)::int as clicks
        FROM events
        WHERE app_id = ? AND timestamp >= ? AND timestamp <= ?
        GROUP BY to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD')
        ORDER BY date ASC
        LIMIT 90`,
      rangeParams
    );

    const num = (row: Record<string, any>, key: string) =>
      Number(row[key] ?? row[key.toLowerCase()]) || 0;

    const dailyStats = dailyRows.map((row) => ({
      date: row.date,
      pv: num(row, 'pv'),
      uv: num(row, 'uv'),
      errors: num(row, 'errors'),
      resourceErrors: num(row, 'resourceErrors'),
      apiErrors: num(row, 'apiErrors'),
      blankScreens: num(row, 'blankScreens'),
      notFound404: num(row, 'notFound404'),
      otherIssues: num(row, 'otherIssues'),
      fcp: Math.round(num(row, 'fcp')),
      lcp: Math.round(num(row, 'lcp')),
      load: Math.round(num(row, 'load')),
      domReady: Math.round(num(row, 'domReady')),
      avgStay: Math.round(num(row, 'avgStay')),
      clicks: num(row, 'clicks'),
    }));

    const n = (v: string | number | null | undefined) => Number(v) || 0;

    res.json({
      errors: {
        total: errorStats.reduce((sum, item) => sum + n(item.count), 0),
        byType: errorStats.map((item) => ({
          sub_type: item.sub_type,
          count: n(item.count),
        })),
      },
      stability: {
        resourceErrors: n(resourceErrors?.count),
        apiErrors: n(apiErrors?.count),
        blankScreens: n(blankScreens?.count),
        notFound404: n(notFound404?.count),
        otherIssues: n(otherIssues?.count),
      },
      performance: (() => {
        const perf = performanceMetrics.reduce(
          (acc: Record<string, number>, item) => {
            acc[item.metric] = Math.round(n(item.avg_value));
            return acc;
          },
          {}
        );
        perf.domReady = Math.round(n(domReadyAvg?.avg_value));
        return perf;
      })(),
      behavior: {
        pv: n(pvCount?.count),
        uv: n(uvCount?.count),
        avgStay: Math.round(n(avgStay?.avg_duration)),
        totalClicks: n(clickStats?.total_clicks),
      },
      daily: dailyStats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
