import { QueryClient } from '@tanstack/react-query';

/** 默认接口缓存 / 视为新鲜的时间：30 秒 */
export const QUERY_STALE_TIME_MS = 30_000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_STALE_TIME_MS * 2,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryKeys = {
  stats: (appId: string, startDate: string, endDate: string) =>
    ['stats', appId, startDate, endDate] as const,
  eventSubTypes: (
    appId: string,
    startDate: string,
    endDate: string,
    category: string
  ) => ['event-sub-types', appId, startDate, endDate, category] as const,
  events: (params: Record<string, unknown>) => ['events', params] as const,
};
