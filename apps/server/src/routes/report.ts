import { Router } from 'express';
import { clientQuery, withTransaction } from '../db/index.js';
import { shouldFilterEvent } from '../filters/eventFilters.js';
import {
  applyRollupWithClient,
  refreshPerfP50Targets,
  type PerfP50Target,
} from '../db/dailyStats.js';
import { invalidateStatsCache } from './stats.js';

export const reportRouter = Router();

interface MonitorEvent {
  type: string;
  subType?: string;
  timestamp: number;
  appId: string;
  sessionId: string;
  visitorId: string;
  url: string;
  userAgent: string;
  data: any;
}

function isBot(userAgent: string): boolean {
  // 避免 /http/i、/java/i 等过宽规则误伤真实浏览器 UA
  const botPatterns = [
    /bot\b/i,
    /spider/i,
    /crawler/i,
    /curl\//i,
    /wget\//i,
    /python-requests/i,
    /httpclient/i,
    /scrapy/i,
    /headlesschrome/i,
    /phantomjs/i,
    /slurp/i,
    /bingpreview/i,
  ];
  return botPatterns.some((pattern) => pattern.test(userAgent));
}

function validateEvent(event: any): event is MonitorEvent {
  return (
    event &&
    typeof event.type === 'string' &&
    typeof event.timestamp === 'number' &&
    typeof event.appId === 'string' &&
    typeof event.sessionId === 'string' &&
    typeof event.visitorId === 'string' &&
    typeof event.url === 'string'
  );
}

reportRouter.post('/', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Invalid events' });
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'unknown';

    const now = Date.now();
    let inserted = 0;
    let filtered = 0;
    const touchedApps = new Set<string>();

    const toInsert: Array<{
      type: string;
      subType: string | null;
      timestamp: number;
      appId: string;
      sessionId: string;
      visitorId: string;
      url: string;
      userAgent: string;
      clientIp: string;
      data: Record<string, unknown>;
      createdAt: number;
    }> = [];

    for (const event of events) {
      if (!validateEvent(event)) continue;

      const userAgent = event.userAgent || '';
      if (isBot(userAgent)) continue;

      if (await shouldFilterEvent(event)) {
        filtered++;
        continue;
      }

      toInsert.push({
        type: event.type,
        subType: event.subType || null,
        timestamp: event.timestamp,
        appId: event.appId,
        sessionId: event.sessionId,
        visitorId: event.visitorId,
        url: event.url,
        userAgent,
        clientIp,
        data:
          event.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? event.data
            : { value: event.data },
        createdAt: now,
      });
    }

    if (toInsert.length > 0) {
      await withTransaction(async (client) => {
        const p50Targets: PerfP50Target[] = [];
        for (const row of toInsert) {
          try {
            await clientQuery(
              client,
              `INSERT INTO events (
                type, sub_type, timestamp, app_id, session_id, visitor_id,
                url, user_agent, client_ip, data, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
              [
                row.type,
                row.subType,
                row.timestamp,
                row.appId,
                row.sessionId,
                row.visitorId,
                row.url,
                row.userAgent,
                row.clientIp,
                JSON.stringify(row.data),
                row.createdAt,
              ]
            );

            await applyRollupWithClient(
              client,
              {
                type: row.type,
                subType: row.subType,
                timestamp: row.timestamp,
                appId: row.appId,
                visitorId: row.visitorId,
                url: row.url,
                data: row.data,
              },
              { p50Targets }
            );

            inserted++;
            touchedApps.add(row.appId);
          } catch (err) {
            console.error('Insert error:', err);
          }
        }

        // 批末按日/小时窗口回填 P50，避免读路径扫 events
        await refreshPerfP50Targets(client, p50Targets);
      });

      for (const appId of touchedApps) {
        invalidateStatsCache(appId);
      }
    }

    res.json({ success: true, inserted, filtered });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
