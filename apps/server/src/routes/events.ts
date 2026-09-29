import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import {
  EVENT_CATEGORIES,
  PRESET_SUB_TYPES,
  categoryWhereSql,
  mapEventRow,
  parseLatestLimit,
  parsePage,
  parseRangeBound,
  type EventCategory,
} from './eventQuery.js';

export const eventsRouter = Router();

function parseCategory(raw: unknown): EventCategory | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (EVENT_CATEGORIES as string[]).includes(value)
    ? (value as EventCategory)
    : null;
}

function queryString(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}

const SORT_EXPRESSIONS: Record<string, string> = {
  timestamp: 'timestamp',
  value: `(data->>'value')::float`,
  domReady: `(data->>'domReady')::float`,
};

function parseSortClause(sortByRaw: unknown, sortOrderRaw: unknown): string {
  const sortBy = queryString(sortByRaw);
  const expr = SORT_EXPRESSIONS[sortBy] || SORT_EXPRESSIONS.timestamp;
  const orderRaw = queryString(sortOrderRaw).toLowerCase();
  const order =
    orderRaw === 'ascend' || orderRaw === 'asc' ? 'ASC' : 'DESC';
  if (expr === 'timestamp') {
    return `ORDER BY timestamp ${order}`;
  }
  return `ORDER BY ${expr} ${order} NULLS LAST, timestamp DESC`;
}

/**
 * GET /api/events/sub-types
 */
eventsRouter.get('/sub-types', async (req, res) => {
  try {
    const { appId, startDate, endDate } = req.query;
    const category = parseCategory(req.query.category);

    if (!appId || typeof appId !== 'string') {
      return res.status(400).json({ error: 'appId is required' });
    }
    if (!category) {
      return res.status(400).json({
        error: `category is required (${EVENT_CATEGORIES.join('|')})`,
      });
    }

    const start = parseRangeBound(startDate, 'start');
    const end = parseRangeBound(endDate, 'end');
    const whereCategory = categoryWhereSql(category);

    const rows = await query<{ subtype: string }>(
      `SELECT DISTINCT sub_type as subtype
       FROM events
       WHERE app_id = ? AND ${whereCategory}
         AND timestamp >= ? AND timestamp <= ?
         AND sub_type IS NOT NULL AND TRIM(sub_type) != ''
       ORDER BY subtype ASC`,
      [appId, start, end]
    );

    const fromDb = rows.map((r) => r.subtype).filter(Boolean);
    const merged = Array.from(
      new Set([...PRESET_SUB_TYPES[category], ...fromDb])
    );

    res.json({
      category,
      options: merged.map((value) => ({ value, label: value })),
    });
  } catch (error) {
    console.error('Sub-types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/events/latest
 */
eventsRouter.get('/latest', async (req, res) => {
  try {
    const { appId, startDate, endDate, subType } = req.query;
    const category = parseCategory(req.query.category);
    const messageKeyword = queryString(req.query.messageKeyword);
    const urlKeyword = queryString(req.query.urlKeyword);
    const limit = parseLatestLimit(req.query.limit ?? req.query.latestLimit);
    const page = parsePage(req.query.page);
    const offset = (page - 1) * limit;

    if (!appId || typeof appId !== 'string') {
      return res.status(400).json({ error: 'appId is required' });
    }
    if (!category) {
      return res.status(400).json({
        error: `category is required (${EVENT_CATEGORIES.join('|')})`,
      });
    }

    const start = parseRangeBound(startDate, 'start');
    const end = parseRangeBound(endDate, 'end');
    const whereCategory = categoryWhereSql(category);

    const conditions: string[] = [
      'app_id = ?',
      whereCategory,
      'timestamp >= ?',
      'timestamp <= ?',
    ];
    const params: Array<string | number> = [appId, start, end];

    const subTypeValue = queryString(subType);
    if (subTypeValue) {
      conditions.push('sub_type = ?');
      params.push(subTypeValue);
    }

    if (messageKeyword) {
      conditions.push(`(
        COALESCE(data->>'message', '') LIKE ?
        OR COALESCE(data->>'resourceUrl', '') LIKE ?
        OR COALESCE(data->>'apiUrl', '') LIKE ?
        OR COALESCE(data->>'error', '') LIKE ?
        OR COALESCE(data->>'statusText', '') LIKE ?
        OR data::text LIKE ?
      )`);
      const like = `%${messageKeyword}%`;
      params.push(like, like, like, like, like, like);
    }

    if (urlKeyword) {
      conditions.push('url LIKE ?');
      params.push(`%${urlKeyword}%`);
    }

    const whereSql = conditions.join(' AND ');
    const orderSql = parseSortClause(req.query.sortBy, req.query.sortOrder);

    const totalRow = await queryOne<{ total: string | number }>(
      `SELECT COUNT(*)::int as total FROM events WHERE ${whereSql}`,
      params
    );

    const rows = await query<{
      id: number;
      type: string;
      sub_type: string | null;
      timestamp: string | number;
      url: string;
      data: unknown;
    }>(
      `SELECT id, type, sub_type, timestamp, url, data
       FROM events
       WHERE ${whereSql}
       ${orderSql}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      category,
      page,
      limit,
      total: Number(totalRow?.total) || 0,
      filters: {
        subType: subTypeValue || null,
        messageKeyword: messageKeyword || null,
        urlKeyword: urlKeyword || null,
      },
      list: rows.map(mapEventRow),
    });
  } catch (error) {
    console.error('Latest events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
