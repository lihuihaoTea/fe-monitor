import {
  BarChart,
  type BarSeriesOption,
  LineChart,
  type LineSeriesOption,
  type MapSeriesOption,
  PieChart,
  type PieSeriesOption,
  type ScatterSeriesOption,
  type TreemapSeriesOption,
} from "echarts/charts";
import {
  AxisPointerComponent,
  type GeoComponentOption,
  GridComponent,
  type GridComponentOption,
  LegendComponent,
  type LegendComponentOption,
  TooltipComponent,
  type TooltipComponentOption,
  type VisualMapComponentOption,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";
import * as echarts from "echarts/core";
import { LegacyGridContainLabel } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

import { CHART_THEME } from "./theme";

export const DEFAULT_CHART_THEME = "default";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  LegendComponent,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  CanvasRenderer,
  LegacyGridContainLabel,
]);

echarts.registerTheme(DEFAULT_CHART_THEME, CHART_THEME);

/** 当前按需注册模块对应的 option 类型（Treemap / Map / Scatter 在使用页再 register） */
export type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | TreemapSeriesOption
  | MapSeriesOption
  | ScatterSeriesOption
  | LegendComponentOption
  | GridComponentOption
  | TooltipComponentOption
  | GeoComponentOption
  | VisualMapComponentOption
>;

export type { ECharts, SetOptionOpts } from "echarts/core";
export default echarts;
