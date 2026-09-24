# 前端监控系统 (FE Monitor)

一个简洁、完整的前端可观测性监控 Monorepo，包含 SDK、数据收集服务和管理后台。

## 📦 项目结构

```
fe-monitor/
├── packages/
│   └── sdk/                 # @fe-monitor/sdk - 浏览器 SDK
├── apps/
│   ├── server/             # @fe-monitor/server - 数据收集服务 (Express + SQLite)
│   ├── admin/              # @fe-monitor/admin - 管理后台 (Next.js)
│   └── demo/               # @fe-monitor/demo - 演示页面
└── pnpm-workspace.yaml     # pnpm 工作区配置
```

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- pnpm >= 8

### 安装依赖

```bash
pnpm install
```

### 初始化数据库

```bash
pnpm db:init
```

### 构建 SDK

```bash
pnpm build:sdk
```

### 启动服务

在三个不同的终端窗口分别运行：

```bash
# 终端 1: 启动数据收集服务 (端口 3100)
pnpm dev:server

# 终端 2: 启动管理后台 (端口 3000)
pnpm dev:admin

# 终端 3: 启动演示页面 (端口 3200)
pnpm dev:demo
```

或使用启动脚本（如果有）：

```bash
./start-all.sh
```

### 访问应用

- **演示页面**: http://localhost:3200
- **管理后台**: http://localhost:3000
- **数据 API**: https://api.lihuihao.chat

## 📖 SDK 使用方法

### 安装（推荐，无需 CI）

仓库已提交 SDK 构建产物，业务项目直接依赖 Git 子目录即可，**不用再本地编译**：

```bash
pnpm add git+ssh://git@gitlab.sucoupon.com:lihuihao/fe-monitor.git#path:packages/sdk
```

其他方式：

```bash
# 安装本地/内网分发的 tgz（本仓库执行 pnpm pack:sdk 生成）
pnpm add ./fe-monitor-sdk-1.0.0.tgz

# 若已发布到 npm
pnpm add @fe-monitor/sdk
```

### 初始化

```javascript
import monitor from '@fe-monitor/sdk';

monitor.init({
  endpoint: 'https://api.lihuihao.chat/api/report',  // 数据上报地址
  appId: 'your-app-id',                          // 应用标识
  sampleRate: 1,                                  // 采样率 (0-1), 默认 1
  debug: false,                                   // 调试模式, 默认 false
});
```

### 手动上报错误

```javascript
monitor.error(new Error('自定义错误'), { extra: 'data' });
```

### 自定义事件追踪

```javascript
monitor.track('button_click', {
  buttonName: '提交按钮',
  page: '首页',
});
```

## 🎯 监控功能

### 1. 稳定性监控

- ✅ JS 运行时错误捕获 (`window.onerror`)
- ✅ 未处理的 Promise 拒绝 (`unhandledrejection`)
- ✅ 资源加载失败 (JS/CSS/图片等)
- ✅ API 请求失败 (Fetch/XHR, status >= 400 或网络错误)
- ✅ 白屏检测 (简单启发式)

### 2. 性能监控

- ✅ FCP (First Contentful Paint)
- ✅ LCP (Largest Contentful Paint)
- ✅ 页面加载时间
- ✅ DOM Ready 时间
- ✅ DNS/TCP/TTFB 时间

### 3. 用户行为

- ✅ PV (Page View) - 页面访问量
- ✅ UV (Unique Visitor) - 独立访客 (基于客户端 IP)
- ✅ 停留时长
- ✅ 点击次数
- ✅ 自定义事件

## 🛠️ 技术栈

### SDK (`packages/sdk`)
- TypeScript
- tsup (构建工具)
- 零依赖，轻量级

### 数据服务 (`apps/server`)
- Express.js
- better-sqlite3
- TypeScript + tsx

### 管理后台 (`apps/admin`)
- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Recharts (图表)

### 演示页面 (`apps/demo`)
- Vite
- 原生 HTML/JS

## 🗄️ 数据模型

### 事件表 (events)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| type | TEXT | 事件类型: error/resource/api/blank/performance/behavior |
| sub_type | TEXT | 子类型 |
| timestamp | INTEGER | 客户端时间戳 |
| app_id | TEXT | 应用 ID |
| session_id | TEXT | 会话 ID |
| visitor_id | TEXT | 访客 ID |
| url | TEXT | 页面 URL |
| user_agent | TEXT | User Agent |
| client_ip | TEXT | 客户端 IP |
| data | TEXT | JSON 数据 |
| created_at | INTEGER | 服务端接收时间 |

## 📊 API 接口

### 数据上报

```
POST /api/report
Content-Type: application/json

{
  "events": [
    {
      "type": "error",
      "subType": "js",
      "timestamp": 1234567890,
      "appId": "demo-app",
      "sessionId": "xxx",
      "visitorId": "yyy",
      "url": "https://example.com",
      "userAgent": "...",
      "data": { ... }
    }
  ]
}
```

### 统计查询

```
GET /api/stats?appId=demo-app&startDate=2024-01-01&endDate=2024-01-31
```

返回：

```json
{
  "errors": { "total": 100, "byType": [...] },
  "stability": { "resourceErrors": 10, "apiErrors": 20, "blankScreens": 0 },
  "performance": { "fcp": 1200, "lcp": 2000, "load": 3000 },
  "behavior": { "pv": 5000, "uv": 1200, "avgStay": 45000, "totalClicks": 8000 },
  "daily": [...]
}
```

## 🔧 开发脚本

```json
{
  "dev:server": "启动数据服务 (开发模式)",
  "dev:admin": "启动管理后台 (开发模式)",
  "dev:demo": "启动演示页面 (开发模式)",
  "build:sdk": "构建 SDK",
  "build:server": "构建服务端",
  "build:admin": "构建管理后台",
  "build": "构建所有项目",
  "db:init": "初始化数据库"
}
```

## 🎨 特性

### SDK 特性
- 🚀 轻量级，无第三方依赖
- 📦 支持 ESM/CJS 双格式
- 🔒 类型安全 (TypeScript)
- 🎯 智能批量上报 (最多 10 条或 5 秒)
- 💾 使用 sendBeacon 确保数据不丢失
- 🎲 支持采样率配置
- 🤖 自动过滤爬虫流量

### 服务端特性
- 🗄️ 轻量级 SQLite 数据库
- 🚫 自动过滤爬虫请求
- 🌐 CORS 支持 (本地开发)
- 📊 丰富的统计 API
- 💪 数据验证和清洗

### 管理后台特性
- 📱 响应式设计
- 🎨 现代化 UI (Tailwind CSS)
- 📈 可视化图表 (Recharts)
- 📅 日期范围筛选
- 🔄 实时数据刷新
- 🇨🇳 中文界面

## 📝 注意事项

1. **生产环境配置**
   - 修改 CORS 设置
   - 使用环境变量管理配置
   - 考虑使用 PostgreSQL/MySQL 替代 SQLite
   - 添加认证和权限控制

2. **性能优化**
   - 根据实际流量调整采样率
   - 定期清理历史数据
   - 考虑引入消息队列处理高并发

3. **安全建议**
   - 验证 appId 合法性
   - 限制请求频率 (Rate Limiting)
   - 数据脱敏处理
   - HTTPS 传输

## 📄 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
