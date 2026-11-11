# fe-monitor-kit

轻量级前端监控 SDK（TypeScript，零运行时依赖）。

| 能力 | 说明 |
|------|------|
| 稳定性 | JS / Promise 错误、资源加载失败、API 失败、白屏 |
| 性能 | FCP / LCP / Load / DOM Ready 等 |
| 行为 | PV、停留、点击、自定义事件 |
| 静态资源守卫 | 入口脚本失败、preload、超时未就绪；可 soft-retry / hard-reload |

同时支持两条接入路径：

1. **npm ESM/CJS** — 现代工程默认接入  
2. **CDN IIFE** — `fe-monitor.min.js` 放在 `<head>` 最前，覆盖「入口资源都没起来」的场景  

同页只应存在**一个**运行时实例（`window.__FE_MONITOR__` / `window.FEMonitor`）。先 IIFE `init`，再 `import` npm 包会自动复用并合并配置。

---

## 安装

```bash
pnpm add fe-monitor-kit
# 或
npm install fe-monitor-kit
# 或
yarn add fe-monitor-kit
```

包导出：

| 入口 | 用途 |
|------|------|
| `fe-monitor-kit` | ESM / CJS + 类型 |
| `fe-monitor-kit/vite` | Vite 插件（早鸟注入 IIFE） |
| `fe-monitor-kit/min` | IIFE 文件路径（也可走 unpkg / jsDelivr） |

CDN：

```text
https://cdn.jsdelivr.net/npm/fe-monitor-kit/dist/fe-monitor.min.js
https://unpkg.com/fe-monitor-kit/dist/fe-monitor.min.js
```

---

## 快速开始（npm）

```ts
import monitor from 'fe-monitor-kit';

monitor.init({
  endpoint: 'https://api.example.com/api/report',
  appId: 'your-app-id',
  sampleRate: 1,
  debug: false,
});

// 入口执行完毕（尤其开启了 assetGuard / collectorsAfterReady 时）
monitor.markAppReady();

// 登录后打标用户（会写入后续事件的 data.user，并持久化到 sessionStorage）
monitor.setUser({ userId: '10001', userName: '张三' });

// 手动上报
monitor.error(new Error('自定义错误'), { page: 'checkout' });
monitor.track('button_click', { name: '提交' });

// 退出登录
monitor.clearUser();
```

---

## 推荐：Vite 早鸟注入 + npm API

路径 2 在 HTML 最早阶段注入 IIFE，能捕获入口 chunk 加载失败；路径 1 在应用代码里补全 `onRecover`、`setUser`、`markAppReady` 等。

### 1）`vite.config.ts`

```ts
import feMonitor from 'fe-monitor-kit/vite';

export default {
  plugins: [
    feMonitor({
      // 可选；缺省插在 <meta charset> / <head> 后
      // placeholder: '<!--fe-monitor-inject-->',
      init: {
        endpoint: 'https://api.example.com/api/report',
        appId: 'your-app-id',
        collectors: {
          assetGuard: true,
          // 应用未就绪前先关掉「业务向」采集，避免半成品页面灌噪声
          api: false,
          performance: false,
          behavior: false,
          blank: false,
        },
        collectorsAfterReady: {
          api: true,
          performance: true,
          behavior: true,
        },
        assetGuard: {
          enabled: true,
          // RegExp 可直接传，或传源码字符串（插件会序列化）
          assetPathRe: /\/assets\/.+\.(?:js|mjs|css)$/i,
          autoRecover: true,
          reportObserve: false, // 故障量只看 severity=hard
        },
      },
      // 无法 JSON 序列化的回调用字符串注入
      onRecoverCode: `function () { location.reload(); }`,
      // resolveAppIdCode: `function () { return 'my-app'; }`,
      // isAppWebViewCode: `function () { return /MyApp\\//.test(navigator.userAgent); }`,
    }),
  ],
};
```

插件选项：

| 字段 | 说明 |
|------|------|
| `placeholder` | HTML 占位注释，默认 `<!--fe-monitor-inject-->` |
| `init` | 传给 `FEMonitor.init` 的配置（RegExp 会序列化） |
| `onRecoverCode` | `assetGuard.onRecover` 函数源码字符串 |
| `resolveAppIdCode` | 动态 `appId`：`() => string` 源码 |
| `isAppWebViewCode` | `assetGuard.isAppWebView` 源码 |
| `initScript` | 完全自定义 init 脚本（覆盖自动生成） |
| `iifePath` | 自定义 IIFE 路径；默认包内 `dist/fe-monitor.min.js` |

> 构建前需保证包内已有 IIFE（发布产物已包含；本地改 SDK 后请先 `pnpm build`）。

### 2）`main.ts`

```ts
import monitor from 'fe-monitor-kit';

// 复用 IIFE 单例，可再 patch 配置
monitor.init({
  /* 例如补上只能在业务侧拿到的回调 */
});

monitor.markAppReady();
```

### 手写 CDN（不用 Vite 插件）

```html
<head>
  <script src="https://cdn.jsdelivr.net/npm/fe-monitor-kit/dist/fe-monitor.min.js"></script>
  <script>
    FEMonitor.init({
      endpoint: 'https://api.example.com/api/report',
      appId: 'your-app-id',
      collectors: { assetGuard: true },
    });
  </script>
</head>
```

---

## 配置参考 `MonitorConfig`

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `endpoint` | `string` | **必填** | 上报地址，如 `https://host/api/report` |
| `appId` | `string` | **必填** | 应用标识，后台按此筛选 |
| `sampleRate` | `number` | `1` | 采样率 `0–1`；未命中则整页不初始化 |
| `debug` | `boolean` | `false` | 控制台打印事件与配置 |
| `collectors` | `object` | 见下 | `init` 时立即安装的采集器 |
| `collectorsAfterReady` | `object` | `{}` | `markAppReady()` 后再安装（仅对 init 时未装的项生效） |
| `assetGuard` | `AssetGuardConfig` | `{}` | 静态资源守卫细项 |

### `collectors` / `collectorsAfterReady`

| 键 | 默认（collectors） | 说明 |
|----|-------------------|------|
| `error` | `true` | `window.onerror` / `unhandledrejection` |
| `resource` | `true` | 图片等资源 `error`（与 assetGuard 协作去重） |
| `api` | `true` | Fetch / XHR，`status >= 400` 或网络错误 |
| `blank` | `true` | 白屏启发式 |
| `performance` | `true` | FCP / LCP / Load / DOM Ready 等 |
| `behavior` | `true` | PV、停留、点击 |
| `assetGuard` | `false` | 静态资源守卫；`assetGuard.enabled` 也会打开 |

典型「早鸟只守卫、就绪后再采业务」：

```ts
monitor.init({
  endpoint: '...',
  appId: '...',
  collectors: {
    assetGuard: true,
    error: true,
    resource: true,
    api: false,
    blank: false,
    performance: false,
    behavior: false,
  },
  collectorsAfterReady: {
    api: true,
    blank: true,
    performance: true,
    behavior: true,
  },
  assetGuard: { /* ... */ },
});

// 根组件 / 路由就绪后
monitor.markAppReady();
```

---

## API

| 方法 | 说明 |
|------|------|
| `init(config)` | 初始化；二次调用合并配置并尽量安装 `collectorsAfterReady` |
| `markAppReady()` | 取消 timeout-guard，并安装 `collectorsAfterReady` |
| `setUser({ userId, userName })` | 登录打标；写入 `sessionStorage`，后续事件带 `data.user` |
| `clearUser()` | 清除用户标记 |
| `getUser()` | 当前用户标记 |
| `error(err, extra?)` | 手动错误；`message === '404'` 时 `subType` 为 `404`，否则 `manual` |
| `track(eventType, data)` | 自定义行为，`type=behavior`，`subType=eventType` |
| `isInitialized()` / `isAppReady()` / `getConfig()` | 状态查询 |
| `destroy()` | 卸载采集器并 flush 队列 |
| `getSharedMonitor()` | 取页面单例（一般用 default export 即可） |

全局别名（IIFE / 初始化后）：`window.FEMonitor`、`window.__FE_MONITOR__`。

---

## 采集能力与事件类型

上报体为 `POST endpoint`，JSON：`{ "events": MonitorEvent[] }`。

```ts
interface MonitorEvent {
  type: 'error' | 'resource' | 'api' | 'blank' | 'performance' | 'behavior';
  subType?: string;
  timestamp: number;
  appId: string;
  sessionId: string;
  visitorId: string;
  url: string;
  userAgent: string;
  data: Record<string, unknown>; // 可能含 user
}
```

| type | 常见 subType | 来源 |
|------|--------------|------|
| `error` | `js` / `promise` / `manual` / `404` | ErrorCollector / `error()` |
| `resource` | `img` / `script` / … / assetGuard 子类型 | Resource / AssetGuard |
| `api` | `fetch` / `xhr` | ApiCollector |
| `blank` | 启发式原因 | BlankCollector |
| `performance` | `fcp` / `lcp` / `load` / `domReady` 等 | PerformanceCollector |
| `behavior` | `pv` / `stay` / 自定义 | BehaviorCollector / `track()` |

上报策略：队列满 10 条或每 5s flush；页面卸载时尽量送出；`assetGuard` hard 事件立即上报。

---

## 静态资源守卫（assetGuard）

用于构建产物（JS/CSS）加载失败、Vite preload 失败、入口长时间未 `markAppReady`。

### `AssetGuardConfig`

| 字段 | 默认 | 说明 |
|------|------|------|
| `enabled` | — | 与 `collectors.assetGuard` 等价打开 |
| `assetPathRe` | `/(?:assets\/)?[^/]+\.(?:js\|mjs\|css)$/i` | 纳入守卫的 pathname |
| `entryPathRe` | `/\/index-[^/]+\.js$/i` | 入口脚本判定 |
| `allowedHosts` | 含 `location.hostname` | 额外允许的资源 host |
| `reportHosts` | 空=都报 | 仅这些页面 host 上报 |
| `readyTimeoutMs` | `25000` | 等待 `markAppReady` 超时 |
| `timeoutExtendMs` / `timeoutMaxMs` / `timeoutExtendMax` | `15s` / `60s` / `2` | 超时延长 |
| `softRetryMax` | `2` | soft-retry 次数 |
| `dedupWindowMs` | `3000` | 同类失败去重窗口 |
| `reloadMax` / `reloadTtlMs` | `3` / `10min` | hard-reload 次数与 TTL |
| `reloadStorageKey` | `fe-monitor-asset-reload` | 计数存储 key |
| `autoRecover` | `false` | hard 上报后是否自动恢复 |
| `reportObserve` | `true` | 是否上报 observe（soft-retry 等）；`false` 则只看 hard |
| `onRecover` | — | 自定义恢复；返回 `false` 阻止默认 reload |
| `isAppWebView` | — | App WebView 判定钩子 |

### subType / severity / action

| subType | 含义 |
|---------|------|
| `script-link` | 构建资源 `<script>` / `<link>` `error` |
| `preload` | `vite:preloadError` / 动态 import 失败 |
| `timeout-guard` | 超时仍未 `markAppReady` |

| severity | 含义 |
|----------|------|
| `hard` | 计入故障量；可触发恢复 |
| `observe` | soft-retry / defer-preload 等观测 |

| action | 含义 |
|--------|------|
| `soft-retry` | 软重试资源 |
| `hard-reload` | 硬刷新页面 |
| `defer-preload` | 延后 preload |
| `retry-exhausted` | 重试用尽 |
| `''` | 无动作 |

`data.failReason` 示例：`dynamic-import`、`silent-timeout` 等。

---

## 双路径同页

```html
<!-- head：IIFE 早鸟 -->
<script src="/fe-monitor.min.js"></script>
<script>FEMonitor.init({ endpoint: '...', appId: '...', collectors: { assetGuard: true } });</script>
```

```ts
// main.ts：npm，复用同一单例
import monitor from 'fe-monitor-kit';

monitor.init({ /* 可合并 onRecover、collectorsAfterReady 等 */ });
monitor.markAppReady();
monitor.setUser({ userId: 1, userName: 'Alice' });
```

注意：

- 不要在同页加载两份不同版本的 IIFE。
- `sampleRate` 未命中时整页跳过初始化；早鸟与 npm 共用同一判定结果取决于谁先成功 `init`。
- `setUser` 需要同时提供非空的 `userId` 与 `userName`。

---

## License

MIT
