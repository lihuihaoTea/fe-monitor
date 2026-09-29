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

/**
 * 耗时（毫秒）→ `xh ymin zs wms` 风格展示。
 * @example formatDuration(3661250) => "1h1min1s250ms"
 * @example formatDuration(125000) => "2min5s"
 * @example formatDuration(2150) => "2s150ms"
 * @example formatDuration(850) => "850ms"
 */
export function formatDuration(
  value: number | string | null | undefined
): string {
  if (value == null || value === '') return '-';
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms) || ms < 0) return '-';

  const total = Math.round(ms);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;

  if (hours === 0 && minutes === 0 && seconds === 0) {
    return `${millis}ms`;
  }

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}min`);
  if (seconds > 0 || (hours === 0 && minutes === 0)) {
    parts.push(`${seconds}s`);
  }
  if (millis > 0 && hours === 0 && minutes === 0) {
    parts.push(`${millis}ms`);
  }
  return parts.join('');
}
