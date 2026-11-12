export interface LatestErrorItem {
  id: number;
  type: string;
  subType: string;
  timestamp: number;
  url: string;
  message: string;
  userId?: string;
  userName?: string;
  data?: Record<string, unknown>;
}

export type EventCategory = 'js' | 'resource' | 'api' | 'other' | 'performance';

export interface PerfMetricSummary {
  avg: number;
  /** 中位数；无明细窗口时可能为 0 */
  p50: number;
  min: number;
  max: number;
  count: number;
}

export interface PerfUrlRow {
  url: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface PvPageRow {
  url: string;
  pv: number;
}

export interface PvPagesDay {
  date: string;
  top: PvPageRow[];
  bottom: PvPageRow[];
}

export interface HourlyPoint {
  hour: string;
  fcp: number;
  lcp: number;
  load: number;
  domReady: number;
  ttfb: number;
  spaLcp: number;
  fcpP50: number;
  lcpP50: number;
  loadP50: number;
}

/** 行为 + 稳定性小时点（来自 event_hourly_stats） */
export interface HourlyStatsPoint {
  hour: string;
  errors: number;
  resourceErrors: number;
  apiErrors: number;
  blankScreens: number;
  notFound404: number;
  otherIssues: number;
  pv: number;
  uv: number;
  clicks: number;
  avgStay: number;
}

export interface StatsResponse {
  errors: {
    total: number;
    byType: Array<{ sub_type: string; count: number }>;
  };
  stability: {
    resourceErrors: number;
    apiErrors: number;
    blankScreens: number;
    notFound404: number;
    otherIssues: number;
  };
  performance: {
    fcp: PerfMetricSummary;
    lcp: PerfMetricSummary;
    load: PerfMetricSummary;
    domReady: PerfMetricSummary;
    ttfb: PerfMetricSummary;
    spaLcp: PerfMetricSummary;
    overBudget: number;
    maxMetricMs: number;
    note?: string;
  };
  behavior: {
    pv: number;
    uv: number;
    avgStay: number;
    totalClicks: number;
  };
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  /** 行为/稳定性小时趋势（聚合表） */
  hourlyStats: HourlyStatsPoint[];
  perfByUrl: {
    fcp: PerfUrlRow[];
    lcp: PerfUrlRow[];
    load: PerfUrlRow[];
    domReady: PerfUrlRow[];
    ttfb: PerfUrlRow[];
    spaLcp: PerfUrlRow[];
  };
  /** 按日页面 PV：Top20 / Bottom20（可配 PV_TOP_N / PV_BOTTOM_N） */
  pvPagesByDay: PvPagesDay[];
}

export interface DailyPoint {
  date: string;
  pv: number;
  uv: number;
  errors: number;
  resourceErrors: number;
  apiErrors: number;
  blankScreens: number;
  notFound404: number;
  otherIssues: number;
  fcp: number;
  lcp: number;
  load: number;
  domReady: number;
  ttfb: number;
  spaLcp: number;
  fcpP50: number;
  lcpP50: number;
  loadP50: number;
  avgStay: number;
  clicks: number;
}

export interface EventListQuery {
  appId: string;
  startDate: string;
  endDate: string;
  category: EventCategory;
  page?: number;
  limit?: number;
  subType?: string;
  messageKeyword?: string;
  urlKeyword?: string;
  /** timestamp | value | domReady */
  sortBy?: 'timestamp' | 'value' | 'domReady';
  sortOrder?: 'ascend' | 'descend';
  /** keyset：上一页最后一条 */
  cursorTs?: number;
  cursorId?: number;
}

export interface EventListResponse {
  category: EventCategory;
  page: number;
  limit: number;
  list: LatestErrorItem[];
  total: number;
  nextCursor?: { cursorTs: number; cursorId: number } | null;
  paginationMode?: 'keyset' | 'offset';
}

export interface SubTypeOption {
  value: string;
  label: string;
}
