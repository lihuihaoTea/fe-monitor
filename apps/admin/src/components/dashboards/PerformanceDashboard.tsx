'use client';

import { Col, Row, Spin } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { TrendChart } from '@/components/TrendChart';
import { useFilters } from '@/context/FilterContext';

export function PerformanceDashboard() {
  const { stats, loading } = useFilters();
  const performance = stats?.performance ?? { fcp: 0, lcp: 0, load: 0, domReady: 0 };
  const daily = stats?.daily ?? [];

  return (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <MetricSummary
            loading={loading && !stats}
            items={[
              { title: 'FCP', value: performance.fcp || 0, suffix: 'ms' },
              { title: 'LCP', value: performance.lcp || 0, suffix: 'ms' },
              { title: '页面加载', value: performance.load || 0, suffix: 'ms' },
              { title: 'DOM Ready', value: performance.domReady || 0, suffix: 'ms' },
            ]}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="FCP 趋势" data={daily} yField="fcp" unit="ms" loading={loading && !stats} />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="LCP 趋势" data={daily} yField="lcp" unit="ms" loading={loading && !stats} />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="页面加载趋势" data={daily} yField="load" unit="ms" loading={loading && !stats} />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="DOM Ready 趋势" data={daily} yField="domReady" unit="ms" loading={loading && !stats} />
        </Col>
      </Row>
    </Spin>
  );
}
