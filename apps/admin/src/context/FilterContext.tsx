import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { App } from 'antd';
import { fetchStats } from '@/lib/api';
import { createEmptyStats, normalizeStats } from '@/lib/normalizeStats';
import type { AppId } from '@/lib/constants';
import type { StatsResponse } from '@/lib/types';

export const LATEST_LIMIT_OPTIONS = [20, 50, 100, 200] as const;
export type LatestLimit = (typeof LATEST_LIMIT_OPTIONS)[number];

interface FilterContextValue {
  appId: AppId;
  setAppId: (id: AppId) => void;
  dateRange: [Dayjs, Dayjs];
  setDateRange: (range: [Dayjs, Dayjs]) => void;
  latestLimit: LatestLimit;
  setLatestLimit: (limit: LatestLimit) => void;
  stats: StatsResponse | null;
  loading: boolean;
  refresh: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

function FilterProviderInner({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [appId, setAppId] = useState<AppId>('qly');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().subtract(6, 'day').startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [latestLimit, setLatestLimit] = useState<LatestLimit>(20);
  const [stats, setStats] = useState<StatsResponse | null>(() =>
    createEmptyStats(dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day'))
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStats({
        appId,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        latestLimit,
      });
      setStats(normalizeStats(data, dateRange[0], dateRange[1]));
    } catch (error) {
      console.error(error);
      message.error('获取统计数据失败');
      setStats(createEmptyStats(dateRange[0], dateRange[1]));
    } finally {
      setLoading(false);
    }
  }, [appId, dateRange, latestLimit, message]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      appId,
      setAppId,
      dateRange,
      setDateRange,
      latestLimit,
      setLatestLimit,
      stats,
      loading,
      refresh,
    }),
    [appId, dateRange, latestLimit, stats, loading, refresh]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  return <FilterProviderInner>{children}</FilterProviderInner>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error('useFilters must be used within FilterProvider');
  }
  return ctx;
}
