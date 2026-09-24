# 前端监控系统 - 项目结构

## 目录结构

```
fe-monitor/
├── packages/
│   └── sdk/                      # 浏览器 SDK
│       ├── src/
│       │   ├── collectors/       # 各种数据收集器
│       │   │   ├── error.ts      # JS 错误收集
│       │   │   ├── resource.ts   # 资源加载失败收集
│       │   │   ├── api.ts        # API 失败收集
│       │   │   ├── blank.ts      # 白屏检测
│       │   │   ├── performance.ts # 性能指标收集
│       │   │   └── behavior.ts   # 用户行为收集
│       │   ├── monitor.ts        # 主监控类
│       │   ├── reporter.ts       # 数据上报器
│       │   ├── types.ts          # TypeScript 类型定义
│       │   ├── utils.ts          # 工具函数
│       │   └── index.ts          # 入口文件
│       ├── dist/                 # 构建产物（CJS + ESM + .d.ts）
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
│
├── apps/
│   ├── server/                   # 数据收集服务
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── index.ts      # 数据库连接
│   │   │   │   └── init.ts       # 数据库初始化脚本
│   │   │   ├── routes/
│   │   │   │   ├── report.ts     # 数据上报路由
│   │   │   │   └── stats.ts      # 统计查询路由
│   │   │   └── index.ts          # Express 服务入口
│   │   ├── data/
│   │   │   └── monitor.db        # SQLite 数据库文件
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── admin/                    # 管理后台
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx    # 根布局
│   │   │   │   ├── page.tsx      # 主页面
│   │   │   │   └── globals.css   # 全局样式
│   │   │   └── components/
│   │   │       ├── StabilityPanel.tsx      # 稳定性面板
│   │   │       ├── PerformancePanel.tsx    # 性能面板
│   │   │       ├── BehaviorPanel.tsx       # 用户行为面板
│   │   │       └── DailyTrendChart.tsx     # 每日趋势图表
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   ├── postcss.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── demo/                     # 演示页面
│       ├── index.html            # 主页面
│       ├── main.js               # 业务逻辑
│       └── package.json
│
├── .gitignore
├── package.json                  # 根 package.json
├── pnpm-workspace.yaml           # pnpm 工作区配置
├── pnpm-lock.yaml                # 依赖锁文件
├── tsconfig.json                 # TypeScript 基础配置
├── start-all.sh                  # 启动脚本
└── README.md                     # 项目文档
```

## 端口分配

- **3100**: 数据收集服务 (Express)
- **3000**: 管理后台 (Vite)
- **3200**: 演示页面 (Vite)

## 主要命令

```bash
# 安装
pnpm install

# 构建 SDK
pnpm build:sdk

# 初始化数据库
pnpm db:init

# 启动开发服务
pnpm dev:server   # 端口 3100
pnpm dev:admin    # 端口 3000
pnpm dev:demo     # 端口 3200

# 一键启动所有服务
./start-all.sh

# 构建所有项目
pnpm build
```

## 数据流向

```
浏览器 (Demo/用户应用)
    ↓ SDK 收集事件
    ↓ 批量上报 (sendBeacon/fetch)
数据服务 (Express)
    ↓ 存储到 SQLite
    ↓ 提供统计 API
管理后台 (Next.js)
    ↓ 查询和展示数据
用户查看监控面板
```

## 功能模块

### SDK 功能
1. ✅ 错误监控（JS 错误、Promise 拒绝）
2. ✅ 资源监控（加载失败）
3. ✅ API 监控（请求失败）
4. ✅ 白屏检测
5. ✅ 性能监控（FCP/LCP/Load）
6. ✅ 行为追踪（PV/UV/停留/点击）

### 服务端功能
1. ✅ 事件收集接口
2. ✅ 统计查询接口
3. ✅ 爬虫过滤
4. ✅ 数据验证

### 管理后台功能
1. ✅ 稳定性面板（错误统计）
2. ✅ 性能面板（FCP/LCP 等）
3. ✅ 用户行为面板（PV/UV）
4. ✅ 每日趋势图表
5. ✅ 日期筛选

## 技术特性

- 🚀 零依赖 SDK（轻量级）
- 📦 Monorepo 架构（pnpm）
- 🔒 完整类型支持（TypeScript）
- 📊 可视化图表（Recharts）
- 🎨 现代化 UI（Tailwind CSS）
- 🗄️ 轻量级数据库（SQLite）
- 🌐 本地开发友好（CORS 支持）
- 🇨🇳 中文界面和文档
