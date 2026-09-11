# SDK 包
@fe-monitor/sdk

## 简介

轻量级前端监控 SDK，自动收集错误、性能和用户行为数据。

## 安装

```bash
npm install @fe-monitor/sdk
# 或
pnpm add @fe-monitor/sdk
```

包由 GitHub Actions 在打 `v*` tag 时自动发布到 npm。

## 快速开始

```javascript
import monitor from '@fe-monitor/sdk';

monitor.init({
  endpoint: 'https://your-api.com/api/collect',
  appId: 'your-app-id',
  sampleRate: 1,
  debug: false,
});
```

## API

### `monitor.init(config)`

初始化监控 SDK。

**参数：**

- `endpoint` (string, 必填): 数据上报地址
- `appId` (string, 必填): 应用标识
- `sampleRate` (number, 可选): 采样率，0-1 之间，默认 1
- `debug` (boolean, 可选): 是否开启调试模式，默认 false

### `monitor.error(error, extra?)`

手动上报错误。

**参数：**

- `error` (Error | string): 错误对象或错误信息
- `extra` (any, 可选): 额外的上下文信息

### `monitor.track(eventType, data)`

自定义事件追踪。

**参数：**

- `eventType` (string): 事件类型
- `data` (any): 事件数据

## 自动收集功能

- JS 错误
- Promise 拒绝
- 资源加载失败
- API 请求失败
- 白屏检测
- FCP/LCP
- 页面加载时间
- PV/UV
- 停留时长
- 点击次数

## License

MIT
