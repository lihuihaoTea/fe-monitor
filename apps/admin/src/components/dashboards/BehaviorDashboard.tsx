
import { Spin } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { useFilters } from '@/hooks/useFilters';

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
            {
              title: '页面访问 (PV)',
              value: behavior?.pv || 0,
              description:
                'Page View：页面浏览次数，用户每次进入或刷新页面计为 1 次访问。',
            },
            {
              title: '独立访客 (UV)',
              value: behavior?.uv || 0,
              description:
                'Unique Visitor：按访客标识去重后的独立访问人数，同一访客多次访问只计 1。',
            },
            {
              title: '总点击次数',
              value: behavior?.totalClicks || 0,
              description:
                '统计周期内页面点击事件累计次数，用于衡量交互活跃程度。',
            },
            {
              title: '平均停留',
              value: msToMinutes(behavior?.avgStay || 0),
              suffix: 'min',
              precision: 1,
              description:
                '用户单次访问的平均停留时长（离开页面前），反映页面粘性与内容吸引力。',
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
              precision: 1,
              transform: msToMinutes,
            },
          ]}
        />
      </div>
    </Spin>
  );
}
