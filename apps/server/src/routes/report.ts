import { Router } from 'express';
import { db } from '../db/index.js';

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
  const botPatterns = [
    /bot/i, /spider/i, /crawler/i, /curl/i, /wget/i,
    /python/i, /java/i, /http/i, /scraper/i
  ];
  return botPatterns.some(pattern => pattern.test(userAgent));
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

reportRouter.post('/', (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Invalid events' });
    }

    const clientIp = req.headers['x-forwarded-for'] as string || 
                     req.socket.remoteAddress || 
                     'unknown';

    const stmt = db.prepare(`
      INSERT INTO events (
        type, sub_type, timestamp, app_id, session_id, visitor_id,
        url, user_agent, client_ip, data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    let inserted = 0;

    for (const event of events) {
      if (!validateEvent(event)) continue;
      
      const userAgent = event.userAgent || '';
      if (isBot(userAgent)) continue;

      try {
        stmt.run(
          event.type,
          event.subType || null,
          event.timestamp,
          event.appId,
          event.sessionId,
          event.visitorId,
          event.url,
          userAgent,
          clientIp,
          JSON.stringify(event.data),
          now
        );
        inserted++;
      } catch (err) {
        console.error('Insert error:', err);
      }
    }

    res.json({ success: true, inserted });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
