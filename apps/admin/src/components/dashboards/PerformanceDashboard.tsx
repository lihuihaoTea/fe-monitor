
import { Spin } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { useFilters } from '@/context/FilterContext';

export function PerformanceDashboard() {
  const { stats, loading } = useFilters();
  const performance = stats?.performance ?? { fcp: 0, lcp: 0, load: 0, domReady: 0 };
  const daily = stats?.daily ?? [];

  return (
    <Spin spinning={loading}>
      <div className="monitor-page">
        <MetricSummary
          loading={loading && !stats}
          items={[
            { title: 'FCP', value: performance.fcp || 0, suffix: 'ms' },
            { title: 'LCP', value: performance.lcp || 0, suffix: 'ms' },
            { title: '页面加载', value: performance.load || 0, suffix: 'ms' },
            { title: 'DOM Ready', value: performance.domReady || 0, suffix: 'ms' },
          ]}
        />
        <CombinedTrendChart
          title="性能趋势"
          data={daily}
          loading={loading && !stats}
          series={[
            { name: 'FCP', field: 'fcp', unit: 'ms' },
            { name: 'LCP', field: 'lcp', unit: 'ms' },
            { name: '页面加载', field: 'load', unit: 'ms' },
            { name: 'DOM Ready', field: 'domReady', unit: 'ms' },
          ]}
        />
      </div>
    </Spin>
  );
}
