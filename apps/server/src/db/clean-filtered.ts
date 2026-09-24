/**
 * 按 event_filters 表清理历史脏数据。
 *
 * 用法：
 *   pnpm --filter @fe-monitor/server db:clean-filtered          # 实际删除
 *   pnpm --filter @fe-monitor/server db:clean-filtered -- --dry-run  # 仅预览
 *   pnpm --filter @fe-monitor/server db:clean-filtered -- --vacuum   # 删除后压缩库文件
 */
import { initDB, db } from './index.js';
import { loadEnabledFilters, shouldFilterEvent } from '../filters/eventFilters.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const doVacuum = args.has('--vacuum');

function parseData(raw: string | null): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function main() {
  initDB();

  console.log(`模式: ${dryRun ? 'dry-run（只统计不删除）' : '删除'}`);
  console.log('当前启用的筛除规则:');
  console.log(JSON.stringify(loadEnabledFilters(), null, 2));

  const types = [
    ...new Set(loadEnabledFilters().map((r) => r.event_type)),
  ];
  if (types.length === 0) {
    console.log('没有启用的筛除规则，退出');
    return;
  }

  const placeholders = types.map(() => '?').join(', ');
  const candidates = db
    .prepare(
      `SELECT id, type, data
       FROM events
       WHERE type IN (${placeholders})`
    )
    .all(...types) as Array<{ id: number; type: string; data: string | null }>;

  console.log(`候选事件（${types.join(',')}）: ${candidates.length}`);

  const toDeleteIds: number[] = [];
  const byType: Record<string, number> = {};

  for (const row of candidates) {
    const event = {
      type: row.type,
      data: parseData(row.data),
    };
    if (!shouldFilterEvent(event)) continue;
    toDeleteIds.push(row.id);
    byType[row.type] = (byType[row.type] || 0) + 1;
  }

  console.log('命中筛除规则待清理:');
  console.log(JSON.stringify(byType, null, 2));
  console.log(`合计: ${toDeleteIds.length}`);

  if (toDeleteIds.length === 0) {
    console.log('没有需要清理的数据');
    return;
  }

  if (dryRun) {
    console.log('dry-run 结束，未执行删除。去掉 --dry-run 再跑一次即可真正清理。');
    return;
  }

  const deleteOne = db.prepare('DELETE FROM events WHERE id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) {
      deleteOne.run(id);
    }
  });

  const batchSize = 500;
  let deleted = 0;
  for (let i = 0; i < toDeleteIds.length; i += batchSize) {
    const batch = toDeleteIds.slice(i, i + batchSize);
    tx(batch);
    deleted += batch.length;
    console.log(`已删除 ${deleted}/${toDeleteIds.length}`);
  }

  if (doVacuum) {
    console.log('执行 VACUUM 压缩数据库…');
    db.exec('VACUUM');
  }

  const remain = db
    .prepare(`SELECT COUNT(*) as count FROM events`)
    .get() as { count: number };
  console.log(`清理完成。当前 events 总量: ${remain.count}`);
}

main();
