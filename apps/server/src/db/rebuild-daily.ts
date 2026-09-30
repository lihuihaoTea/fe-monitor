/**
 * 从 events 重建日聚合表。
 *
 * 用法：
 *   pnpm db:rebuild-daily
 */
import { initDB, closeDB, queryOne } from './index.js';
import { rebuildDailyStats } from './dailyStats.js';

async function main() {
  await initDB();
  console.log('开始重建日聚合…');
  const t0 = Date.now();
  await rebuildDailyStats();
  const stats = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_daily_stats`
  );
  const visitors = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_daily_visitors`
  );
  const hourly = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_hourly_perf`
  );
  const urls = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_daily_perf_urls`
  );
  const pvUrls = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM event_daily_pv_urls`
  );
  console.log(
    `完成：daily_stats=${Number(stats?.count) || 0}，visitors=${Number(visitors?.count) || 0}，hourly_perf=${Number(hourly?.count) || 0}，perf_urls=${Number(urls?.count) || 0}，pv_urls=${Number(pvUrls?.count) || 0}，耗时 ${Date.now() - t0}ms`
  );
  await closeDB();
}

main().catch(async (err) => {
  console.error(err);
  await closeDB().catch(() => {});
  process.exit(1);
});
