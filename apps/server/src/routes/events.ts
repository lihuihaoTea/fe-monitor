import { Router } from 'express';
import { db } from '../db/index.js';
import {
  EVENT_CATEGORIES,
  PRESET_SUB_TYPES,
  categoryWhereSql,
  mapEventRow,
  parseLatestLimit,
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

/**
 * GET /api/events/sub-types
 * 某分类下的类型筛选项（库中 distinct + 预定义兜底）
 */
eventsRouter.get('/sub-types', (req, res) => {
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

    const rows = db
      .prepare(
        `SELECT DISTINCT sub_type as subType
         FROM events
         WHERE app_id = ? AND ${whereCategory}
           AND timestamp >= ? AND timestamp <= ?
           AND sub_type IS NOT NULL AND TRIM(sub_type) != ''
         ORDER BY sub_type ASC`
      )
      .all(appId, start, end) as Array<{ subType: string }>;

    const fromDb = rows.map((r) => r.subType).filter(Boolean);
    const merged = Array.from(new Set([...PRESET_SUB_TYPES[category], ...fromDb]));

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
 * 单列表查询，支持类型 / 信息关键词 / 页面关键词
 */
eventsRouter.get('/latest', (req, res) => {
  try {
    const { appId, startDate, endDate, subType } = req.query;
    const category = parseCategory(req.query.category);
    const messageKeyword = queryString(req.query.messageKeyword);
    const urlKeyword = queryString(req.query.urlKeyword);
    const limit = parseLatestLimit(req.query.limit ?? req.query.latestLimit);

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
      // 信息列来源：error.message / resourceUrl / apiUrl 等，统一对 data + 展示字段模糊匹配
      conditions.push(`(
        CAST(json_extract(data, '$.message') AS TEXT) LIKE ?
        OR CAST(json_extract(data, '$.resourceUrl') AS TEXT) LIKE ?
        OR CAST(json_extract(data, '$.apiUrl') AS TEXT) LIKE ?
        OR CAST(json_extract(data, '$.error') AS TEXT) LIKE ?
        OR CAST(json_extract(data, '$.statusText') AS TEXT) LIKE ?
        OR CAST(data AS TEXT) LIKE ?
      )`);
      const like = `%${messageKeyword}%`;
      params.push(like, like, like, like, like, like);
    }

    if (urlKeyword) {
      conditions.push('url LIKE ?');
      params.push(`%${urlKeyword}%`);
    }

    const rows = db
      .prepare(
        `SELECT id, type, sub_type, timestamp, url, data
         FROM events
         WHERE ${conditions.join(' AND ')}
         ORDER BY timestamp DESC
         LIMIT ${limit}`
      )
      .all(...params) as Array<{
      id: number;
      type: string;
      sub_type: string | null;
      timestamp: number;
      url: string;
      data: string | null;
    }>;

    res.json({
      category,
      limit,
      filters: {
        subType: subTypeValue || null,
        messageKeyword: messageKeyword || null,
        urlKeyword: urlKeyword || null,
      },
      list: rows.map(mapEventRow),
      total: rows.length,
    });
  } catch (error) {
    console.error('Latest events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
