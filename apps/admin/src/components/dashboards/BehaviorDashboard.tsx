import { useEffect, useMemo, useState } from 'react';
import { DatePicker, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { PvPagesList } from '@/components/PvPagesList';
import { useFilters } from '@/hooks/useFilters';
import { useFilterStore } from '@/stores/filterStore';

/** ms → 分钟，保留 1 位小数 */
function msToMinutes(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 60000) * 10) / 10;
}

export function BehaviorDashboard() {
  const { stats, loading } = useFilters();
  const dateRange = useFilterStore((s) => s.dateRange);
  const rangeStart = dateRange[0].startOf('day');
  const rangeEnd = dateRange[1].startOf('day');
  const [pageDay, setPageDay] = useState<Dayjs>(() => rangeEnd);

  useEffect(() => {
    setPageDay((prev) => {
      if (prev.isBefore(rangeStart, 'day')) return rangeStart;
      if (prev.isAfter(rangeEnd, 'day')) return rangeEnd;
      return prev;
    });
  }, [rangeStart, rangeEnd]);

  const behavior = stats?.behavior;
  const daily = stats?.daily || [];

  const dayPages = useMemo(() => {
    const key = pageDay.format('YYYY-MM-DD');
    return (
      stats?.pvPagesByDay?.find((d) => d.date === key) || {
        date: key,
        top: [],
        bottom: [],
      }
    );
  }, [stats?.pvPagesByDay, pageDay]);

  return (
    <div className="monitor-page">
      <MetricSummary
        loading={loading}
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
        xField="date"
        loading={loading}
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

      <Space
        align="center"
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
        wrap
      >
        <Typography.Text type="secondary">
          按日页面访问排行（当天有访问的页面；最高 Top 10 / 最低 3）
        </Typography.Text>
        <DatePicker
          value={pageDay}
          allowClear={false}
          disabledDate={(current) => {
            if (!current) return false;
            return (
              current.isBefore(rangeStart, 'day') ||
              current.isAfter(rangeEnd, 'day')
            );
          }}
          onChange={(value) => {
            if (value) setPageDay(value.startOf('day'));
          }}
        />
      </Space>

      <PvPagesList
        title="访问量最高页面 Top 10"
        data={dayPages.top}
        loading={loading}
        sort="descend"
      />
      <PvPagesList
        title="访问量最低页面 Bottom 3"
        data={dayPages.bottom}
        loading={loading}
        sort="ascend"
      />
    </div>
  );
}
