/**
 * CDN / 早鸟 IIFE 入口。
 * 构建：tsup → dist/fe-monitor.min.js，全局名 FEMonitor
 */
import monitor from './monitor';

export default monitor;

if (typeof window !== 'undefined') {
  (window as any).FEMonitor = monitor;
  (window as any).__FE_MONITOR__ = monitor;
}
