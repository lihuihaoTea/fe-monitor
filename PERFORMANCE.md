# 页面性能指标计算说明

> 梳理 fe-monitor 中 FCP / LCP / Load / DOM Ready 的采集、校验、聚合与看板口径。  
> 表结构细节以 [`DATABASE.md`](DATABASE.md) 为准；SDK 接入见 [`packages/sdk/README.md`](packages/sdk/README.md)。  
> 最后更新：2026-11-12（P50 落日/小时聚合；Stats 读路径离开 events）

---

## 1. 指标一览

| 看板名称 | 事件 `type` | `sub_type` | 浏览器来源 | 计算公式（SDK） | 单位 |
|----------|-------------|------------|------------|-----------------|------|
| FCP | `performance` | `fcp` | Paint Timing：`first-contentful-paint` | `entry.startTime` | ms |
| LCP | `performance` | `lcp` | Largest Contentful Paint | 最终候选的 `entry.startTime`（URL 取候选更新时） | ms |
| 页面加载 / Load | `performance` | `load` | Navigation Timing | `loadEventEnd - fetchStart` | ms |
| DOM Ready | （嵌在 load） | — → 聚合为 `dom_ready` | Navigation Timing | `domContentLoadedEventEnd - fetchStart` | ms |
| TTFB | （嵌在 load） | — → 聚合为 `ttfb` | Navigation Timing | `responseStart - requestStart` | ms |
| SPA LCP | `performance` | `spa_lcp` | 路由后 LCP 候选 | `lcp.startTime - routeStartedAt` | ms |
| 超限丢弃 | `performance` | `over_budget` | — | 原 value 超过上限 | — |

附带字段（随 `load` 上报）：

| 字段 | 含义 | 看板 |
|------|------|------|
| `data.ttfb` | `responseStart - requestStart` | ✅ TTFB |
| `data.dns` | `domainLookupEnd - domainLookupStart` | 未单独展示 |
| `data.tcp` | `connectEnd - connectStart` | 未单独展示 |

**时间原点**：上述 `startTime` / Navigation Timing 差值，均相对 **当前 Document 的 navigation time origin**（整页加载起点），**不是** Hash/History 路由切换起点。

---

## 2. 端到端数据流

```text
浏览器 Performance API
        │
        ▼
SDK PerformanceCollector
  · 校验 0 < value ≤ 60000
  · 组装 MonitorEvent
        │
        ▼
Reporter 队列（满 10 条或 5s / 卸载 flush）
        │
        ▼
POST /api/report
  · 校验字段、粗筛 UA bot
  · event_filters（按 URL，一般不筛 performance）
  · INSERT events（明细，TTL 默认 7 天）
  · applyRollup → 日/小时/URL 聚合
        │
        ▼
GET /api/stats
  · 读 event_daily_stats / event_hourly_perf / event_daily_perf_urls
  · avg = ROUND(sum / count)；min/max 跨日再 MIN/MAX
  · p50 读聚合列（单日精确；跨日按 count 加权近似）
        │
        ▼
Admin 性能看板（均值卡片 + 日/小时趋势 + URL Top）
```

关键代码：

| 环节 | 路径 |
|------|------|
| 采集 | `packages/sdk/src/collectors/performance.ts` |
| 上报 | `packages/sdk/src/reporter.ts` |
| 入库+rollup | `apps/server/src/routes/report.ts` → `apps/server/src/db/dailyStats.ts` |
| 查询 | `apps/server/src/routes/stats.ts` |
| 展示 | `apps/admin/src/components/dashboards/PerformanceDashboard.tsx` |

---

## 3. SDK 采集细节

### 3.1 FCP

1. `PerformanceObserver` 观察 `paint`（`buffered: true`）。
2. 取 `entry.name === 'first-contentful-paint'` 的 `startTime`。
3. 每页只报一次（`fcpReported`），随后 disconnect。
4. 无效则丢弃（见 §4）。

### 3.2 LCP

1. 观察 `largest-contentful-paint`（`buffered: true`），持续更新最新 `startTime`，并记下**当时** `location.href`。
2. Flush 时机：`hidden` / `pagehide` / **8s 超时** / **requestIdleCallback** / **`markAppReady` 后 1s** / **路由切换前**。
3. 每 Document 导航只报一次 Document LCP。

### 3.3 Load / DOM Ready

1. 优先 `performance.getEntriesByType('navigation')[0]`（Level 2，相对时间）。
2. 回退 legacy `performance.timing`（绝对时间戳，相减得时长）。
3. 安装时若 `document.readyState === 'complete'`（晚装 / `collectorsAfterReady`），立即尝试上报；否则等 `load`。
4. `loadEventEnd === 0` 等导致差值非法时整笔 load 不上报；`domReady` 非法则只省略该字段。

### 3.4 事件载荷示例

```json
{
  "type": "performance",
  "subType": "load",
  "timestamp": 1731400000000,
  "appId": "qly",
  "sessionId": "...",
  "visitorId": "...",
  "url": "https://qlydata.com/#/login",
  "userAgent": "...",
  "data": {
    "metric": "load",
    "value": 1838,
    "domReady": 1200,
    "dns": 12,
    "tcp": 30,
    "ttfb": 180
  }
}
```

`url` 取 **上报时刻** 的 `location.href`（含 hash）。

---

## 4. 样本有效区间

SDK 与服务端统一（可配置）：

```text
0 < value ≤ maxPerfMetricMs   （默认 60000 毫秒）
```

| 位置 | 配置 |
|------|------|
| SDK | `MonitorConfig.maxPerfMetricMs` |
| Server | 环境变量 `PERF_MAX_METRIC_MS` → `MAX_PERF_METRIC_MS` |

超限：SDK 上报 `subType=over_budget`（计入 `perf_over_budget`），合法指标不进 AVG；服务端 rollup/rebuild 同样过滤。

看板 **P50** 写入 `event_daily_stats.*_p50` / `event_hourly_perf.value_p50`（上报批末或 `rebuild-daily` 用 `percentile_cont(0.5)` 回填）。Stats **读路径不再扫** `events`。无样本时 P50 为 0；跨日区间为按日 P50 的 count 加权近似。

> 部署后执行 `pnpm db:rebuild-daily` 回填历史 P50。

---

## 5. 服务端聚合口径

### 5.1 从事件到增量

`extractPerfSamples(event)`：

- `fcp` / `lcp` / `load` → 各自一条 `{ metric, value }`
- `load` 且 `data.domReady` 合法 → 额外一条 `dom_ready`

`buildDailyDelta` 对每个合法样本：`sum += value`，`count += 1`，并更新当日 min/max。

### 5.2 存储

| 表 | 用途 |
|----|------|
| `event_daily_stats` | 按日：fcp/lcp/load/dom_ready/**ttfb**/**spa_lcp** + **\*_p50** + **perf_over_budget** |
| `event_hourly_perf` | 按 `app_id × hour_start × metric`（含 **value_p50**；metric 含 ttfb/spa_lcp） |
| `event_daily_perf_urls` | 按日 × metric × URL |
| `events` | 原始明细；`behavior`/`performance` 默认 **7 天 TTL**（仅供写入回填 / rebuild） |

URL 规范化：去掉 search，并处理 hash 内 query（详见 `normalizePageUrl` / `DATABASE.md`）。

### 5.3 Stats API 展示值

| 字段 | 计算 |
|------|------|
| 区间平均 | `ROUND(SUM(sum) / SUM(count))` |
| 区间 P50 | 日表 `*_p50` 按 `count` 加权；单日 = 当日精确值 |
| 区间最小 | `MIN(min)`（已处理 `NULL`） |
| 区间最大 | `MAX(max)` |
| 日/小时趋势 | 各 metric 的 `sum/count`；小时另有 `value_p50` |
| 慢页 Top | URL 聚合 avg |
| overBudget | 超上限丢弃次数 |

---

## 6. 与 Web Vitals「真实体验」的差异

| 点 | 本系统现状 | 影响 |
|----|------------|------|
| 路由模型 | Document 指标 + **spa_lcp** | Load/FCP 仍不按路由重置；SPA 看 spa_lcp |
| 汇总方式 | AVG + **P50** | 优先看 P50 |
| LCP 上报时机 | hidden / pagehide / 超时 / idle / ready / 路由前 | 短访仍可能无 LCP，已明显好于只 hidden |
| URL 归因 | LCP 用候选更新时 URL | 离开换路由不再错归 |
| 样本集合 | 各指标独立 count | 看板已注明 |
| TTFB | 已展示 | dns/tcp 仍仅在 load.data |
| CLS / INP | 未采集 | — |
| 超大 startTime | 上限 + over_budget | 不进 AVG |

---

## 7. 已排查的问题与结论

### 7.1 qly 指标夸张、dy-h5 正常

- **不是** `sum/count` 算错。
- qly 为桌面长驻 Hash SPA（`qlydata.com/#/...`），存在「距首次打开数天」的 FCP/LCP 样本；dy-h5 同类极值极少。
- 证据：同 `session_id` 可先出现 FCP≈6.66 天，数秒后再出现正常 ~1.8s 样本；qly FCP **p50 正常、AVG 被长尾拉爆**。
- 缓解：SDK + 服务端 `≤60s` 过滤；历史看板需 `rebuild-daily`。

### 7.2 Load 使用 deprecated `performance.timing`

- 已优先 Level 2；legacy 作回退。
- `loadEventEnd=0` 时不再上报脏差值。

### 7.3 晚装 PerformanceCollector

- `readyState === 'complete'` 时补报 Load；FCP/LCP 依赖 `buffered: true` 读历史条目。

---

## 8. 已修复项（原缺口）与仍可选优化

### 已修复

1. ✅ 看板 **AVG + P50**（P50 落日/小时聚合；读路径不依赖明细 TTL）
2. ✅ LCP 多时机 flush + **候选 URL 归因**
3. ✅ **spa_lcp**（hash / history 路由级）
4. ✅ **TTFB** 入库与看板
5. ✅ `maxPerfMetricMs` / `PERF_MAX_METRIC_MS` + **over_budget** 计数
6. ✅ `LEAST(NULL,x)` min 更新加固
7. ✅ Bot UA 过宽规则收紧（去掉裸 `/http/i`、`/java/i` 等）
8. ✅ 看板注明样本集独立

### 仍可选

- P75 / 会话齐套均值（同次导航四件套）
- CLS / INP
- dns/tcp 独立卡片
- 部署后务必：`pnpm db:rebuild-daily`（纠正历史 AVG；TTL 外无法重算）
- 确认业务未关闭 `collectors.performance`

---

## 9. 运维速查

```bash
# 本地 / 服务器：按过滤规则重建聚合（锁表，避开高峰）
pnpm db:rebuild-daily

# 预览即将按 TTL 删除的 performance/behavior 明细
pnpm db:prune-events -- --dry-run
```

云库抽查（示例）：

```sql
-- 某 app 性能均值是否仍被长尾污染（明细层）
SELECT sub_type,
       round(avg((data->>'value')::numeric)) AS avg_all,
       round(avg((data->>'value')::numeric)
         FILTER (WHERE (data->>'value')::float <= 60000)) AS avg_le_60s,
       count(*) FILTER (WHERE (data->>'value')::float > 60000) AS over_60s
FROM events
WHERE type = 'performance' AND app_id = 'qly'
  AND sub_type IN ('fcp', 'lcp', 'load')
GROUP BY 1;
```

---

## 10. 相关文档

- [`DATABASE.md`](DATABASE.md) — 表、索引、rollup、TTL  
- [`packages/sdk/README.md`](packages/sdk/README.md) — SDK 接入与 collectors  
- [`LOCAL_CLOUD.md`](LOCAL_CLOUD.md) — 本地连云库（gitignored）  
