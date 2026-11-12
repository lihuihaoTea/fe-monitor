import { useMemo, useState } from 'react';
import { DatePicker, Typography } from 'antd';
import { type Dayjs } from 'dayjs';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { PerformanceUrlTopList } from '@/components/PerformanceUrlTopList';
import { useFilters } from '@/hooks/useFilters';
import { useFilterStore } from '@/stores/filterStore';
import { fillHourlyRange } from '@/lib/normalizeStats';
import type { PerfMetricSummary } from '@/lib/types';
import { formatDuration, formatNumber } from '@/lib/format';

function metricDesc(base: string, m: PerfMetricSummary) {
  const range =
    m.count > 0
      ? `均值 ${formatDuration(m.avg)}，P50 ${formatDuration(m.p50)}，最小 ${formatDuration(m.min)}，最大 ${formatDuration(m.max)}，样本 ${formatNumber(m.count)}。`
      : '暂无样本。';
  return `${base} ${range}`;
}

const TREND_SERIES = [
  { name: 'FCP', field: 'fcp' as const, unit: 'ms', precision: 0 },
  { name: 'LCP', field: 'lcp' as const, unit: 'ms', precision: 0 },
  { name: '页面加载', field: 'load' as const, unit: 'ms', precision: 0 },
  { name: 'DOM Ready', field: 'domReady' as const, unit: 'ms', precision: 0 },
];

const TREND_SERIES_EXTRA = [
  { name: 'TTFB', field: 'ttfb' as const, unit: 'ms', precision: 0 },
  { name: 'SPA LCP', field: 'spaLcp' as const, unit: 'ms', precision: 0 },
];

export function PerformanceDashboard() {
  const { stats, loading } = useFilters();
  const dateRange = useFilterStore((s) => s.dateRange);
  const rangeStart = dateRange[0].startOf('day');
  const rangeEnd = dateRange[1].startOf('day');

  const [hourlyDay, setHourlyDay] = useState<Dayjs>(() => rangeEnd);

  const clampedHourlyDay = useMemo(() => {
    if (hourlyDay.isBefore(rangeStart, 'day')) return rangeStart;
    if (hourlyDay.isAfter(rangeEnd, 'day')) return rangeEnd;
    return hourlyDay;
  }, [hourlyDay, rangeStart, rangeEnd]);

  const emptyMetric = { avg: 0, p50: 0, min: 0, max: 0, count: 0 };
  const performance = stats?.performance ?? {
    fcp: emptyMetric,
    lcp: emptyMetric,
    load: emptyMetric,
    domReady: emptyMetric,
    ttfb: emptyMetric,
    spaLcp: emptyMetric,
    overBudget: 0,
    maxMetricMs: 60000,
  };
  const daily = stats?.daily ?? [];
  const perfByUrl = stats?.perfByUrl ?? {
    fcp: [],
    lcp: [],
    load: [],
    domReady: [],
    ttfb: [],
    spaLcp: [],
  };

  const hourlyOfDay = useMemo(() => {
    const filled = fillHourlyRange(stats?.hourly, clampedHourlyDay);
    return filled.map((point) => ({
      ...point,
      hour: point.hour.slice(11, 16) || point.hour,
    }));
  }, [stats?.hourly, clampedHourlyDay]);

  return (
    <div className="monitor-page">
      <MetricSummary
        loading={loading}
        items={[
          {
            title: 'FCP 平均',
            value: performance.fcp.avg || 0,
            suffix: 'ms',
            description: metricDesc(
              'First Contentful Paint：首次内容绘制（Document 导航）。',
              performance.fcp
            ),
          },
          {
            title: 'LCP 平均',
            value: performance.lcp.avg || 0,
            suffix: 'ms',
            description: metricDesc(
              'Largest Contentful Paint：最大内容绘制（Document 导航）。',
              performance.lcp
            ),
          },
          {
            title: '页面加载平均',
            value: performance.load.avg || 0,
            suffix: 'ms',
            description: metricDesc(
              'Load：loadEventEnd - fetchStart。',
              performance.load
            ),
          },
          {
            title: 'DOM Ready 平均',
            value: performance.domReady.avg || 0,
            suffix: 'ms',
            description: metricDesc(
              'DOMContentLoaded：domContentLoadedEventEnd - fetchStart。',
              performance.domReady
            ),
          },
          {
            title: 'TTFB 平均',
            value: performance.ttfb.avg || 0,
            suffix: 'ms',
            description: metricDesc(
              'Time To First Byte：responseStart - requestStart。',
              performance.ttfb
            ),
          },
          {
            title: 'SPA LCP 平均',
            value: performance.spaLcp.avg || 0,
            suffix: 'ms',
            description: metricDesc(
              '路由切换后相对耗时的 LCP（hash/history），与 Document LCP 分开。',
              performance.spaLcp
            ),
          },
        ]}
      />

      <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
        {performance.note ||
          '各指标样本集独立，count 可能不同；对比请优先看 P50。'}
        {performance.overBudget > 0
          ? ` 区间内超上限（>${formatNumber(performance.maxMetricMs)}ms）丢弃 ${formatNumber(performance.overBudget)} 次。`
          : ''}
      </Typography.Paragraph>

      <CombinedTrendChart
        title="性能趋势（按天）"
        data={daily}
        xField="date"
        loading={loading}
        series={[...TREND_SERIES, ...TREND_SERIES_EXTRA]}
      />

      <CombinedTrendChart
        title="性能趋势（按小时）"
        data={hourlyOfDay}
        xField="hour"
        loading={loading}
        series={[...TREND_SERIES, ...TREND_SERIES_EXTRA]}
        extra={
          <DatePicker
            value={clampedHourlyDay}
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
        loading={loading}
      />
      <PerformanceUrlTopList
        title="慢页面 Top（LCP）"
        data={perfByUrl.lcp}
        loading={loading}
      />
      <PerformanceUrlTopList
        title="慢页面 Top（Load）"
        data={perfByUrl.load}
        loading={loading}
      />
      <PerformanceUrlTopList
        title="慢页面 Top（DOM Ready）"
        data={perfByUrl.domReady}
        loading={loading}
      />
      <PerformanceUrlTopList
        title="慢页面 Top（TTFB）"
        data={perfByUrl.ttfb}
        loading={loading}
      />
      <PerformanceUrlTopList
        title="慢页面 Top（SPA LCP）"
        data={perfByUrl.spaLcp}
        loading={loading}
      />
    </div>
  );
}
