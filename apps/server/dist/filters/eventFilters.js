import { db } from '../db/index.js';
const MATCH_TYPES = ['host', 'url_prefix', 'url_exact'];
const CACHE_TTL_MS = 10000;
let cachedRules = [];
let cachedAt = 0;
/** 强制刷新内存缓存（管理脚本写入后可调用；服务端按 TTL 自动刷新） */
export function invalidateFilterCache() {
    cachedAt = 0;
    cachedRules = [];
}
/** 读取启用中的筛除规则（带短缓存，无需重启即可生效） */
export function loadEnabledFilters() {
    const now = Date.now();
    if (cachedAt > 0 && now - cachedAt < CACHE_TTL_MS) {
        return cachedRules;
    }
    cachedRules = db
        .prepare(`SELECT id, event_type, match_type, match_value, enabled, note, created_at
       FROM event_filters
       WHERE enabled = 1
       ORDER BY id ASC`)
        .all();
    cachedAt = now;
    return cachedRules;
}
/** 列出全部筛除规则（含禁用） */
export function listAllFilters() {
    return db
        .prepare(`SELECT id, event_type, match_type, match_value, enabled, note, created_at
       FROM event_filters
       ORDER BY id ASC`)
        .all();
}
export function addFilter(input) {
    const eventType = input.eventType.trim();
    const matchType = input.matchType;
    // 保留空格（含尾部空格），仅用 trim 判断是否为空
    const matchValue = input.matchValue;
    if (!eventType || !matchValue.trim()) {
        return { ok: false, error: 'eventType / matchValue 不能为空' };
    }
    if (!MATCH_TYPES.includes(matchType)) {
        return { ok: false, error: 'matchType 仅支持 host | url_prefix | url_exact' };
    }
    try {
        const result = db
            .prepare(`INSERT INTO event_filters
          (event_type, match_type, match_value, enabled, note, created_at)
         VALUES (?, ?, ?, 1, ?, ?)`)
            .run(eventType, matchType, matchValue, input.note || null, Date.now());
        invalidateFilterCache();
        return { ok: true, id: Number(result.lastInsertRowid) };
    }
    catch (err) {
        if (String(err?.message || '').includes('UNIQUE')) {
            return { ok: false, error: '该筛除项已存在' };
        }
        return { ok: false, error: err?.message || '插入失败' };
    }
}
export function setFilterEnabled(id, enabled) {
    const result = db
        .prepare(`UPDATE event_filters SET enabled = ? WHERE id = ?`)
        .run(enabled ? 1 : 0, id);
    if (result.changes === 0) {
        return { ok: false, error: `未找到 id=${id}` };
    }
    invalidateFilterCache();
    return { ok: true };
}
export function removeFilter(id) {
    const result = db.prepare(`DELETE FROM event_filters WHERE id = ?`).run(id);
    if (result.changes === 0) {
        return { ok: false, error: `未找到 id=${id}` };
    }
    invalidateFilterCache();
    return { ok: true };
}
function extractEventTargetUrl(event) {
    const data = event.data || {};
    let raw = '';
    if (event.type === 'api') {
        raw = String(data.apiUrl || data.url || '');
    }
    else if (event.type === 'resource') {
        raw = String(data.resourceUrl || data.url || '');
    }
    // 去掉首尾空白，避免 "https://qlydata.com/ " 与规则 "https://qlydata.com/" 对不上
    return raw.trim();
}
function matchHost(url, host) {
    if (!url || !host)
        return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        const h = host.trim().toLowerCase();
        return hostname === h || hostname.endsWith(`.${h}`);
    }
    catch {
        return url.toLowerCase().includes(host.trim().toLowerCase());
    }
}
function matchPrefix(url, prefix) {
    const p = prefix.trim();
    if (!url || !p)
        return false;
    return url.startsWith(p);
}
function matchExact(url, exact) {
    const e = exact.trim();
    if (!url || !e)
        return false;
    return url === e;
}
/** 写入数据库前判断是否应筛除（规则来自 event_filters 表） */
export function shouldFilterEvent(event) {
    const type = event.type || '';
    const targetUrl = extractEventTargetUrl(event);
    if (!targetUrl)
        return false;
    const rules = loadEnabledFilters();
    return rules.some((rule) => {
        if (rule.event_type !== type)
            return false;
        if (rule.match_type === 'host') {
            return matchHost(targetUrl, rule.match_value);
        }
        if (rule.match_type === 'url_prefix') {
            return matchPrefix(targetUrl, rule.match_value);
        }
        if (rule.match_type === 'url_exact') {
            return matchExact(targetUrl, rule.match_value);
        }
        return false;
    });
}
//# sourceMappingURL=eventFilters.js.map