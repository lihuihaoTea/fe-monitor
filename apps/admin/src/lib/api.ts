import type { StatsResponse } from './types';
import { API_BASE } from './constants';

export async function fetchStats(params: {
  appId: string;
  startDate: string;
  endDate: string;
  latestLimit?: number;
}): Promise<StatsResponse> {
  const url = new URL(`${API_BASE}/api/stats`);
  url.searchParams.set('appId', params.appId);
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  if (params.latestLimit) {
    url.searchParams.set('latestLimit', String(params.latestLimit));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`统计接口请求失败: ${res.status}`);
  }
  return res.json();
}
