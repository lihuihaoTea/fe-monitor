/**
 * 统一数字格式化（千分位）。
 * @example formatNumber(1234567) => "1,234,567"
 * @example formatNumber(12.345, { precision: 1 }) => "12.3"
 */
export function formatNumber(
  value: number | string | null | undefined,
  options?: { precision?: number }
): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';

  if (options?.precision != null) {
    return n.toLocaleString('zh-CN', {
      minimumFractionDigits: options.precision,
      maximumFractionDigits: options.precision,
    });
  }

  return n.toLocaleString('zh-CN');
}

/** ECharts / tooltip 等场景：空值显示为 '-' */
export function formatNumberOrDash(
  value: unknown,
  options?: { precision?: number; unit?: string }
): string {
  if (value == null || value === '') return '-';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '-';
  const text = formatNumber(n, { precision: options?.precision });
  return options?.unit ? `${text} ${options.unit}` : text;
}
