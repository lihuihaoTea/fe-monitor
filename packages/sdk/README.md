# @fe-monitor/sdk

轻量级前端监控 SDK（TypeScript / ESM / CJS）。仓库已包含 `dist` 构建产物，安装后开箱即用。

## 业务项目安装（推荐）

仓库：`https://github.com/lihuihaoTea/fe-monitor`

```bash
pnpm add git+https://github.com/lihuihaoTea/fe-monitor.git#path:packages/sdk
# 或 SSH
pnpm add git+ssh://git@github.com:lihuihaoTea/fe-monitor.git#path:packages/sdk
```

或在 `package.json`：

```json
{
  "dependencies": {
    "@fe-monitor/sdk": "git+https://github.com/lihuihaoTea/fe-monitor.git#path:packages/sdk"
  }
}
```

固定分支 / tag：

```bash
pnpm add git+https://github.com/lihuihaoTea/fe-monitor.git#main&path:packages/sdk
```

## 使用

```ts
import monitor, { type MonitorConfig } from '@fe-monitor/sdk';

monitor.init({
  endpoint: 'https://api.lihuihao.chat/api/report',
  appId: 'your-app-id',
  sampleRate: 1,
  debug: false,
});

monitor.error(new Error('自定义错误'));
monitor.track('button_click', { name: '提交' });
```

## 维护者：更新 SDK 后

改完源码执行构建，**把 `packages/sdk/dist` 一并提交推送**：

```bash
pnpm build:sdk
git add packages/sdk
git commit -m "chore(sdk): build dist"
git push
```

其他可选方式：

```bash
# 打成 tgz 发给同事本地安装
pnpm pack:sdk
# 对方：pnpm add ./fe-monitor-sdk-1.0.0.tgz

# 若有 npm 账号，手动发布到 npm
pnpm publish:sdk
```

## License

MIT
