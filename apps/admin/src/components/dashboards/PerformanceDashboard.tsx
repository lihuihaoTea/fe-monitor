import { useEffect, useMemo, useState } from 'react';
import { DatePicker, Spin } from 'antd';
import { type Dayjs } from 'dayjs';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { PerformanceUrlTopList } from '@/components/PerformanceUrlTopList';
import { useFilters } from '@/hooks/useFilters';
import { useFilterStore } from '@/stores/filterStore';
import { fillHourlyRange } from '@/lib/normalizeStats';
import type { PerfMetricSummary } from '@/lib/types';
import { formatDuration } from '@/lib/format';

function metricDesc(base: string, m: PerfMetricSummary) {
  const range =
    m.count > 0
      ? `区间最小 ${formatDuration(m.min)}，最大 ${formatDuration(m.max)}，样本 ${m.count}。`
      : '暂无样本。';
  return `${base} ${range}`;
}

const TREND_SERIES = [
  { name: 'FCP', field: 'fcp' as const, unit: 'ms', precision: 0 },
  { name: 'LCP', field: 'lcp' as const, unit: 'ms', precision: 0 },
  { name: '页面加载', field: 'load' as const, unit: 'ms', precision: 0 },
  { name: 'DOM Ready', field: 'domReady' as const, unit: 'ms', precision: 0 },
];

export function PerformanceDashboard() {
  const { stats, loading } = useFilters();
  const dateRange = useFilterStore((s) => s.dateRange);
  const rangeStart = dateRange[0].startOf('day');
  const rangeEnd = dateRange[1].startOf('day');

  const [hourlyDay, setHourlyDay] = useState<Dayjs>(() => rangeEnd);

  // 全局日期范围变化时，把小时图选中日钳制到范围内（默认取结束日）
  useEffect(() => {
    setHourlyDay((prev) => {
      if (prev.isBefore(rangeStart, 'day')) return rangeStart;
      if (prev.isAfter(rangeEnd, 'day')) return rangeEnd;
      return prev;
    });
  }, [rangeStart, rangeEnd]);

  const performance = stats?.performance ?? {
    fcp: { avg: 0, min: 0, max: 0, count: 0 },
    lcp: { avg: 0, min: 0, max: 0, count: 0 },
    load: { avg: 0, min: 0, max: 0, count: 0 },
    domReady: { avg: 0, min: 0, max: 0, count: 0 },
  };
  const daily = stats?.daily ?? [];
  const perfByUrl = stats?.perfByUrl ?? {
    fcp: [],
    lcp: [],
    load: [],
    domReady: [],
  };

  const hourlyOfDay = useMemo(() => {
    const filled = fillHourlyRange(stats?.hourly, hourlyDay);
    // X 轴只展示 HH:00，避免整天标签过长
    return filled.map((point) => ({
      ...point,
      hour: point.hour.slice(11, 16) || point.hour,
    }));
  }, [stats?.hourly, hourlyDay]);

  return (
    <Spin spinning={loading}>
      <div className="monitor-page">
        <MetricSummary
          loading={loading && !stats}
          items={[
            {
              title: 'FCP 平均',
              value: performance.fcp.avg || 0,
              suffix: 'ms',
              description: metricDesc(
                'First Contentful Paint：首次内容绘制。',
                performance.fcp
              ),
            },
            {
              title: 'LCP 平均',
              value: performance.lcp.avg || 0,
              suffix: 'ms',
              description: metricDesc(
                'Largest Contentful Paint：最大内容绘制。',
                performance.lcp
              ),
            },
            {
              title: '页面加载平均',
              value: performance.load.avg || 0,
              suffix: 'ms',
              description: metricDesc(
                'Load：页面 load 事件触发耗时。',
                performance.load
              ),
            },
            {
              title: 'DOM Ready 平均',
              value: performance.domReady.avg || 0,
              suffix: 'ms',
              description: metricDesc(
                'DOMContentLoaded：DOM 解析完成时间。',
                performance.domReady
              ),
            },
          ]}
        />

        <CombinedTrendChart
          title="性能趋势（按天）"
          data={daily}
          xField="date"
          loading={loading && !stats}
          series={TREND_SERIES}
        />

        <CombinedTrendChart
          title="性能趋势（按小时）"
          data={hourlyOfDay}
          xField="hour"
          loading={loading && !stats}
          series={TREND_SERIES}
          extra={
            <DatePicker
              value={hourlyDay}
              allowClear={false}
              disabledDate={(current) => {
                if (!current) return false;
                return (
                  current.isBefore(rangeStart, 'day') ||
                  current.isAfter(rangeEnd, 'day')
                );
              }}
              onChange={(value) => {
                if (value) setHourlyDay(value.startOf('day'));
              }}
            />
          }
        />

        <PerformanceUrlTopList
          title="慢页面 Top（FCP）"
          data={perfByUrl.fcp}
          loading={loading && !stats}
        />
        <PerformanceUrlTopList
          title="慢页面 Top（LCP）"
          data={perfByUrl.lcp}
          loading={loading && !stats}
        />
        <PerformanceUrlTopList
          title="慢页面 Top（Load）"
          data={perfByUrl.load}
          loading={loading && !stats}
        />
        <PerformanceUrlTopList
          title="慢页面 Top（DOM Ready）"
          data={perfByUrl.domReady}
          loading={loading && !stats}
        />
      </div>
    </Spin>
  );
}
