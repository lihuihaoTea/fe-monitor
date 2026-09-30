import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';

import { formatNumberOrDash } from '@/lib/format';

import type { ECOption } from './echarts';

type SingleAxis<T> = Exclude<NonNullable<T>, unknown[]>;

const AXIS_LABEL_COLOR = 'rgba(0, 0, 0, 0.45)';
const AXIS_LINE_COLOR = 'rgba(0, 0, 0, 0.45)';
const SPLIT_LINE_COLOR = '#E6E9F0';

/**
 * 用 as const 固定 type，让默认轴是具体对象类型（可安全展开），
 * 避免标成 XAXisOption 联合后展开产生 boundaryGap / type 冲突。
 */
export const DEFAULT_Y_AXIS = {
  type: 'value' as const,
  axisLabel: {
    color: AXIS_LABEL_COLOR,
    formatter: (value: number) => formatNumberOrDash(value, { precision: 2 }),
  },
  splitLine: {
    lineStyle: {
      type: [4, 4] as [number, number],
      color: SPLIT_LINE_COLOR,
    },
  },
};

export const DEFAULT_X_AXIS = {
  type: 'category' as const,
  axisLabel: {
    color: AXIS_LABEL_COLOR,
    alignMinLabel: 'left' as const,
    alignMaxLabel: 'right' as const,
    hideOverlap: true,
  },
  axisLine: {
    lineStyle: {
      color: AXIS_LINE_COLOR,
    },
  },
};

export type ValueYAxisOption = typeof DEFAULT_Y_AXIS;
export type CategoryXAxisOption = typeof DEFAULT_X_AXIS;

export const DEFAULT_LEGEND: SingleAxis<ECOption['legend']> = {
  show: true,
  top: 0,
  itemWidth: 8,
  itemHeight: 8,
};

export const DEFAULT_CHART_OPTION: ECOption = {
  grid: {
    left: 0,
    right: 0,
    bottom: 0,
    top: 30,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  },
  legend: DEFAULT_LEGEND,
};

const SERIES_LEGEND_ICON = {
  line: 'circle',
  bar: 'roundRect',
} as const;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** 按 series 生成图例：折线 circle，柱状 roundRect，其他类型不改 icon */
export function withDefaultChartOption(option: ECOption): ECOption {
  if (Array.isArray(option.legend)) {
    return { ...DEFAULT_CHART_OPTION, ...option };
  }

  const seriesList = toArray(option.series);
  const hasCustomLegendIcon = seriesList.some(
    (series) =>
      isPlainObject(series) && (series.type === 'line' || series.type === 'bar')
  );

  const customLegend = isPlainObject(option.legend)
    ? (option.legend as SingleAxis<ECOption['legend']>)
    : null;

  const legend: SingleAxis<ECOption['legend']> = {
    ...DEFAULT_LEGEND,
    ...customLegend,
  };

  // ECharts 同时有 top/bottom 时 top 优先；业务写了 bottom 且未写 top 时去掉默认 top
  if (customLegend && customLegend.bottom != null && customLegend.top == null) {
    delete legend.top;
  }

  if (hasCustomLegendIcon) {
    const data = seriesList.flatMap((series) => {
      if (!isPlainObject(series) || series.name == null || series.name === '') {
        return [];
      }
      const name = String(series.name);
      if (series.type === 'line' || series.type === 'bar') {
        return [
          {
            name,
            icon: SERIES_LEGEND_ICON[series.type],
          },
        ];
      }
      return [{ name }];
    });
    if (data.length) {
      legend.data = data;
    }
  }

  return {
    ...DEFAULT_CHART_OPTION,
    ...option,
    legend,
  };
}

export const DEFAULT_LINE_TOOLTIP: SingleAxis<ECOption['tooltip']> = {
  show: true,
  trigger: 'axis',
  formatter: (params) => {
    const items = Array.isArray(params) ? params : [params];
    const first = items[0] as (typeof items)[number] & {
      axisValueLabel?: unknown;
      axisValue?: unknown;
    };
    const title = String(first?.axisValueLabel ?? first?.axisValue ?? '');
    const lines = items.map((item) => {
      const raw = Array.isArray(item.value)
        ? item.value[item.value.length - 1]
        : item.value;
      return `${item.marker ?? ''}${item.seriesName ?? ''} ${formatNumberOrDash(
        raw as number | string | null | undefined
      )}`;
    });
    return [title, ...lines].filter(Boolean).join('<br/>');
  },
  backgroundColor: 'rgba(0,0,0,0.60)',
  borderColor: 'transparent',
  textStyle: {
    color: '#fff',
    fontSize: 12,
  },
};

export const DEFAULT_PIE_TOOLTIP: SingleAxis<ECOption['tooltip']> = {
  show: true,
  formatter: (params) => {
    const item = Array.isArray(params) ? params[0] : params;
    if (!item) return '';
    const raw = Array.isArray(item.value)
      ? item.value[item.value.length - 1]
      : item.value;
    return `${item.marker ?? ''}${item.name ?? ''} ${formatNumberOrDash(
      raw as number | string | null | undefined
    )}`;
  },
};

const DEFAULT_LINEN_CHART_SERIES: LineSeriesOption = {
  type: 'line',
  smooth: true,
  lineStyle: {
    width: 4,
  },
};

/** 折线图通用配置 */
export const LINEN_CHART_OPTION = {
  grid: DEFAULT_CHART_OPTION.grid,
  yAxis: DEFAULT_Y_AXIS,
  xAxis: DEFAULT_X_AXIS,
  tooltip: DEFAULT_LINE_TOOLTIP,
  series: DEFAULT_LINEN_CHART_SERIES,
};

export const DEFAULT_BAR_TOOLTIP: SingleAxis<ECOption['tooltip']> = {
  show: true,
  trigger: 'item',
  formatter: (params) => {
    const item = Array.isArray(params) ? params[0] : params;
    if (!item) return '';
    return `${item.marker ?? ''}${item.name ?? ''} ${formatNumberOrDash(
      item.value as number | string | null | undefined
    )}`;
  },
};

const DEFAULT_BAR_CHART_SERIES: BarSeriesOption = {
  type: 'bar',
  barMaxWidth: 16,
  itemStyle: {
    borderRadius: [8, 8, 0, 0],
  },
};

/** 柱状图通用配置 */
export const BAR_CHART_OPTION = {
  grid: DEFAULT_CHART_OPTION.grid,
  yAxis: DEFAULT_Y_AXIS,
  xAxis: DEFAULT_X_AXIS,
  tooltip: DEFAULT_BAR_TOOLTIP,
  series: DEFAULT_BAR_CHART_SERIES,
};
