import type {
  EventCategory,
  EventListQuery,
  EventListResponse,
  StatsResponse,
  SubTypeOption,
} from './types';
import { API_BASE } from './constants';
import { normalizeLatestItem } from './normalizeStats';

export async function fetchStats(params: {
  appId: string;
  startDate: string;
  endDate: string;
}): Promise<StatsResponse> {
  const url = new URL(`${API_BASE}/api/stats`);
  url.searchParams.set('appId', params.appId);
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`统计接口请求失败: ${res.status}`);
  }
  return res.json();
}

export async function fetchEventSubTypes(params: {
  appId: string;
  startDate: string;
  endDate: string;
  category: EventCategory;
}): Promise<SubTypeOption[]> {
  const url = new URL(`${API_BASE}/api/events/sub-types`);
  url.searchParams.set('appId', params.appId);
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  url.searchParams.set('category', params.category);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`类型选项请求失败: ${res.status}`);
  }
  const data = await res.json();
  return (data.options || []) as SubTypeOption[];
}

export async function fetchLatestEvents(
  params: EventListQuery
): Promise<EventListResponse> {
  const url = new URL(`${API_BASE}/api/events/latest`);
  url.searchParams.set('appId', params.appId);
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  url.searchParams.set('category', params.category);
  if (params.page) url.searchParams.set('page', String(params.page));
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.subType) url.searchParams.set('subType', params.subType);
  if (params.messageKeyword) {
    url.searchParams.set('messageKeyword', params.messageKeyword);
  }
  if (params.urlKeyword) url.searchParams.set('urlKeyword', params.urlKeyword);
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`事件列表请求失败: ${res.status}`);
  }
  const data = await res.json();
  return {
    category: data.category,
    page: Number(data.page) || 1,
    limit: data.limit,
    total: data.total || 0,
    list: (data.list || []).map(normalizeLatestItem),
  };
}
