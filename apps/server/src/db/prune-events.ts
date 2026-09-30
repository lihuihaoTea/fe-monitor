/**
 * 清理过期的 behavior / performance 原始事件（聚合表已覆盖看板读路径）。
 *
 * 环境变量：
 *   EVENTS_TTL_DAYS  保留天数，默认 7；设为 0 则跳过清理
 *
 * 用法：
 *   pnpm db:prune-events -- --dry-run
 *   pnpm db:prune-events
 */
import { initDB, closeDB, queryOne, execute } from './index.js';

const BATCH_SIZE = 2000;
const TYPES = ['behavior', 'performance'] as const;

export async function pruneExpiredEvents(options?: {
  ttlDays?: number;
  dryRun?: boolean;
}): Promise<{ deleted: number; total: number; cutoff: number }> {
  const ttlDays = options?.ttlDays ?? Number(process.env.EVENTS_TTL_DAYS ?? 7);
  const dryRun = options?.dryRun ?? false;

  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    return { deleted: 0, total: 0, cutoff: 0 };
  }

  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  const placeholders = TYPES.map(() => '?').join(', ');
  const totalRow = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM events
     WHERE type IN (${placeholders}) AND created_at < ?`,
    [...TYPES, cutoff]
  );
  const total = Number(totalRow?.count) || 0;

  if (total === 0 || dryRun) {
    return { deleted: 0, total, cutoff };
  }

  let deleted = 0;
  while (true) {
    const result = await execute(
      `DELETE FROM events
       WHERE id IN (
         SELECT id FROM events
         WHERE type IN (${placeholders}) AND created_at < ?
         ORDER BY id ASC
         LIMIT ?
       )`,
      [...TYPES, cutoff, BATCH_SIZE]
    );
    if (!result) break;
    deleted += result;
    if (result < BATCH_SIZE) break;
  }

  return { deleted, total, cutoff };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ttlDays = Number(process.env.EVENTS_TTL_DAYS ?? 7);

  await initDB();

  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    console.log(`EVENTS_TTL_DAYS=${ttlDays}，跳过清理`);
    await closeDB();
    return;
  }

  console.log(
    `模式: ${dryRun ? 'dry-run' : '删除'}；类型=${TYPES.join(',')}；保留 ${ttlDays} 天`
  );

  const result = await pruneExpiredEvents({ ttlDays, dryRun });
  console.log(
    `cutoff=${new Date(result.cutoff).toISOString()}；待清理=${result.total}；已删除=${result.deleted}`
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
