'use client';

import { Card } from 'antd';
import { Line } from '@ant-design/charts';
import type { DailyPoint } from '@/lib/types';

interface TrendChartProps {
  title: string;
  data: DailyPoint[];
  yField: keyof DailyPoint;
  loading?: boolean;
  unit?: string;
}

export function TrendChart({ title, data, yField, loading, unit }: TrendChartProps) {
  const chartData = (data || []).map((item) => ({
    ...item,
    [yField]: Number(item[yField]) || 0,
  }));

  const config = {
    data: chartData,
    xField: 'date',
    yField: yField as string,
    height: 280,
    smooth: true,
    // 默认不展示点，仅 hover tooltip 时显示 marker
    point: false,
    scale: {
      y: {
        domainMin: 0,
        nice: true,
      },
    },
    axis: {
      y: {
        title: unit || false,
      },
    },
    interaction: {
      tooltip: {
        shared: true,
        marker: true,
      },
    },
    tooltip: {
      items: [{ field: yField as string, name: title }],
    },
    style: {
      lineWidth: 2,
    },
  };

  return (
    <Card title={title} loading={loading}>
      <Line {...config} />
    </Card>
  );
}
