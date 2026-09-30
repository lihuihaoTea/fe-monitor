import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, theme } from 'antd';
import type { EChartsOption } from 'echarts';
import { CHART_PALETTE } from '@/lib/chartColors';
import { formatNumberOrDash } from '@/lib/format';

export type CombinedSeries<T> = {
  name: string;
  field: keyof T & string;
  yAxisIndex?: 0 | 1;
  unit?: string;
  yAxisName?: string;
  precision?: number;
  transform?: (value: number) => number;
};

interface CombinedTrendChartProps<T> {
  title: string;
  data: T[];
  xField: keyof T & string;
  series: CombinedSeries<T>[];
  loading?: boolean;
  height?: number;
  /** Card 右上角额外区域（如日期选择） */
  extra?: React.ReactNode;
}

export function CombinedTrendChart<T>({
  title,
  data,
  xField,
  series,
  loading,
  height = 360,
  extra,
}: CombinedTrendChartProps<T>) {
  const { token } = theme.useToken();
  const seriesKey = series
    .map(
      (s) =>
        `${s.name}:${s.field}:${s.yAxisIndex ?? 0}:${s.unit ?? ''}:${s.yAxisName ?? ''}:${s.precision ?? ''}`
    )
    .join('|');

  const option = useMemo<EChartsOption>(() => {
    const categories = (data || []).map((d) =>
      String((d as Record<string, unknown>)[xField] ?? '')
    );
    const rightSeries = series.find((s) => s.yAxisIndex === 1);
    const hasRightAxis = Boolean(rightSeries);
    const rightAxisName =
      rightSeries?.yAxisName ||
      (rightSeries?.unit ? `时长(${rightSeries.unit})` : '时长');

    const axisLabelColor = token.colorTextTertiary;
    const splitLineColor = token.colorSplit;
    const axisValueFormatter = (value: number) => formatNumberOrDash(value);

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
        valueFormatter: (value) => formatNumberOrDash(value),
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
        data: categories,
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
              axisLabel: {
                color: axisLabelColor,
                fontSize: 11,
                formatter: axisValueFormatter,
              },
              splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
            },
            {
              type: 'value',
              name: rightAxisName,
              min: 0,
              nameTextStyle: { color: axisLabelColor, fontSize: 11 },
              axisLabel: {
                color: axisLabelColor,
                fontSize: 11,
                formatter: axisValueFormatter,
              },
              splitLine: { show: false },
            },
          ]
        : {
            type: 'value',
            min: 0,
            axisLabel: {
              color: axisLabelColor,
              fontSize: 11,
              formatter: axisValueFormatter,
            },
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
          const raw = Number((d as Record<string, unknown>)[s.field]) || 0;
          const value = s.transform ? s.transform(raw) : raw;
          return Number.isFinite(value) ? value : 0;
        }),
        emphasis: { focus: 'series' as const },
        tooltip: {
          valueFormatter: (value: unknown) =>
            formatNumberOrDash(value, {
              precision: s.precision ?? (s.unit ? 1 : undefined),
              unit: s.unit,
            }),
        },
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data,
    xField,
    seriesKey,
    token.colorText,
    token.colorTextSecondary,
    token.colorTextTertiary,
    token.colorSplit,
    token.colorBorderSecondary,
  ]);

  return (
    <Card className="monitor-card" title={title} extra={extra} loading={loading}>
      <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />
    </Card>
  );
}
