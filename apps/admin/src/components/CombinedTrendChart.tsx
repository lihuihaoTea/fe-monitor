'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, theme } from 'antd';
import type { EChartsOption } from 'echarts';
import type { DailyPoint } from '@/lib/types';
import { CHART_PALETTE } from '@/lib/chartColors';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export type CombinedSeries = {
  name: string;
  field: keyof DailyPoint;
  /** 使用右侧 Y 轴（适合量纲不同的指标） */
  yAxisIndex?: 0 | 1;
  unit?: string;
  /** 右侧 Y 轴名称，缺省取 unit */
  yAxisName?: string;
  /** 原始值转换（如 ms → min） */
  transform?: (value: number) => number;
};

interface CombinedTrendChartProps {
  title: string;
  data: DailyPoint[];
  series: CombinedSeries[];
  loading?: boolean;
  height?: number;
}

export function CombinedTrendChart({
  title,
  data,
  series,
  loading,
  height = 360,
}: CombinedTrendChartProps) {
  const { token } = theme.useToken();
  const seriesKey = series
    .map((s) => `${s.name}:${s.field}:${s.yAxisIndex ?? 0}:${s.unit ?? ''}:${s.yAxisName ?? ''}`)
    .join('|');

  const option = useMemo<EChartsOption>(() => {
    const dates = (data || []).map((d) => d.date);
    const rightSeries = series.find((s) => s.yAxisIndex === 1);
    const hasRightAxis = Boolean(rightSeries);
    const rightAxisName =
      rightSeries?.yAxisName ||
      (rightSeries?.unit ? `时长(${rightSeries.unit})` : '时长');

    const axisLabelColor = token.colorTextTertiary;
    const splitLineColor = token.colorSplit;

    return {
      color: [...CHART_PALETTE],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: token.colorBorderSecondary,
        borderWidth: 1,
        textStyle: { color: token.colorText, fontSize: 12 },
        extraCssText: 'box-shadow: 0 6px 16px rgba(0,0,0,0.08); border-radius: 8px;',
      },
      legend: {
        type: 'scroll',
        top: 4,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: token.colorTextSecondary, fontSize: 12 },
        data: series.map((s) => s.name),
        selectedMode: true,
      },
      grid: {
        left: 16,
        right: hasRightAxis ? 24 : 12,
        top: 44,
        bottom: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: token.colorBorderSecondary } },
        axisTick: { show: false },
        axisLabel: { hideOverlap: true, color: axisLabelColor, fontSize: 11 },
      },
      yAxis: hasRightAxis
        ? [
            {
              type: 'value',
              name: '次数',
              min: 0,
              nameTextStyle: { color: axisLabelColor, fontSize: 11, padding: [0, 0, 0, 8] },
              axisLabel: { color: axisLabelColor, fontSize: 11 },
              splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
            },
            {
              type: 'value',
              name: rightAxisName,
              min: 0,
              nameTextStyle: { color: axisLabelColor, fontSize: 11 },
              axisLabel: { color: axisLabelColor, fontSize: 11 },
              splitLine: { show: false },
            },
          ]
        : {
            type: 'value',
            min: 0,
            axisLabel: { color: axisLabelColor, fontSize: 11 },
            splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
          },
      series: series.map((s) => ({
        name: s.name,
        type: 'line' as const,
        smooth: true,
        showSymbol: false,
        symbolSize: 6,
        lineStyle: { width: 2.5 },
        yAxisIndex: s.yAxisIndex ?? 0,
        data: (data || []).map((d) => {
          const raw = Number(d[s.field]) || 0;
          const value = s.transform ? s.transform(raw) : raw;
          return Number.isFinite(value) ? value : 0;
        }),
        emphasis: { focus: 'series' as const },
        ...(s.unit
          ? {
              tooltip: {
                valueFormatter: (value: unknown) => {
                  if (value == null || value === '') return '-';
                  const num = typeof value === 'number' ? value : Number(value);
                  const shown = Number.isFinite(num) ? num.toFixed(1) : value;
                  return `${shown} ${s.unit}`;
                },
              },
            }
          : {}),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, seriesKey, token.colorText, token.colorTextSecondary, token.colorTextTertiary, token.colorSplit, token.colorBorderSecondary]);

  return (
    <Card className="monitor-card" title={title} loading={loading}>
      <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />
    </Card>
  );
}
