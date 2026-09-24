'use client';

import { Col, Row, Spin } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { TrendChart } from '@/components/TrendChart';
import { useFilters } from '@/context/FilterContext';

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`;
  }
  return `${seconds}秒`;
}

export function BehaviorDashboard() {
  const { stats, loading } = useFilters();
  const behavior = stats?.behavior;
  const daily = stats?.daily || [];

  return (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <MetricSummary
            loading={loading && !stats}
            items={[
              { title: '页面访问 (PV)', value: behavior?.pv || 0 },
              { title: '独立访客 (UV)', value: behavior?.uv || 0 },
              { title: '平均停留', value: formatDuration(behavior?.avgStay || 0) },
              { title: '总点击次数', value: behavior?.totalClicks || 0 },
            ]}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="PV 趋势" data={daily} yField="pv" loading={loading && !stats} />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="UV 趋势" data={daily} yField="uv" loading={loading && !stats} />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="停留时长趋势" data={daily} yField="avgStay" unit="ms" loading={loading && !stats} />
        </Col>
        <Col xs={24} lg={12}>
          <TrendChart title="点击次数趋势" data={daily} yField="clicks" loading={loading && !stats} />
        </Col>
      </Row>
    </Spin>
  );
}
