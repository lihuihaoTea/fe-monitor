import type { Dayjs } from 'dayjs';
import type {
  DailyPoint,
  HourlyPoint,
  HourlyStatsPoint,
  LatestErrorItem,
  PerfMetricSummary,
  PerfUrlRow,
  PvPagesDay,
  StatsResponse,
} from './types';

const EMPTY_DAILY: Omit<DailyPoint, 'date'> = {
  pv: 0,
  uv: 0,
  errors: 0,
  resourceErrors: 0,
  apiErrors: 0,
  blankScreens: 0,
  notFound404: 0,
  otherIssues: 0,
  fcp: 0,
  lcp: 0,
  load: 0,
  domReady: 0,
  ttfb: 0,
  spaLcp: 0,
  fcpP50: 0,
  lcpP50: 0,
  loadP50: 0,
  avgStay: 0,
  clicks: 0,
};

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizePerfMetric(raw: unknown): PerfMetricSummary {
  if (raw && typeof raw === 'object' && 'avg' in (raw as object)) {
    const o = raw as Partial<PerfMetricSummary>;
    return {
      avg: toNumber(o.avg),
      p50: toNumber(o.p50),
      min: toNumber(o.min),
      max: toNumber(o.max),
      count: toNumber(o.count),
    };
  }
  // 兼容旧扁平 number
  const avg = toNumber(raw);
  return { avg, p50: avg, min: 0, max: 0, count: avg > 0 ? 1 : 0 };
}

function normalizeUrlRows(raw: unknown): PerfUrlRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    url: String((item as PerfUrlRow)?.url || ''),
    avg: toNumber((item as PerfUrlRow)?.avg),
    min: toNumber((item as PerfUrlRow)?.min),
    max: toNumber((item as PerfUrlRow)?.max),
    count: toNumber((item as PerfUrlRow)?.count),
  }));
}

function normalizePvPagesByDay(raw: unknown): PvPagesDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const day = item as Partial<PvPagesDay>;
    return {
      date: String(day.date || ''),
      top: Array.isArray(day.top)
        ? day.top.map((row) => ({
            url: String(row?.url || ''),
            pv: toNumber(row?.pv),
          }))
        : [],
      bottom: Array.isArray(day.bottom)
        ? day.bottom.map((row) => ({
            url: String(row?.url || ''),
            pv: toNumber(row?.pv),
          }))
        : [],
    };
  });
}

function normalizeDailyPoint(
  raw: Partial<DailyPoint> & { date?: string },
  date: string
): DailyPoint {
  return {
    date,
    pv: toNumber(raw.pv),
    uv: toNumber(raw.uv),
    errors: toNumber(raw.errors),
    resourceErrors: toNumber(raw.resourceErrors),
    apiErrors: toNumber(raw.apiErrors),
    blankScreens: toNumber(raw.blankScreens),
    notFound404: toNumber(raw.notFound404),
    otherIssues: toNumber(raw.otherIssues),
    fcp: toNumber(raw.fcp),
    lcp: toNumber(raw.lcp),
    load: toNumber(raw.load),
    domReady: toNumber(raw.domReady),
    ttfb: toNumber(raw.ttfb),
    spaLcp: toNumber(raw.spaLcp),
    fcpP50: toNumber(raw.fcpP50),
    lcpP50: toNumber(raw.lcpP50),
    loadP50: toNumber(raw.loadP50),
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

/** 单日按小时补齐 0~23（性能） */
export function fillHourlyRange(
  hourly: Array<Partial<HourlyPoint>> | undefined,
  day: Dayjs
): HourlyPoint[] {
  const dayKey = day.format('YYYY-MM-DD');
  const map = new Map<string, HourlyPoint>();
  for (const item of hourly || []) {
    if (!item?.hour) continue;
    map.set(item.hour, {
      hour: item.hour,
      fcp: toNumber(item.fcp),
      lcp: toNumber(item.lcp),
      load: toNumber(item.load),
      domReady: toNumber(item.domReady),
      ttfb: toNumber(item.ttfb),
      spaLcp: toNumber(item.spaLcp),
      fcpP50: toNumber(item.fcpP50),
      lcpP50: toNumber(item.lcpP50),
      loadP50: toNumber(item.loadP50),
    });
  }

  const result: HourlyPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const label = `${dayKey} ${String(h).padStart(2, '0')}:00`;
    result.push(
      map.get(label) || {
        hour: label,
        fcp: 0,
        lcp: 0,
        load: 0,
        domReady: 0,
        ttfb: 0,
        spaLcp: 0,
        fcpP50: 0,
        lcpP50: 0,
        loadP50: 0,
      }
    );
  }
  return result;
}

const EMPTY_HOURLY_STATS: Omit<HourlyStatsPoint, 'hour'> = {
  errors: 0,
  resourceErrors: 0,
  apiErrors: 0,
  blankScreens: 0,
  notFound404: 0,
  otherIssues: 0,
  pv: 0,
  uv: 0,
  clicks: 0,
  avgStay: 0,
};

/** 单日按小时补齐 0~23（行为 + 稳定性） */
export function fillHourlyStatsRange(
  hourly: Array<Partial<HourlyStatsPoint>> | undefined,
  day: Dayjs
): HourlyStatsPoint[] {
  const dayKey = day.format('YYYY-MM-DD');
  const map = new Map<string, HourlyStatsPoint>();
  for (const item of hourly || []) {
    if (!item?.hour) continue;
    map.set(item.hour, {
      hour: item.hour,
      errors: toNumber(item.errors),
      resourceErrors: toNumber(item.resourceErrors),
      apiErrors: toNumber(item.apiErrors),
      blankScreens: toNumber(item.blankScreens),
      notFound404: toNumber(item.notFound404),
      otherIssues: toNumber(item.otherIssues),
      pv: toNumber(item.pv),
      uv: toNumber(item.uv),
      clicks: toNumber(item.clicks),
      avgStay: toNumber(item.avgStay),
    });
  }

  const result: HourlyStatsPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const label = `${dayKey} ${String(h).padStart(2, '0')}:00`;
    result.push(map.get(label) || { hour: label, ...EMPTY_HOURLY_STATS });
  }
  return result;
}

export function normalizeLatestItem(item: Partial<LatestErrorItem>): LatestErrorItem {
  return {
    id: toNumber(item.id),
    type: item.type || '',
    subType: item.subType || '',
    timestamp: toNumber(item.timestamp),
    url: item.url || '',
    message: item.message || '-',
    userId: item.userId ? String(item.userId) : '',
    userName: item.userName ? String(item.userName) : '',
    data: item.data,
  };
}

export function normalizeStats(
  raw: Partial<StatsResponse> | null | undefined,
  start: Dayjs,
  end: Dayjs
): StatsResponse {
  const performanceRaw = raw?.performance || ({} as StatsResponse['performance']);

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
      otherIssues: toNumber(raw?.stability?.otherIssues),
    },
    performance: {
      fcp: normalizePerfMetric(performanceRaw.fcp),
      lcp: normalizePerfMetric(performanceRaw.lcp),
      load: normalizePerfMetric(performanceRaw.load),
      domReady: normalizePerfMetric(performanceRaw.domReady),
      ttfb: normalizePerfMetric(performanceRaw.ttfb),
      spaLcp: normalizePerfMetric(performanceRaw.spaLcp),
      overBudget: toNumber(performanceRaw.overBudget),
      maxMetricMs: toNumber(performanceRaw.maxMetricMs) || 60000,
      note: performanceRaw.note,
    },
    behavior: {
      pv: toNumber(raw?.behavior?.pv),
      uv: toNumber(raw?.behavior?.uv),
      avgStay: toNumber(raw?.behavior?.avgStay),
      totalClicks: toNumber(raw?.behavior?.totalClicks),
    },
    daily: fillDailyRange(raw?.daily, start, end),
    // 保留区间内全部小时点，由看板按所选日再 fill 24 点
    hourly: (raw?.hourly || []).map((item) => ({
      hour: item.hour || '',
      fcp: toNumber(item.fcp),
      lcp: toNumber(item.lcp),
      load: toNumber(item.load),
      domReady: toNumber(item.domReady),
      ttfb: toNumber(item.ttfb),
      spaLcp: toNumber(item.spaLcp),
      fcpP50: toNumber(item.fcpP50),
      lcpP50: toNumber(item.lcpP50),
      loadP50: toNumber(item.loadP50),
    })),
    hourlyStats: (raw?.hourlyStats || []).map((item) => ({
      hour: item.hour || '',
      errors: toNumber(item.errors),
      resourceErrors: toNumber(item.resourceErrors),
      apiErrors: toNumber(item.apiErrors),
      blankScreens: toNumber(item.blankScreens),
      notFound404: toNumber(item.notFound404),
      otherIssues: toNumber(item.otherIssues),
      pv: toNumber(item.pv),
      uv: toNumber(item.uv),
      clicks: toNumber(item.clicks),
      avgStay: toNumber(item.avgStay),
    })),
    perfByUrl: {
      fcp: normalizeUrlRows(raw?.perfByUrl?.fcp),
      lcp: normalizeUrlRows(raw?.perfByUrl?.lcp),
      load: normalizeUrlRows(raw?.perfByUrl?.load),
      domReady: normalizeUrlRows(raw?.perfByUrl?.domReady),
      ttfb: normalizeUrlRows(raw?.perfByUrl?.ttfb),
      spaLcp: normalizeUrlRows(raw?.perfByUrl?.spaLcp),
    },
    pvPagesByDay: normalizePvPagesByDay(raw?.pvPagesByDay),
  };
}

export function createEmptyStats(start: Dayjs, end: Dayjs): StatsResponse {
  return normalizeStats(null, start, end);
}
