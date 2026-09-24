export interface LatestErrorItem {
  id: number;
  type: string;
  subType: string;
  timestamp: number;
  url: string;
  message: string;
  data?: Record<string, unknown>;
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
  };
  performance: Record<string, number>;
  behavior: {
    pv: number;
    uv: number;
    avgStay: number;
    totalClicks: number;
  };
  daily: DailyPoint[];
  latest: {
    jsErrors: LatestErrorItem[];
    resourceErrors: LatestErrorItem[];
    apiErrors: LatestErrorItem[];
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
  fcp: number;
  lcp: number;
  load: number;
  domReady: number;
  avgStay: number;
  clicks: number;
}
