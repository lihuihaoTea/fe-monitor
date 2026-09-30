import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import { EVENT_CATEGORIES, PRESET_SUB_TYPES, categoryWhereSql, mapEventRow, parseLatestLimit, parsePage, parseRangeBound, } from './eventQuery.js';
export const eventsRouter = Router();
function parseCategory(raw) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string')
        return null;
    return EVENT_CATEGORIES.includes(value)
        ? value
        : null;
}
function queryString(raw) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' ? value.trim() : '';
}
const SORT_EXPRESSIONS = {
    timestamp: 'timestamp',
    value: `(data->>'value')::float`,
    domReady: `(data->>'domReady')::float`,
};
function parseSort(sortByRaw, sortOrderRaw) {
    const sortBy = queryString(sortByRaw) || 'timestamp';
    const expr = SORT_EXPRESSIONS[sortBy] || SORT_EXPRESSIONS.timestamp;
    const orderRaw = queryString(sortOrderRaw).toLowerCase();
    const order = orderRaw === 'ascend' || orderRaw === 'asc' ? 'ASC' : 'DESC';
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
        const rows = await query(`SELECT DISTINCT sub_type as subtype
       FROM events
       WHERE app_id = ? AND ${whereCategory}
         AND timestamp >= ? AND timestamp <= ?
         AND sub_type IS NOT NULL AND TRIM(sub_type) != ''
       ORDER BY subtype ASC`, [appId, start, end]);
        const fromDb = rows.map((r) => r.subtype).filter(Boolean);
        const merged = Array.from(new Set([...PRESET_SUB_TYPES[category], ...fromDb]));
        res.json({
            category,
            options: merged.map((value) => ({ value, label: value })),
        });
    }
    catch (error) {
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
        const { sortBy, order, orderSql } = parseSort(req.query.sortBy, req.query.sortOrder);
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
        const baseConditions = [
            'app_id = ?',
            whereCategory,
            'timestamp >= ?',
            'timestamp <= ?',
        ];
        const baseParams = [appId, start, end];
        const subTypeValue = queryString(subType);
        if (subTypeValue) {
            baseConditions.push('sub_type = ?');
            baseParams.push(subTypeValue);
        }
        if (messageKeyword) {
            baseConditions.push(`(
        COALESCE(data->>'message', '') LIKE ?
        OR COALESCE(data->>'resourceUrl', '') LIKE ?
        OR COALESCE(data->>'apiUrl', '') LIKE ?
        OR COALESCE(data->>'error', '') LIKE ?
        OR COALESCE(data->>'statusText', '') LIKE ?
        OR data::text LIKE ?
      )`);
            const like = `%${messageKeyword}%`;
            baseParams.push(like, like, like, like, like, like);
        }
        if (urlKeyword) {
            baseConditions.push('url LIKE ?');
            baseParams.push(`%${urlKeyword}%`);
        }
        const cursorTs = Number(req.query.cursorTs);
        const cursorId = Number(req.query.cursorId);
        const useKeyset = sortBy === 'timestamp' &&
            Number.isFinite(cursorTs) &&
            Number.isFinite(cursorId) &&
            cursorId > 0;
        const listConditions = [...baseConditions];
        const listParams = [...baseParams];
        if (useKeyset) {
            listConditions.push(order === 'DESC' ? '(timestamp, id) < (?, ?)' : '(timestamp, id) > (?, ?)');
            listParams.push(cursorTs, cursorId);
        }
        const baseWhere = baseConditions.join(' AND ');
        const listWhere = listConditions.join(' AND ');
        let listSql = `SELECT id, type, sub_type, timestamp, url, data
       FROM events
       WHERE ${listWhere}
       ${orderSql}
       LIMIT ${limit}`;
        if (!useKeyset) {
            listSql += ` OFFSET ${offset}`;
        }
        const [totalRow, rows] = await Promise.all([
            queryOne(`SELECT COUNT(*)::int as total FROM events WHERE ${baseWhere}`, baseParams),
            query(listSql, listParams),
        ]);
        const last = rows[rows.length - 1];
        const nextCursor = last && sortBy === 'timestamp'
            ? {
                cursorTs: Number(last.timestamp),
                cursorId: Number(last.id),
            }
            : null;
        res.json({
            category,
            page,
            limit,
            total: Number(totalRow?.total) || 0,
            nextCursor,
            paginationMode: useKeyset ? 'keyset' : 'offset',
            filters: {
                subType: subTypeValue || null,
                messageKeyword: messageKeyword || null,
                urlKeyword: urlKeyword || null,
            },
            list: rows.map(mapEventRow),
        });
    }
    catch (error) {
        console.error('Latest events error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
//# sourceMappingURL=events.js.map