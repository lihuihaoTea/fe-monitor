# fe-monitor 数据库设计文档

> 本文档供开发 Agent 使用，描述当前 PostgreSQL 数据库的表结构、索引、约束及业务逻辑。
> 最后更新：2026-09-30（性能：日 min/max + 小时聚合 + URL Top N）

## 连接信息

```
DATABASE_URL=postgresql://monitor:monitor@localhost:5432/fe_monitor
```

- 数据库类型：PostgreSQL 16.15
- 时区：Asia/Shanghai
- 所属应用目录：`apps/server/`
- ORM/驱动：原生 `pg` Pool，封装于 `apps/server/src/db/index.ts`
- SQL 占位符：代码中使用 `?`，运行时通过 `pgPlaceholders()` 自动转换为 `$1, $2, ...`

---

## 表概览

| 表名 | 行数（约） | 大小 | 用途 |
|------|-----------|------|------|
| `events` | ~186万 | 895 MB | 原始事件存储（核心事实表） |
| `event_filters` | 49 | 16 kB | 事件过滤规则配置 |
| `event_daily_stats` | 按 app×日 | 小 | 按日聚合的统计指标（含性能 avg/min/max） |
| `event_daily_error_types` | 按 app×日×子类型 | 小 | 按日聚合的错误子类型计数 |
| `event_daily_visitors` | ~3.1万 | 2 MB | 按日去重访客记录 |
| `event_hourly_perf` | 按 app×小时×指标 | 小 | 性能小时聚合（一天内趋势） |
| `event_daily_perf_urls` | 按 app×日×指标×URL | 中 | 性能按 URL 日聚合（Top N 下钻） |

---

## 表结构详情

### 1. events（原始事件表）

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | integer | NOT NULL | SERIAL | 主键 |
| type | text | NOT NULL | - | 事件类型：`error`, `api`, `resource`, `behavior`, `performance`, `blank` |
| sub_type | text | YES | NULL | 子类型，如 `js`, `promise`, `404`, `pv`, `stay`, `fcp`, `lcp`, `load` |
| timestamp | bigint | NOT NULL | - | 事件发生时间（毫秒级 Unix 时间戳） |
| app_id | text | NOT NULL | - | 应用标识，有效值：`bsd`, `demo-app`, `dy-ht`, `qly` |
| session_id | text | NOT NULL | - | 会话 ID |
| visitor_id | text | NOT NULL | - | 访客 ID |
| url | text | NOT NULL | - | 页面 URL |
| user_agent | text | YES | NULL | 浏览器 UA |
| client_ip | text | YES | NULL | 客户端 IP |
| data | jsonb | YES | NULL | 事件详细数据（结构随 type/sub_type 变化） |
| created_at | bigint | NOT NULL | - | 入库时间（毫秒级 Unix 时间戳） |

#### data 字段结构（按 type 分类）

- **error**: `{ message, stack, filename, lineno, colno }`；sub_type=`404` 时 message 为 `'404'`
- **api**: `{ apiUrl, status, duration, method }`
- **resource**: `{ resourceUrl, tagName, statusCode }`
- **behavior/pv**: `{ title, referrer }`
- **behavior/stay**: `{ duration(ms), clickCount }`
- **performance/fcp|lcp**: `{ value(ms) }`
- **performance/load**: `{ value(ms), domReady(ms) }`

#### 索引

| 索引名 | 列 | 大小 | 用途 |
|--------|-----|------|------|
| `events_pkey` | `(id)` | 41 MB | 主键 |
| `idx_events_app_id` | `(app_id)` | 13 MB | 按应用查询 |
| `idx_events_type` | `(type)` | 13 MB | 按事件类型查询 |
| `idx_events_timestamp` | `(timestamp)` | 39 MB | 时间范围查询 |
| `idx_events_created_at` | `(created_at)` | 26 MB | 入库时间排序/清理 |
| `idx_events_visitor_id` | `(visitor_id)` | 15 MB | 访客维度查询 |
| `idx_events_app_ts` | `(app_id, timestamp)` | 55 MB | 应用+时间复合查询 |
| `idx_events_app_type_ts` | `(app_id, type, timestamp)` | 73 MB | 应用+类型+时间查询 |
| `idx_events_app_type_subtype_ts` | `(app_id, type, sub_type, timestamp)` | 86 MB | 精细维度时间查询 |
| `idx_sub_type_url` | `(sub_type, url)` | 146 MB | 资源/API 按 URL 检索 |

---

### 2. event_filters（事件过滤规则表）

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | integer | NOT NULL | SERIAL | 主键 |
| event_type | text | NOT NULL | - | 匹配的事件类型 |
| match_type | text | NOT NULL | - | 匹配方式：`host`, `url_prefix`, `url_exact` |
| match_value | text | NOT NULL | - | 匹配值 |
| enabled | smallint | NOT NULL | 1 | 是否启用（1=启用, 0=禁用） |
| note | text | YES | NULL | 备注说明 |
| created_at | bigint | NOT NULL | - | 创建时间（ms） |

#### 约束

- **UNIQUE**: `(event_type, match_type, match_value)` — 防止重复规则

#### 索引

| 索引名 | 列 | 说明 |
|--------|-----|------|
| `event_filters_pkey` | `(id)` | 主键 |
| `event_filters_event_type_match_type_match_value_key` | `(event_type, match_type, match_value)` | 唯一约束 |
| `idx_event_filters_enabled` | `(enabled)` | 快速加载启用规则 |

#### 匹配逻辑（服务端 `shouldFilterEvent`）

| match_type | 匹配规则 |
|------------|----------|
| `host` | URL hostname 完全匹配或以 `.host` 结尾（含子域名） |
| `url_prefix` | URL 以 match_value 开头 |
| `url_exact` | URL 完全等于 match_value |

> ⚠️ **重要**：过滤仅在事件**写入时**生效（`shouldFilterEvent`），stats API 查询时不应用过滤。历史脏数据需手动执行 `pnpm db:clean-filtered` 清理。

#### 管理命令

```bash
pnpm db:filters -- list                    # 列出所有规则
pnpm db:filters -- add --type <type> --match <match> --value <val> [--note <note>]
pnpm db:filters -- disable --id <id>
pnpm db:filters -- enable --id <id>
pnpm db:filters -- remove --id <id>
```

---

### 3. event_daily_stats（日聚合统计表）

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| app_id | text | - | 应用 ID |
| date | date | - | 日期 |
| js_errors | integer | 0 | JS/Promise 错误数 |
| resource_errors | integer | 0 | 资源加载失败数 |
| api_errors | integer | 0 | API 错误数 |
| blank_screens | integer | 0 | 白屏数 |
| not_found_404 | integer | 0 | 404 错误数 |
| other_issues | integer | 0 | 其他错误数 |
| pv | integer | 0 | 页面浏览量 |
| clicks | integer | 0 | 点击数 |
| stay_duration_sum | bigint | 0 | 停留时长总和（ms） |
| stay_count | integer | 0 | 停留记录数 |
| fcp_sum / fcp_count | bigint/int | 0 | FCP 总和/计数 |
| fcp_min / fcp_max | bigint | NULL | FCP 当日最小/最大（无样本为 NULL） |
| lcp_sum / lcp_count | bigint/int | 0 | LCP 总和/计数 |
| lcp_min / lcp_max | bigint | NULL | LCP 当日最小/最大 |
| load_sum / load_count | bigint/int | 0 | Load 总和/计数 |
| load_min / load_max | bigint | NULL | Load 当日最小/最大 |
| dom_ready_sum / dom_ready_count | bigint/int | 0 | DOM Ready 总和/计数 |
| dom_ready_min / dom_ready_max | bigint | NULL | DOM Ready 当日最小/最大 |

- **主键**: `(app_id, date)`
- **索引**: `idx_daily_stats_date (date)` — 按日期范围查询
- **区间汇总**：`SUM(sum)/SUM(count)` 得平均；`MIN(min)` / `MAX(max)` 得区间极值

#### 重建命令

```bash
pnpm db:rebuild-daily    # 全量重建（事务+锁表，防并发冲突）
```

> ⚠️ 重建会 TRUNCATE **全部聚合表**（日统计、错误类型、访客、小时性能、URL 性能）后重新 INSERT，执行期间阻塞所有写入。

---

### 4. event_daily_error_types（日错误子类型统计）

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| app_id | text | - | 应用 ID |
| date | date | - | 日期 |
| sub_type | text | - | 错误子类型（js/promise/404/manual 等） |
| count | integer | 0 | 该子类型当日计数 |

- **主键**: `(app_id, date, sub_type)`

---

### 5. event_daily_visitors（日去重访客表）

| 列名 | 类型 | 说明 |
|------|------|------|
| app_id | text | 应用 ID |
| date | date | 日期 |
| visitor_id | text | 访客 ID |

- **主键**: `(app_id, date, visitor_id)`
- **索引**: `idx_daily_visitors_app_date (app_id, date)`

---

### 6. event_hourly_perf（性能小时聚合）

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| app_id | text | - | 应用 ID |
| hour_start | timestamp | - | 本地时区整点（无时区） |
| metric | text | - | `fcp` / `lcp` / `load` / `dom_ready` |
| value_sum | bigint | 0 | 该小时该指标总和（ms） |
| value_count | int | 0 | 样本数 |
| value_min / value_max | bigint | NULL | 最小/最大 |

- **主键**: `(app_id, hour_start, metric)`
- **索引**: `idx_hourly_perf_app_hour (app_id, hour_start)`
- **用途**: 性能看板「选中单日」时按小时画趋势；写入时与日聚合同事务增量 UPSERT

---

### 7. event_daily_perf_urls（性能按 URL 日聚合 / Top N）

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| app_id | text | - | 应用 ID |
| date | date | - | 日期 |
| metric | text | - | `fcp` / `lcp` / `load` / `dom_ready` |
| url | text | - | 规范化 URL（去 query/hash，最长 500） |
| value_sum | bigint | 0 | 总和（ms） |
| value_count | int | 0 | 样本数 |
| value_min / value_max | bigint | NULL | 最小/最大 |

- **主键**: `(app_id, date, metric, url)`
- **索引**: `idx_daily_perf_urls_lookup (app_id, date, metric)`
- **Stats API**: 区间内按 URL 聚合后按 `avg` 降序取 Top N（默认 20，环境变量 `PERF_URL_TOP_N`）

---

## 关键注意事项（给开发 Agent）

### 1. SQL 别名必须使用小写/下划线
PostgreSQL 未加引号的驼峰别名会自动转为小写。Node.js `pg` 驱动返回的 key 也是小写。**禁止在 SQL 中使用驼峰别名**，统一使用 `snake_case`。

```sql
-- ❌ 错误
SELECT COUNT(*) AS resourceErrors FROM events

-- ✅ 正确
SELECT COUNT(*) AS resource_errors FROM events
```

### 2. 过滤规则仅写入时生效
`shouldFilterEvent()` 只在事件入库前调用。Stats API 直接查询聚合表，不会实时过滤。新增过滤规则后需运行：
```bash
pnpm db:clean-filtered -- --dry-run   # 预览影响
pnpm db:clean-filtered                 # 实际清理
pnpm db:rebuild-daily                  # 重建聚合数据
```

### 3. rebuild-daily 必须在事务中执行
`TRUNCATE` + `INSERT` 必须在同一事务内完成并加 `ACCESS EXCLUSIVE` 锁，否则 PM2 并发写入会导致主键冲突。已封装在 `withTransaction` 中，**不要拆分为独立 execute() 调用**。锁表范围含 `event_hourly_perf`、`event_daily_perf_urls`。

### 4. clean-filtered 采用分批处理
每批读取 1000 条（基于 id 游标分页），避免 895MB 大表全量加载导致 OOM。

### 5. initDB 包含建表和种子数据
`initDB()` 会自动 CREATE TABLE IF NOT EXISTS、ALTER 补齐性能 min/max 列，并插入默认过滤规则。若存在 events 但日聚合或小时聚合为空，会自动 `rebuildDailyStats()`。

### 6. 事件类型枚举
| type | sub_type 可选值 | 说明 |
|------|----------------|------|
| error | js, promise, 404, manual | 前端错误 |
| api | - | API 请求失败 |
| resource | - | 资源加载失败 |
| behavior | pv, stay | 用户行为 |
| performance | fcp, lcp, load | 性能指标（domReady 嵌在 load.data） |
| blank | - | 白屏检测 |

### 7. 性能看板读路径
- 汇总 avg/min/max：`event_daily_stats`
- 跨天趋势：日表 avg
- 单日趋势：`event_hourly_perf`
- 慢页面 Top N：`event_daily_perf_urls`
- 不再依赖 `events` 明细列表展示性能采样（明细仍可上报入库，供 rebuild）
