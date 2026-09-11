import { Router } from 'express';
import { db } from '../db/index.js';

export const statsRouter = Router();

statsRouter.get('/', (req, res) => {
  try {
    const { appId, startDate, endDate } = req.query;

    if (!appId) {
      return res.status(400).json({ error: 'appId is required' });
    }

    const start = startDate ? new Date(startDate as string).getTime() : 0;
    const end = endDate ? new Date(endDate as string).getTime() : Date.now();

    const errorStats = db.prepare(`
      SELECT 
        sub_type,
        COUNT(*) as count
      FROM events
      WHERE app_id = ? AND type = 'error' AND timestamp >= ? AND timestamp <= ?
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
        date(timestamp / 1000, 'unixepoch') as date,
        COUNT(DISTINCT CASE WHEN type = 'behavior' AND sub_type = 'pv' THEN id END) as pv,
        COUNT(DISTINCT CASE WHEN type = 'error' THEN id END) as errors,
        COUNT(DISTINCT client_ip) as uv
      FROM events
      WHERE app_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `).all(appId, start, end);

    res.json({
      errors: {
        total: errorStats.reduce((sum: number, item: any) => sum + item.count, 0),
        byType: errorStats,
      },
      stability: {
        resourceErrors: resourceErrors.count,
        apiErrors: apiErrors.count,
        blankScreens: blankScreens.count,
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
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
