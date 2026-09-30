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

export interface HourlyPoint {
  hour: string;
  fcp: number;
  lcp: number;
  load: number;
  domReady: number;
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
  };
  behavior: {
    pv: number;
    uv: number;
    avgStay: number;
    totalClicks: number;
  };
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  perfByUrl: {
    fcp: PerfUrlRow[];
    lcp: PerfUrlRow[];
    load: PerfUrlRow[];
    domReady: PerfUrlRow[];
  };
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
