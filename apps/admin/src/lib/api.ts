import type {
  EventCategory,
  EventListQuery,
  EventListResponse,
  StatsResponse,
  SubTypeOption,
} from './types';
import { API_BASE } from './constants';
import { normalizeLatestItem } from './normalizeStats';
import { getAuthToken, useAuthStore } from '@/stores/authStore';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function handleUnauthorized() {
  useAuthStore.getState().clearSession();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError('登录已失效，请重新登录', 401);
  }
  return res;
}

export async function login(params: {
  username: string;
  password: string;
}): Promise<{ token: string; user: { username: string; role: string } }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.message === 'string' ? data.message : `登录失败: ${res.status}`,
      res.status
    );
  }
  if (!data?.token || !data?.user?.username) {
    throw new ApiError('登录响应无效', 500);
  }
  return data;
}

export async function fetchStats(params: {
  appId: string;
  startDate: string;
  endDate: string;
  hourlyDate?: string;
}): Promise<StatsResponse> {
  const url = new URL(`${API_BASE}/api/stats`);
  url.searchParams.set('appId', params.appId);
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);
  if (params.hourlyDate) {
    url.searchParams.set('hourlyDate', params.hourlyDate);
  }

  const res = await apiFetch(url.toString());
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

  const res = await apiFetch(url.toString());
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
  if (params.cursorTs != null) {
    url.searchParams.set('cursorTs', String(params.cursorTs));
  }
  if (params.cursorId != null) {
    url.searchParams.set('cursorId', String(params.cursorId));
  }

  const res = await apiFetch(url.toString());
  if (!res.ok) {
    throw new Error(`事件列表请求失败: ${res.status}`);
  }
  const data = await res.json();
  return {
    category: data.category,
    page: Number(data.page) || 1,
    limit: data.limit,
    total: data.total || 0,
    nextCursor: data.nextCursor ?? null,
    paginationMode: data.paginationMode,
    list: (data.list || []).map(normalizeLatestItem),
  };
}
