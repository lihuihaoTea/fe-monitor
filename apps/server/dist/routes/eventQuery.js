/** 系统自动采集的 JS 错误 */
export const JS_ERROR_SQL = `(
  type = 'error' AND sub_type IN ('js', 'promise')
)`;
/** 页面 404：monitor.error('404') */
export const NOT_FOUND_SQL = `(
  type = 'error' AND (
    sub_type = '404'
    OR CAST(json_extract(data, '$.message') AS TEXT) = '404'
  )
)`;
/**
 * 其他问题：用户通过 monitor.error 自定义上报
 * （含 manual / 404，以及未来自定义 sub_type，排除系统 js/promise）
 */
export const OTHER_ISSUE_SQL = `(
  type = 'error' AND (
    sub_type IS NULL
    OR sub_type NOT IN ('js', 'promise')
  )
)`;
export const EVENT_CATEGORIES = [
    'js',
    'resource',
    'api',
    'other',
    'performance',
];
export function categoryWhereSql(category) {
    switch (category) {
        case 'js':
            return JS_ERROR_SQL;
        case 'resource':
            return `(type = 'resource')`;
        case 'api':
            return `(type = 'api')`;
        case 'other':
            return OTHER_ISSUE_SQL;
        case 'performance':
            return `(type = 'performance')`;
        default:
            return '(1 = 0)';
    }
}
export function parseRangeBound(value, bound) {
    if (typeof value !== 'string' || value.length === 0) {
        return bound === 'start' ? 0 : Date.now();
    }
    const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dayOnly) {
        const year = Number(dayOnly[1]);
        const month = Number(dayOnly[2]) - 1;
        const day = Number(dayOnly[3]);
        return bound === 'start'
            ? new Date(year, month, day, 0, 0, 0, 0).getTime()
            : new Date(year, month, day, 23, 59, 59, 999).getTime();
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? (bound === 'start' ? 0 : Date.now()) : parsed;
}
export const LATEST_LIMIT_OPTIONS = [20, 50, 100, 200];
export function parseLatestLimit(raw) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return LATEST_LIMIT_OPTIONS.includes(parsed) ? parsed : 50;
}
/** 页码从 1 起 */
export function parsePage(raw) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1)
        return 1;
    return Math.floor(parsed);
}
export function mapEventRow(row) {
    let payload = {};
    try {
        payload = row.data ? JSON.parse(row.data) : {};
    }
    catch {
        payload = {};
    }
    let message = '';
    if (row.type === 'error') {
        if (row.sub_type === '404' || payload.message === '404') {
            message = '页面路由未找到 (404)';
        }
        else {
            message =
                payload.message ||
                    payload.reason?.message ||
                    payload.error?.message ||
                    payload.reason ||
                    '未知错误';
        }
    }
    else if (row.type === 'resource') {
        message = payload.resourceUrl || payload.tagName || '资源加载失败';
    }
    else if (row.type === 'api') {
        const status = payload.status ? `HTTP ${payload.status}` : '';
        const err = payload.error || payload.statusText || '';
        message =
            [String(payload.apiUrl || payload.url || ''), status, err]
                .filter(Boolean)
                .join(' · ') || 'API 请求失败';
    }
    else if (row.type === 'performance') {
        const value = Number(payload.value);
        message = Number.isFinite(value) ? `${Math.round(value)} ms` : '-';
    }
    return {
        id: row.id,
        type: row.type,
        subType: row.sub_type || '',
        timestamp: row.timestamp || 0,
        url: row.url || '',
        message: String(message),
        userId: payload.user?.userId != null && payload.user?.userId !== ''
            ? String(payload.user.userId)
            : '',
        userName: typeof payload.user?.userName === 'string' ? payload.user.userName : '',
        data: payload,
    };
}
/** 预定义兜底类型（库中暂无数据时仍可展示） */
export const PRESET_SUB_TYPES = {
    js: ['js', 'promise'],
    resource: ['img', 'script', 'link', 'video', 'audio', 'source'],
    api: ['fetch', 'xhr'],
    other: ['manual', '404'],
    performance: ['fcp', 'lcp', 'load', 'domReady'],
};
//# sourceMappingURL=eventQuery.js.map