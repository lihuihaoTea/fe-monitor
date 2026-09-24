import { db } from '../db/index.js';

/** 单条筛除规则（存于 event_filters 表） */
export type EventFilterRow = {
  id: number;
  event_type: string;
  match_type: 'host' | 'url_prefix' | string;
  match_value: string;
  enabled: number;
  note: string | null;
  created_at: number;
};

const CACHE_TTL_MS = 10_000;
let cachedRules: EventFilterRow[] = [];
let cachedAt = 0;

/** 强制刷新内存缓存（管理脚本写入后可调用；服务端按 TTL 自动刷新） */
export function invalidateFilterCache() {
  cachedAt = 0;
  cachedRules = [];
}

/** 读取启用中的筛除规则（带短缓存，无需重启即可生效） */
export function loadEnabledFilters(): EventFilterRow[] {
  const now = Date.now();
  if (cachedAt > 0 && now - cachedAt < CACHE_TTL_MS) {
    return cachedRules;
  }
  cachedRules = db
    .prepare(
      `SELECT id, event_type, match_type, match_value, enabled, note, created_at
       FROM event_filters
       WHERE enabled = 1
       ORDER BY id ASC`
    )
    .all() as EventFilterRow[];
  cachedAt = now;
  return cachedRules;
}

/** 列出全部筛除规则（含禁用） */
export function listAllFilters(): EventFilterRow[] {
  return db
    .prepare(
      `SELECT id, event_type, match_type, match_value, enabled, note, created_at
       FROM event_filters
       ORDER BY id ASC`
    )
    .all() as EventFilterRow[];
}

export function addFilter(input: {
  eventType: string;
  matchType: 'host' | 'url_prefix';
  matchValue: string;
  note?: string;
}): { ok: true; id: number } | { ok: false; error: string } {
  const eventType = input.eventType.trim();
  const matchType = input.matchType;
  const matchValue = input.matchValue.trim();
  if (!eventType || !matchValue) {
    return { ok: false, error: 'eventType / matchValue 不能为空' };
  }
  if (matchType !== 'host' && matchType !== 'url_prefix') {
    return { ok: false, error: 'matchType 仅支持 host | url_prefix' };
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO event_filters
          (event_type, match_type, match_value, enabled, note, created_at)
         VALUES (?, ?, ?, 1, ?, ?)`
      )
      .run(eventType, matchType, matchValue, input.note || null, Date.now());
    invalidateFilterCache();
    return { ok: true, id: Number(result.lastInsertRowid) };
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return { ok: false, error: '该筛除项已存在' };
    }
    return { ok: false, error: err?.message || '插入失败' };
  }
}

export function setFilterEnabled(
  id: number,
  enabled: boolean
): { ok: true } | { ok: false; error: string } {
  const result = db
    .prepare(`UPDATE event_filters SET enabled = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, id);
  if (result.changes === 0) {
    return { ok: false, error: `未找到 id=${id}` };
  }
  invalidateFilterCache();
  return { ok: true };
}

export function removeFilter(
  id: number
): { ok: true } | { ok: false; error: string } {
  const result = db.prepare(`DELETE FROM event_filters WHERE id = ?`).run(id);
  if (result.changes === 0) {
    return { ok: false, error: `未找到 id=${id}` };
  }
  invalidateFilterCache();
  return { ok: true };
}

function extractEventTargetUrl(event: {
  type?: string;
  data?: any;
}): string {
  const data = event.data || {};
  if (event.type === 'api') {
    return String(data.apiUrl || data.url || '');
  }
  if (event.type === 'resource') {
    return String(data.resourceUrl || data.url || '');
  }
  return '';
}

function matchHost(url: string, host: string): boolean {
  if (!url || !host) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const h = host.toLowerCase();
    return hostname === h || hostname.endsWith(`.${h}`);
  } catch {
    return url.toLowerCase().includes(host.toLowerCase());
  }
}

function matchPrefix(url: string, prefix: string): boolean {
  if (!url || !prefix) return false;
  return url.startsWith(prefix);
}

/** 写入数据库前判断是否应筛除（规则来自 event_filters 表） */
export function shouldFilterEvent(event: { type?: string; data?: any }): boolean {
  const type = event.type || '';
  const targetUrl = extractEventTargetUrl(event);
  if (!targetUrl) return false;

  const rules = loadEnabledFilters();
  return rules.some((rule) => {
    if (rule.event_type !== type) return false;
    if (rule.match_type === 'host') {
      return matchHost(targetUrl, rule.match_value);
    }
    if (rule.match_type === 'url_prefix') {
      return matchPrefix(targetUrl, rule.match_value);
    }
    return false;
  });
}
