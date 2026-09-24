/** 看板统一调色盘：指标汇总数字与趋势图曲线共用 */
export const CHART_PALETTE = [
  '#1677ff',
  '#52c41a',
  '#fa8c16',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
] as const;

export function chartColorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
