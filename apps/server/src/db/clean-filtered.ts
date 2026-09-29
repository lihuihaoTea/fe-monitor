/**
 * 按 event_filters 表清理历史脏数据。
 *
 * 用法：
 *   pnpm db:clean-filtered -- --dry-run   # 仅预览
 *   pnpm db:clean-filtered               # 实际删除
 *   pnpm db:clean-filtered -- --analyze  # 删除后 ANALYZE
 */
import { initDB, closeDB, query, queryOne, execute } from './index.js';
import {
  loadEnabledFilters,
  shouldFilterEvent,
} from '../filters/eventFilters.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const doAnalyze = args.has('--analyze') || args.has('--vacuum');

function parseData(raw: unknown): any {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

async function main() {
  await initDB();

  console.log(`模式: ${dryRun ? 'dry-run（只统计不删除）' : '删除'}`);
  const rules = await loadEnabledFilters();
  console.log('当前启用的筛除规则:');
  console.log(JSON.stringify(rules, null, 2));

  const types = [...new Set(rules.map((r) => r.event_type))];
  if (types.length === 0) {
    console.log('没有启用的筛除规则，退出');
    await closeDB();
    return;
  }

  const placeholders = types.map(() => '?').join(', ');
  const candidates = await query<{
    id: number;
    type: string;
    data: unknown;
  }>(
    `SELECT id, type, data
     FROM events
     WHERE type IN (${placeholders})`,
    types
  );

  console.log(`候选事件（${types.join(',')}）: ${candidates.length}`);

  const toDeleteIds: number[] = [];
  const byType: Record<string, number> = {};

  for (const row of candidates) {
    const event = {
      type: row.type,
      data: parseData(row.data),
    };
    if (!(await shouldFilterEvent(event))) continue;
    toDeleteIds.push(Number(row.id));
    byType[row.type] = (byType[row.type] || 0) + 1;
  }

  console.log('命中筛除规则待清理:');
  console.log(JSON.stringify(byType, null, 2));
  console.log(`合计: ${toDeleteIds.length}`);

  if (toDeleteIds.length === 0) {
    console.log('没有需要清理的数据');
    await closeDB();
    return;
  }

  if (dryRun) {
    console.log(
      'dry-run 结束，未执行删除。去掉 --dry-run 再跑一次即可真正清理。'
    );
    await closeDB();
    return;
  }

  const batchSize = 500;
  let deleted = 0;
  for (let i = 0; i < toDeleteIds.length; i += batchSize) {
    const batch = toDeleteIds.slice(i, i + batchSize);
    const ph = batch.map(() => '?').join(', ');
    const count = await execute(
      `DELETE FROM events WHERE id IN (${ph})`,
      batch
    );
    deleted += count;
    console.log(`已删除 ${deleted}/${toDeleteIds.length}`);
  }

  if (doAnalyze) {
    console.log('执行 ANALYZE…');
    await execute('ANALYZE events');
  }

  const remain = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int as count FROM events`
  );
  console.log(`清理完成。当前 events 总量: ${Number(remain?.count) || 0}`);
  await closeDB();
}

main().catch(async (err) => {
  console.error(err);
  await closeDB().catch(() => {});
  process.exit(1);
});
