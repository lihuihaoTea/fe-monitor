import { Spin } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { PerformanceEventList } from '@/components/PerformanceEventList';
import { useFilters } from '@/hooks/useFilters';

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
            {
              title: 'FCP',
              value: performance.fcp || 0,
              suffix: 'ms',
              description:
                'First Contentful Paint：首次内容绘制，页面首次渲染出文本、图片等内容的时间。',
            },
            {
              title: 'LCP',
              value: performance.lcp || 0,
              suffix: 'ms',
              description:
                'Largest Contentful Paint：最大内容绘制，视口内最大可见元素完成渲染的时间，反映主要内容可读时机。',
            },
            {
              title: '页面加载',
              value: performance.load || 0,
              suffix: 'ms',
              description:
                'Load：页面 load 事件触发耗时，含资源下载与完整加载完成所需时间。',
            },
            {
              title: 'DOM Ready',
              value: performance.domReady || 0,
              suffix: 'ms',
              description:
                'DOMContentLoaded：HTML 解析完成、DOM 树可用的时间，早于全部资源加载完成。',
            },
          ]}
        />
        <CombinedTrendChart
          title="性能趋势"
          data={daily}
          loading={loading && !stats}
          series={[
            { name: 'FCP', field: 'fcp', unit: 'ms', precision: 0 },
            { name: 'LCP', field: 'lcp', unit: 'ms', precision: 0 },
            { name: '页面加载', field: 'load', unit: 'ms', precision: 0 },
            { name: 'DOM Ready', field: 'domReady', unit: 'ms', precision: 0 },
          ]}
        />

        <PerformanceEventList title="首次内容绘制 (FCP)" metric="fcp" />
        <PerformanceEventList title="最大内容绘制 (LCP)" metric="lcp" />
        <PerformanceEventList title="页面完整加载 (Load)" metric="load" />
        <PerformanceEventList title="DOM 解析完成 (DOM Ready)" metric="domReady" />
      </div>
    </Spin>
  );
}
