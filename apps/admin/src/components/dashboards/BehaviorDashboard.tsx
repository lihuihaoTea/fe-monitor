'use client';

import { Spin } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { useFilters } from '@/context/FilterContext';

/** ms → 分钟，保留 1 位小数 */
function msToMinutes(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 60000) * 10) / 10;
}

export function BehaviorDashboard() {
  const { stats, loading } = useFilters();
  const behavior = stats?.behavior;
  const daily = stats?.daily || [];

  return (
    <Spin spinning={loading}>
      <div className="monitor-page">
        {/* 顺序与趋势图 series 一致，共用 CHART_PALETTE 下标 */}
        <MetricSummary
          loading={loading && !stats}
          items={[
            { title: '页面访问 (PV)', value: behavior?.pv || 0 },
            { title: '独立访客 (UV)', value: behavior?.uv || 0 },
            { title: '总点击次数', value: behavior?.totalClicks || 0 },
            {
              title: '平均停留',
              value: msToMinutes(behavior?.avgStay || 0),
              suffix: 'min',
              precision: 1,
            },
          ]}
        />
        <CombinedTrendChart
          title="行为趋势"
          data={daily}
          loading={loading && !stats}
          series={[
            { name: 'PV', field: 'pv' },
            { name: 'UV', field: 'uv' },
            { name: '点击次数', field: 'clicks' },
            {
              name: '平均停留',
              field: 'avgStay',
              yAxisIndex: 1,
              unit: 'min',
              yAxisName: '时长(min)',
              transform: msToMinutes,
            },
          ]}
        />
      </div>
    </Spin>
  );
}
