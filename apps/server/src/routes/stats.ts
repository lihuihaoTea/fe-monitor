import { Router } from 'express';
import { db } from '../db/index.js';

export const statsRouter = Router();

/** 页面 404：monitor.error('404') → sub_type=404 或 data.message=404 */
const NOT_FOUND_SQL = `(
  type = 'error' AND (
    sub_type = '404'
    OR CAST(json_extract(data, '$.message') AS TEXT) = '404'
  )
)`;

const JS_ERROR_SQL = `(
  type = 'error' AND NOT (
    sub_type = '404'
    OR CAST(json_extract(data, '$.message') AS TEXT) = '404'
  )
)`;

function parseRangeBound(value: unknown, bound: 'start' | 'end'): number {
  if (typeof value !== 'string' || value.length === 0) {
    return bound === 'start' ? 0 : Date.now();
  }

  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dayOnly) {
    const year = Number(dayOnly[1]);
    const month = Number(dayOnly[2]) - 1;
    const day = Number(dayOnly[3]);
    return bound === 'start'
      ? new Date(year, month, day, 0, 0, 0, 0).getTime()
      : new Date(year, month, day, 23, 59, 59, 999).getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? (bound === 'start' ? 0 : Date.now()) : parsed;
}

statsRouter.get('/', (req, res) => {
  try {
    const { appId, startDate, endDate } = req.query;

    if (!appId) {
      return res.status(400).json({ error: 'appId is required' });
    }

    const start = parseRangeBound(startDate, 'start');
    const end = parseRangeBound(endDate, 'end');

    const errorStats = db.prepare(`
      SELECT 
        sub_type,
        COUNT(*) as count
      FROM events
      WHERE app_id = ? AND ${JS_ERROR_SQL} AND timestamp >= ? AND timestamp <= ?
      GROUP BY sub_type
    `).all(appId, start, end);

    const resourceErrors = db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE app_id = ? AND type = 'resource' AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { count: number };

    const apiErrors = db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE app_id = ? AND type = 'api' AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { count: number };

    const blankScreens = db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE app_id = ? AND type = 'blank' AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { count: number };

    const notFound404 = db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE app_id = ? AND ${NOT_FOUND_SQL} AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { count: number };

    const performanceMetrics = db.prepare(`
      SELECT 
        sub_type as metric,
        AVG(CAST(json_extract(data, '$.value') AS REAL)) as avg_value
      FROM events
      WHERE app_id = ? AND type = 'performance' AND timestamp >= ? AND timestamp <= ?
      GROUP BY sub_type
    `).all(appId, start, end);

    const pvCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE app_id = ? AND type = 'behavior' AND sub_type = 'pv' AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { count: number };

    const avgStay = db.prepare(`
      SELECT AVG(CAST(json_extract(data, '$.duration') AS REAL)) as avg_duration
      FROM events
      WHERE app_id = ? AND type = 'behavior' AND sub_type = 'stay' AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { avg_duration: number };

    const clickStats = db.prepare(`
      SELECT SUM(CAST(json_extract(data, '$.clickCount') AS INTEGER)) as total_clicks
      FROM events
      WHERE app_id = ? AND type = 'behavior' AND sub_type = 'stay' AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { total_clicks: number };

    const uvCount = db.prepare(`
      SELECT COUNT(DISTINCT client_ip) as count
      FROM events
      WHERE app_id = ? AND timestamp >= ? AND timestamp <= ?
    `).get(appId, start, end) as { count: number };

    const dailyStats = db.prepare(`
      SELECT 
        date(timestamp / 1000, 'unixepoch', 'localtime') as date,
        COUNT(CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN 1 END) as pv,
        COUNT(DISTINCT CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN visitor_id END) as uv,
        COUNT(CASE WHEN ${JS_ERROR_SQL} THEN 1 END) as errors,
        COUNT(CASE WHEN type = 'resource' THEN 1 END) as resourceErrors,
        COUNT(CASE WHEN type = 'api' THEN 1 END) as apiErrors,
        COUNT(CASE WHEN type = 'blank' THEN 1 END) as blankScreens,
        COUNT(CASE WHEN ${NOT_FOUND_SQL} THEN 1 END) as notFound404,
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
      LIMIT 90
    `).all(appId, start, end).map((row: any) => ({
      date: row.date,
      pv: row.pv || 0,
      uv: row.uv || 0,
      errors: row.errors || 0,
      resourceErrors: row.resourceErrors || 0,
      apiErrors: row.apiErrors || 0,
      blankScreens: row.blankScreens || 0,
      notFound404: row.notFound404 || 0,
      fcp: Math.round(row.fcp || 0),
      lcp: Math.round(row.lcp || 0),
      load: Math.round(row.load || 0),
      domReady: Math.round(row.domReady || 0),
      avgStay: Math.round(row.avgStay || 0),
      clicks: row.clicks || 0,
    }));

    const LATEST_LIMIT_OPTIONS = [20, 50, 100, 200];
    const parsedLimit = Number(req.query.latestLimit);
    const latestLimit = LATEST_LIMIT_OPTIONS.includes(parsedLimit) ? parsedLimit : 20;

    const latestStmt = db.prepare(`
      SELECT id, type, sub_type, timestamp, url, data
      FROM events
      WHERE app_id = ? AND type = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const latestJsErrors = db
      .prepare(
        `SELECT id, type, sub_type, timestamp, url, data
         FROM events
         WHERE app_id = ? AND ${JS_ERROR_SQL} AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(appId, start, end, latestLimit);

    const latest404 = db
      .prepare(
        `SELECT id, type, sub_type, timestamp, url, data
         FROM events
         WHERE app_id = ? AND ${NOT_FOUND_SQL} AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(appId, start, end, latestLimit);

    const mapLatest = (rows: any[]) =>
      rows.map((row) => {
        let payload: any = {};
        try {
          payload = row.data ? JSON.parse(row.data) : {};
        } catch {
          payload = {};
        }

        let message = '';
        if (row.type === 'error') {
          if (row.sub_type === '404' || payload.message === '404') {
            message = '页面路由未找到 (404)';
          } else {
            message =
              payload.message ||
              payload.reason?.message ||
              payload.error?.message ||
              payload.reason ||
              '未知错误';
          }
        } else if (row.type === 'resource') {
          message = payload.resourceUrl || payload.tagName || '资源加载失败';
        } else if (row.type === 'api') {
          const status = payload.status ? `HTTP ${payload.status}` : '';
          const err = payload.error || payload.statusText || '';
          message = [String(payload.apiUrl || payload.url || ''), status, err]
            .filter(Boolean)
            .join(' · ') || 'API 请求失败';
        }

        return {
          id: row.id,
          type: row.type,
          subType: row.sub_type || '',
          timestamp: row.timestamp || 0,
          url: row.url || '',
          message: String(message),
          data: payload,
        };
      });

    const latest = {
      jsErrors: mapLatest(latestJsErrors),
      resourceErrors: mapLatest(latestStmt.all(appId, 'resource', start, end, latestLimit)),
      apiErrors: mapLatest(latestStmt.all(appId, 'api', start, end, latestLimit)),
      notFound404: mapLatest(latest404),
    };

    res.json({
      errors: {
        total: errorStats.reduce((sum: number, item: any) => sum + item.count, 0),
        byType: errorStats,
      },
      stability: {
        resourceErrors: resourceErrors.count,
        apiErrors: apiErrors.count,
        blankScreens: blankScreens.count,
        notFound404: notFound404.count,
      },
      performance: performanceMetrics.reduce((acc: any, item: any) => {
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
      latest,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
