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

export type EventCategory = 'js' | 'resource' | 'api' | 'other';

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
  performance: Record<string, number>;
  behavior: {
    pv: number;
    uv: number;
    avgStay: number;
    totalClicks: number;
  };
  daily: DailyPoint[];
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
  limit?: number;
  subType?: string;
  messageKeyword?: string;
  urlKeyword?: string;
}

export interface EventListResponse {
  category: EventCategory;
  limit: number;
  list: LatestErrorItem[];
  total: number;
}

export interface SubTypeOption {
  value: string;
  label: string;
}
