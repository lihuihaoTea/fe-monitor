import { create } from 'zustand';
import dayjs, { type Dayjs } from 'dayjs';
import type { AppId } from '@/lib/constants';

function clampDay(day: Dayjs, range: [Dayjs, Dayjs]): Dayjs {
  if (day.isBefore(range[0], 'day')) return range[0].startOf('day');
  if (day.isAfter(range[1], 'day')) return range[1].startOf('day');
  return day.startOf('day');
}

interface FilterState {
  appId: AppId;
  dateRange: [Dayjs, Dayjs];
  /** 小时趋势选中日（Stats 只查该日小时，避免跨日扫访客表） */
  hourlyDate: Dayjs;
  setAppId: (id: AppId) => void;
  setDateRange: (range: [Dayjs, Dayjs]) => void;
  setHourlyDate: (day: Dayjs) => void;
}

const initialRange: [Dayjs, Dayjs] = [
  dayjs().subtract(6, 'day').startOf('day'),
  dayjs().endOf('day'),
];

export const useFilterStore = create<FilterState>((set, get) => ({
  appId: 'qly',
  dateRange: initialRange,
  hourlyDate: initialRange[1].startOf('day'),
  setAppId: (appId) => set({ appId }),
  setDateRange: (dateRange) => {
    const hourlyDate = clampDay(get().hourlyDate, dateRange);
    set({ dateRange, hourlyDate });
  },
  setHourlyDate: (day) => {
    const hourlyDate = clampDay(day, get().dateRange);
    set({ hourlyDate });
  },
}));
