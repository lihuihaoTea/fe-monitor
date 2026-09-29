import { Router } from 'express';
import { clientQuery, withTransaction } from '../db/index.js';
import { shouldFilterEvent } from '../filters/eventFilters.js';
export const reportRouter = Router();
function isBot(userAgent) {
    const botPatterns = [
        /bot/i,
        /spider/i,
        /crawler/i,
        /curl/i,
        /wget/i,
        /python/i,
        /java/i,
        /http/i,
        /scraper/i,
    ];
    return botPatterns.some((pattern) => pattern.test(userAgent));
}
function validateEvent(event) {
    return (event &&
        typeof event.type === 'string' &&
        typeof event.timestamp === 'number' &&
        typeof event.appId === 'string' &&
        typeof event.sessionId === 'string' &&
        typeof event.visitorId === 'string' &&
        typeof event.url === 'string');
}
reportRouter.post('/', async (req, res) => {
    try {
        const { events } = req.body;
        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({ error: 'Invalid events' });
        }
        const clientIp = req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            'unknown';
        const now = Date.now();
        let inserted = 0;
        let filtered = 0;
        const toInsert = [];
        for (const event of events) {
            if (!validateEvent(event))
                continue;
            const userAgent = event.userAgent || '';
            if (isBot(userAgent))
                continue;
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
                data: JSON.stringify(event.data ?? {}),
                createdAt: now,
            });
        }
        if (toInsert.length > 0) {
            await withTransaction(async (client) => {
                for (const row of toInsert) {
                    try {
                        await clientQuery(client, `INSERT INTO events (
                type, sub_type, timestamp, app_id, session_id, visitor_id,
                url, user_agent, client_ip, data, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`, [
                            row.type,
                            row.subType,
                            row.timestamp,
                            row.appId,
                            row.sessionId,
                            row.visitorId,
                            row.url,
                            row.userAgent,
                            row.clientIp,
                            row.data,
                            row.createdAt,
                        ]);
                        inserted++;
                    }
                    catch (err) {
                        console.error('Insert error:', err);
                    }
                }
            });
        }
        res.json({ success: true, inserted, filtered });
    }
    catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
//# sourceMappingURL=report.js.map