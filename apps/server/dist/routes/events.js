import { Router } from 'express';
import { db } from '../db/index.js';
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
    value: `CAST(json_extract(data, '$.value') AS REAL)`,
    domReady: `CAST(json_extract(data, '$.domReady') AS REAL)`,
};
function parseSortClause(sortByRaw, sortOrderRaw) {
    const sortBy = queryString(sortByRaw);
    const expr = SORT_EXPRESSIONS[sortBy] || SORT_EXPRESSIONS.timestamp;
    const order = queryString(sortOrderRaw).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    // 次级排序保证同耗时下顺序稳定
    if (expr === 'timestamp') {
        return `ORDER BY timestamp ${order}`;
    }
    return `ORDER BY ${expr} ${order}, timestamp DESC`;
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
            .prepare(`SELECT DISTINCT sub_type as subType
         FROM events
         WHERE app_id = ? AND ${whereCategory}
           AND timestamp >= ? AND timestamp <= ?
           AND sub_type IS NOT NULL AND TRIM(sub_type) != ''
         ORDER BY sub_type ASC`)
            .all(appId, start, end);
        const fromDb = rows.map((r) => r.subType).filter(Boolean);
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
        const conditions = [
            'app_id = ?',
            whereCategory,
            'timestamp >= ?',
            'timestamp <= ?',
        ];
        const params = [appId, start, end];
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
        const whereSql = conditions.join(' AND ');
        const orderSql = parseSortClause(req.query.sortBy, req.query.sortOrder);
        const totalRow = db
            .prepare(`SELECT COUNT(*) as total FROM events WHERE ${whereSql}`)
            .get(...params);
        const rows = db
            .prepare(`SELECT id, type, sub_type, timestamp, url, data
         FROM events
         WHERE ${whereSql}
         ${orderSql}
         LIMIT ${limit} OFFSET ${offset}`)
            .all(...params);
        res.json({
            category,
            page,
            limit,
            total: totalRow?.total ?? 0,
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