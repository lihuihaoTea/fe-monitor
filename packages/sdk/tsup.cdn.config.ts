import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'fe-monitor.min': 'src/cdn.ts',
  },
  format: ['iife'],
  // 不用 globalName：避免 var FEMonitor={default:…} 覆盖 window.FEMonitor 实例
  minify: true,
  platform: 'browser',
  target: 'es2015',
  outDir: 'dist',
  clean: false,
  dts: false,
  footer: {
    js: 'window.FEMonitor=window.__FE_MONITOR__;',
  },
});
