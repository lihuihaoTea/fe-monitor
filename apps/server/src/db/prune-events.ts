/**
 * 定时清理过期原始事件。看板趋势读聚合表，明细仅服务于列表/P50/rebuild。
 *
 * 环境变量：
 *   EVENTS_TTL_DAYS         behavior/performance 保留天数，默认 7；0=不清理该类
 *   EVENTS_DETAIL_TTL_DAYS  error/api/resource/blank 保留天数，默认 30；0=不清理该类
 *
 * 用法：
 *   pnpm db:prune-events -- --dry-run
 *   pnpm db:prune-events
 */
import { initDB, closeDB, queryOne, execute } from './index.js';

const BATCH_SIZE = 500;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 已有小时/日聚合覆盖看板趋势 */
const AGG_BACKED_TYPES = ['behavior', 'performance'] as const;
/** 稳定性列表仍依赖明细，单独更长 TTL */
const DETAIL_TYPES = ['error', 'api', 'resource', 'blank'] as const;

export async function pruneExpiredEvents(options?: {
  ttlDays?: number;
  detailTtlDays?: number;
  dryRun?: boolean;
}): Promise<{
  deleted: number;
  total: number;
  cutoffAgg: number;
  cutoffDetail: number;
}> {
  const ttlDays = options?.ttlDays ?? Number(process.env.EVENTS_TTL_DAYS ?? 7);
  const detailTtlDays =
    options?.detailTtlDays ?? Number(process.env.EVENTS_DETAIL_TTL_DAYS ?? 30);
  const dryRun = options?.dryRun ?? false;

  let deleted = 0;
  let total = 0;
  let cutoffAgg = 0;
  let cutoffDetail = 0;

  const runBatch = async (types: readonly string[], days: number) => {
    if (!Number.isFinite(days) || days <= 0 || types.length === 0) {
      return { deleted: 0, total: 0, cutoff: 0 };
    }
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const placeholders = types.map(() => '?').join(', ');
    if (dryRun) {
      const totalRow = await queryOne<{ count: string | number }>(
        `SELECT COUNT(*)::int as count FROM events
         WHERE type IN (${placeholders}) AND created_at < ?`,
        [...types, cutoff]
      );
      return { deleted: 0, total: Number(totalRow?.count) || 0, cutoff };
    }

    let batchDeleted = 0;
    while (true) {
      const result = await execute(
        `DELETE FROM events
         WHERE id IN (
           SELECT id FROM events
           WHERE type IN (${placeholders}) AND created_at < ?
           ORDER BY id ASC
           LIMIT ?
         )`,
        [...types, cutoff, BATCH_SIZE]
      );
      if (!result) break;
      batchDeleted += result;
      await sleep(200); // throttle IO to avoid blocking
      if (result < BATCH_SIZE) break;
    }
    return { deleted: batchDeleted, total: batchDeleted, cutoff };
  };

  const agg = await runBatch(AGG_BACKED_TYPES, ttlDays);
  deleted += agg.deleted;
  total += agg.total;
  cutoffAgg = agg.cutoff;

  const detail = await runBatch(DETAIL_TYPES, detailTtlDays);
  deleted += detail.deleted;
  total += detail.total;
  cutoffDetail = detail.cutoff;

  return { deleted, total, cutoffAgg, cutoffDetail };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ttlDays = Number(process.env.EVENTS_TTL_DAYS ?? 7);
  const detailTtlDays = Number(process.env.EVENTS_DETAIL_TTL_DAYS ?? 30);

  await initDB({ autoRebuild: false });

  console.log(
    `模式: ${dryRun ? 'dry-run' : '删除'}；` +
      `behavior/performance 保留 ${ttlDays} 天；` +
      `error/api/resource/blank 保留 ${detailTtlDays} 天`
  );

  const result = await pruneExpiredEvents({ ttlDays, detailTtlDays, dryRun });
  console.log(
    `agg_cutoff=${result.cutoffAgg ? new Date(result.cutoffAgg).toISOString() : '-'}；` +
      `detail_cutoff=${result.cutoffDetail ? new Date(result.cutoffDetail).toISOString() : '-'}；` +
      `待清理=${result.total}；已删除=${result.deleted}`
  );
  if (dryRun) console.log('dry-run 结束，未执行删除');

  await closeDB();
}

const isCli =
  process.argv[1]?.includes('prune-events') ||
  process.env.npm_lifecycle_event === 'db:prune-events';

if (isCli) {
  main().catch(async (err) => {
    console.error(err);
    await closeDB().catch(() => {});
    process.exit(1);
  });
}
