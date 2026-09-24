import type { Dayjs } from 'dayjs';
import type { DailyPoint, LatestErrorItem, StatsResponse } from './types';

const EMPTY_DAILY: Omit<DailyPoint, 'date'> = {
  pv: 0,
  uv: 0,
  errors: 0,
  resourceErrors: 0,
  apiErrors: 0,
  blankScreens: 0,
  notFound404: 0,
  fcp: 0,
  lcp: 0,
  load: 0,
  domReady: 0,
  avgStay: 0,
  clicks: 0,
};

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDailyPoint(raw: Partial<DailyPoint> & { date?: string }, date: string): DailyPoint {
  return {
    date,
    pv: toNumber(raw.pv),
    uv: toNumber(raw.uv),
    errors: toNumber(raw.errors),
    resourceErrors: toNumber(raw.resourceErrors),
    apiErrors: toNumber(raw.apiErrors),
    blankScreens: toNumber(raw.blankScreens),
    notFound404: toNumber(raw.notFound404),
    fcp: toNumber(raw.fcp),
    lcp: toNumber(raw.lcp),
    load: toNumber(raw.load),
    domReady: toNumber(raw.domReady),
    avgStay: toNumber(raw.avgStay),
    clicks: toNumber(raw.clicks),
  };
}

/** 按日期范围补齐缺失天，指标统一用 0 填充 */
export function fillDailyRange(
  daily: Array<Partial<DailyPoint>> | undefined,
  start: Dayjs,
  end: Dayjs
): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const item of daily || []) {
    if (!item?.date) continue;
    map.set(item.date, normalizeDailyPoint(item, item.date));
  }

  const result: DailyPoint[] = [];
  let cursor = start.startOf('day');
  const last = end.startOf('day');

  while (cursor.valueOf() <= last.valueOf()) {
    const key = cursor.format('YYYY-MM-DD');
    result.push(map.get(key) || { date: key, ...EMPTY_DAILY });
    cursor = cursor.add(1, 'day');
  }

  return result;
}

function normalizeLatestItem(item: Partial<LatestErrorItem>): LatestErrorItem {
  return {
    id: toNumber(item.id),
    type: item.type || '',
    subType: item.subType || '',
    timestamp: toNumber(item.timestamp),
    url: item.url || '',
    message: item.message || '-',
    data: item.data,
  };
}

export function normalizeStats(
  raw: Partial<StatsResponse> | null | undefined,
  start: Dayjs,
  end: Dayjs
): StatsResponse {
  const performanceRaw = raw?.performance || {};

  return {
    errors: {
      total: toNumber(raw?.errors?.total),
      byType: (raw?.errors?.byType || []).map((item) => ({
        sub_type: item?.sub_type || 'unknown',
        count: toNumber(item?.count),
      })),
    },
    stability: {
      resourceErrors: toNumber(raw?.stability?.resourceErrors),
      apiErrors: toNumber(raw?.stability?.apiErrors),
      blankScreens: toNumber(raw?.stability?.blankScreens),
      notFound404: toNumber(raw?.stability?.notFound404),
    },
    performance: {
      fcp: toNumber(performanceRaw.fcp),
      lcp: toNumber(performanceRaw.lcp),
      load: toNumber(performanceRaw.load),
      domReady: toNumber(performanceRaw.domReady),
    },
    behavior: {
      pv: toNumber(raw?.behavior?.pv),
      uv: toNumber(raw?.behavior?.uv),
      avgStay: toNumber(raw?.behavior?.avgStay),
      totalClicks: toNumber(raw?.behavior?.totalClicks),
    },
    daily: fillDailyRange(raw?.daily, start, end),
    latest: {
      jsErrors: (raw?.latest?.jsErrors || []).map(normalizeLatestItem),
      resourceErrors: (raw?.latest?.resourceErrors || []).map(normalizeLatestItem),
      apiErrors: (raw?.latest?.apiErrors || []).map(normalizeLatestItem),
      notFound404: (raw?.latest?.notFound404 || []).map(normalizeLatestItem),
    },
  };
}

export function createEmptyStats(start: Dayjs, end: Dayjs): StatsResponse {
  return normalizeStats(null, start, end);
}
