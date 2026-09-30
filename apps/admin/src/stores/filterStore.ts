import { create } from 'zustand';
import dayjs, { type Dayjs } from 'dayjs';
import type { AppId } from '@/lib/constants';

interface FilterState {
  appId: AppId;
  dateRange: [Dayjs, Dayjs];
  setAppId: (id: AppId) => void;
  setDateRange: (range: [Dayjs, Dayjs]) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  appId: 'qly',
  dateRange: [
    dayjs().subtract(6, 'day').startOf('day'),
    dayjs().endOf('day'),
  ],
  setAppId: (appId) => set({ appId }),
  setDateRange: (dateRange) => set({ dateRange }),
}));
