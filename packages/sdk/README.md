# fe-monitor-kit

轻量级前端监控 SDK（TypeScript / ESM / CJS）。

## 安装

```bash
pnpm add fe-monitor-kit
# 或
npm install fe-monitor-kit
# 或
yarn add fe-monitor-kit
```

## 使用

```ts
import monitor, { type MonitorConfig } from 'fe-monitor-kit';

monitor.init({
  endpoint: 'https://api.lihuihao.chat/api/report',
  appId: 'your-app-id',
  sampleRate: 1,
  debug: false,
});

monitor.error(new Error('自定义错误'));
monitor.track('button_click', { name: '提交' });
```

## License

MIT
