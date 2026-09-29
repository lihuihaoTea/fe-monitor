import { query, queryOne, execute } from '../db/index.js';

/** 单条筛除规则（存于 event_filters 表） */
export type EventFilterRow = {
  id: number;
  event_type: string;
  match_type: 'host' | 'url_prefix' | 'url_exact' | string;
  match_value: string;
  enabled: number;
  note: string | null;
  created_at: number;
};

export type FilterMatchType = 'host' | 'url_prefix' | 'url_exact';

const MATCH_TYPES: FilterMatchType[] = ['host', 'url_prefix', 'url_exact'];

const CACHE_TTL_MS = 10_000;
let cachedRules: EventFilterRow[] = [];
let cachedAt = 0;

/** 强制刷新内存缓存（管理脚本写入后可调用；服务端按 TTL 自动刷新） */
export function invalidateFilterCache() {
  cachedAt = 0;
  cachedRules = [];
}

/** 读取启用中的筛除规则（带短缓存，无需重启即可生效） */
export async function loadEnabledFilters(): Promise<EventFilterRow[]> {
  const now = Date.now();
  if (cachedAt > 0 && now - cachedAt < CACHE_TTL_MS) {
    return cachedRules;
  }
  cachedRules = await query<EventFilterRow>(
    `SELECT id, event_type, match_type, match_value, enabled, note, created_at
     FROM event_filters
     WHERE enabled = 1
     ORDER BY id ASC`
  );
  cachedAt = now;
  return cachedRules;
}

/** 列出全部筛除规则（含禁用） */
export async function listAllFilters(): Promise<EventFilterRow[]> {
  return query<EventFilterRow>(
    `SELECT id, event_type, match_type, match_value, enabled, note, created_at
     FROM event_filters
     ORDER BY id ASC`
  );
}

export async function addFilter(input: {
  eventType: string;
  matchType: FilterMatchType;
  matchValue: string;
  note?: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const eventType = input.eventType.trim();
  const matchType = input.matchType;
  const matchValue = input.matchValue;
  if (!eventType || !matchValue.trim()) {
    return { ok: false, error: 'eventType / matchValue 不能为空' };
  }
  if (!MATCH_TYPES.includes(matchType)) {
    return { ok: false, error: 'matchType 仅支持 host | url_prefix | url_exact' };
  }

  try {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO event_filters
        (event_type, match_type, match_value, enabled, note, created_at)
       VALUES (?, ?, ?, 1, ?, ?)
       RETURNING id`,
      [eventType, matchType, matchValue, input.note || null, Date.now()]
    );
    invalidateFilterCache();
    return { ok: true, id: Number(row?.id) };
  } catch (err: any) {
    if (String(err?.code) === '23505' || String(err?.message || '').includes('duplicate')) {
      return { ok: false, error: '该筛除项已存在' };
    }
    return { ok: false, error: err?.message || '插入失败' };
  }
}

export async function setFilterEnabled(
  id: number,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const changes = await execute(
    `UPDATE event_filters SET enabled = ? WHERE id = ?`,
    [enabled ? 1 : 0, id]
  );
  if (changes === 0) {
    return { ok: false, error: `未找到 id=${id}` };
  }
  invalidateFilterCache();
  return { ok: true };
}

export async function removeFilter(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const changes = await execute(`DELETE FROM event_filters WHERE id = ?`, [id]);
  if (changes === 0) {
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
  let raw = '';
  if (event.type === 'api') {
    raw = String(data.apiUrl || data.url || '');
  } else if (event.type === 'resource') {
    raw = String(data.resourceUrl || data.url || '');
  }
  return raw.trim();
}

function matchHost(url: string, host: string): boolean {
  if (!url || !host) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const h = host.trim().toLowerCase();
    return hostname === h || hostname.endsWith(`.${h}`);
  } catch {
    return url.toLowerCase().includes(host.trim().toLowerCase());
  }
}

function matchPrefix(url: string, prefix: string): boolean {
  const p = prefix.trim();
  if (!url || !p) return false;
  return url.startsWith(p);
}

function matchExact(url: string, exact: string): boolean {
  const e = exact.trim();
  if (!url || !e) return false;
  return url === e;
}

/** 写入数据库前判断是否应筛除（规则来自 event_filters 表） */
export async function shouldFilterEvent(event: {
  type?: string;
  data?: any;
}): Promise<boolean> {
  const type = event.type || '';
  const targetUrl = extractEventTargetUrl(event);
  if (!targetUrl) return false;

  const rules = await loadEnabledFilters();
  return rules.some((rule) => {
    if (rule.event_type !== type) return false;
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
