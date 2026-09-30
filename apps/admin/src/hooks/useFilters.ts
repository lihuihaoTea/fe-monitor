import { App } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchStats } from '@/lib/api';
import { createEmptyStats, normalizeStats } from '@/lib/normalizeStats';
import { queryKeys } from '@/lib/queryClient';
import { useFilterStore } from '@/stores/filterStore';

/** 全局筛选 + 统计查询（zustand 客户端状态，react-query 服务端缓存） */
export function useFilters() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const appId = useFilterStore((s) => s.appId);
  const dateRange = useFilterStore((s) => s.dateRange);
  const setAppId = useFilterStore((s) => s.setAppId);
  const setDateRange = useFilterStore((s) => s.setDateRange);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');

  const {
    data: stats = createEmptyStats(dateRange[0], dateRange[1]),
    isFetching,
    isPending,
  } = useQuery({
    queryKey: queryKeys.stats(appId, startDate, endDate),
    queryFn: async () => {
      try {
        const data = await fetchStats({ appId, startDate, endDate });
        return normalizeStats(data, dateRange[0], dateRange[1]);
      } catch (error) {
        console.error(error);
        message.error('获取统计数据失败');
        return createEmptyStats(dateRange[0], dateRange[1]);
      }
    },
  });

  return {
    appId,
    setAppId,
    dateRange,
    setDateRange,
    stats,
    loading: isPending || isFetching,
    refresh: () => {
      void queryClient.invalidateQueries();
    },
  };
}
