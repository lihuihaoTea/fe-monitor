import { Router } from 'express';
import {
  pgErrorCode,
  query,
  queryOne,
  queryOneWithStatementTimeout,
} from '../db/index.js';
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

function parseSort(
  sortByRaw: unknown,
  sortOrderRaw: unknown
): { sortBy: string; order: 'ASC' | 'DESC'; orderSql: string } {
  const sortBy = queryString(sortByRaw) || 'timestamp';
  const expr = SORT_EXPRESSIONS[sortBy] || SORT_EXPRESSIONS.timestamp;
  const orderRaw = queryString(sortOrderRaw).toLowerCase();
  const order =
    orderRaw === 'ascend' || orderRaw === 'asc' ? 'ASC' : 'DESC';
  if (expr === 'timestamp') {
    return {
      sortBy: 'timestamp',
      order,
      orderSql: `ORDER BY timestamp ${order}, id ${order}`,
    };
  }
  return {
    sortBy,
    order,
    orderSql: `ORDER BY ${expr} ${order} NULLS LAST, timestamp DESC, id DESC`,
  };
}

function dayKeyFromBound(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 无关键词筛选时，用日聚合估算 total，避免扫 events COUNT(*) */
async function totalFromDailyStats(
  category: EventCategory,
  appId: string,
  start: number,
  end: number
): Promise<number | null> {
  const startDay = dayKeyFromBound(start);
  const endDay = dayKeyFromBound(end);
  const column =
    category === 'js'
      ? 'js_errors'
      : category === 'resource'
        ? 'resource_errors'
        : category === 'api'
          ? 'api_errors'
          : category === 'other'
            ? 'other_issues'
            : null;
  if (!column) return null;

  const row = await queryOne<{ total: string | number }>(
    `SELECT COALESCE(SUM(${column}), 0)::int as total
     FROM event_daily_stats
     WHERE app_id = ? AND date >= ?::date AND date <= ?::date`,
    [appId, startDay, endDay]
  );
  return Number(row?.total) || 0;
}

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
    const startDay = dayKeyFromBound(start);
    const endDay = dayKeyFromBound(end);

    let fromDb: string[] = [];
    if (category === 'js' || category === 'other') {
      const rows = await query<{ subtype: string }>(
        `SELECT DISTINCT sub_type as subtype
         FROM event_daily_error_types
         WHERE app_id = ? AND date >= ?::date AND date <= ?::date
           AND sub_type IS NOT NULL AND TRIM(sub_type) != ''
         ORDER BY subtype ASC`,
        [appId, startDay, endDay]
      );
      fromDb = rows.map((r) => r.subtype).filter(Boolean);
      if (category === 'js') {
        fromDb = fromDb.filter((s) => s === 'js' || s === 'promise');
      } else {
        fromDb = fromDb.filter((s) => s !== 'js' && s !== 'promise');
      }
    }

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

eventsRouter.get('/latest', async (req, res) => {
  try {
    const { appId, startDate, endDate, subType } = req.query;
    const category = parseCategory(req.query.category);
    const messageKeyword = queryString(req.query.messageKeyword);
    const urlKeyword = queryString(req.query.urlKeyword);
    const limit = parseLatestLimit(req.query.limit ?? req.query.latestLimit);
    const page = parsePage(req.query.page);
    const offset = (page - 1) * limit;
    const { sortBy, order, orderSql } = parseSort(
      req.query.sortBy,
      req.query.sortOrder
    );

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

    const baseConditions: string[] = [
      'app_id = ?',
      whereCategory,
      'timestamp >= ?',
      'timestamp <= ?',
    ];
    const baseParams: Array<string | number> = [appId, start, end];

    const subTypeValue = queryString(subType);
    if (subTypeValue) {
      baseConditions.push('sub_type = ?');
      baseParams.push(subTypeValue);
    }

    if (messageKeyword) {
      // 只查固定 jsonb 路径，避免 data::text LIKE 全表拖垮
      baseConditions.push(`(
        COALESCE(data->>'message', '') LIKE ?
        OR COALESCE(data->>'resourceUrl', '') LIKE ?
        OR COALESCE(data->>'apiUrl', '') LIKE ?
        OR COALESCE(data->>'error', '') LIKE ?
        OR COALESCE(data->>'statusText', '') LIKE ?
      )`);
      const like = `%${messageKeyword}%`;
      baseParams.push(like, like, like, like, like);
    }

    if (urlKeyword) {
      baseConditions.push('url LIKE ?');
      baseParams.push(`%${urlKeyword}%`);
    }

    const cursorTs = Number(req.query.cursorTs);
    const cursorId = Number(req.query.cursorId);
    const useKeyset =
      sortBy === 'timestamp' &&
      Number.isFinite(cursorTs) &&
      Number.isFinite(cursorId) &&
      cursorId > 0;

    const listConditions = [...baseConditions];
    const listParams = [...baseParams];
    if (useKeyset) {
      listConditions.push(
        order === 'DESC' ? '(timestamp, id) < (?, ?)' : '(timestamp, id) > (?, ?)'
      );
      listParams.push(cursorTs, cursorId);
    }

    const listWhere = listConditions.join(' AND ');

    let listSql = `SELECT id, type, sub_type, timestamp, url, data
       FROM events
       WHERE ${listWhere}
       ${orderSql}
       LIMIT ${limit}`;
    if (!useKeyset) {
      listSql += ` OFFSET ${offset}`;
    }

    const canUseAggTotal =
      !messageKeyword && !urlKeyword && !subTypeValue && category !== 'performance';

    const countPromise: Promise<
      { total: number; totalSource: string }
    > = canUseAggTotal
      ? totalFromDailyStats(category, appId, start, end).then((value) =>
          value == null
            ? { total: 0, totalSource: 'unavailable' }
            : { total: value, totalSource: 'daily_stats' }
        )
      : queryOneWithStatementTimeout<{ total: string | number }>(
          `SELECT COUNT(*)::int as total FROM events WHERE ${baseConditions.join(' AND ')}`,
          baseParams,
          Number(process.env.EVENTS_COUNT_TIMEOUT_MS) || 3_000
        )
          .then((row) => ({
            total: Number(row?.total) || 0,
            totalSource: 'events',
          }))
          .catch((err: unknown) => {
            if (pgErrorCode(err) !== '57014') throw err;
            return { total: -1, totalSource: 'timeout' };
          });

    const [counted, rows] = await Promise.all([
      countPromise,
      query<{
        id: number;
        type: string;
        sub_type: string | null;
        timestamp: string | number;
        url: string;
        data: unknown;
      }>(listSql, listParams),
    ]);

    const total =
      counted.totalSource === 'timeout'
        ? offset + rows.length + (rows.length >= limit ? 1 : 0)
        : counted.total;

    const last = rows[rows.length - 1];
    const nextCursor =
      last && sortBy === 'timestamp'
        ? {
            cursorTs: Number(last.timestamp),
            cursorId: Number(last.id),
          }
        : null;

    res.json({
      category,
      page,
      limit,
      total: total ?? 0,
      nextCursor,
      paginationMode: useKeyset ? 'keyset' : 'offset',
      totalSource: counted.totalSource,
      filters: {
        subType: subTypeValue || null,
        messageKeyword: messageKeyword || null,
        urlKeyword: urlKeyword || null,
        sortBy,
        sortOrder: order === 'ASC' ? 'ascend' : 'descend',
      },
      list: rows.map(mapEventRow),
    });
  } catch (error) {
    console.error('Latest events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
