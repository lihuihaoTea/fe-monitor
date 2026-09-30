/**
 * 按 event_filters 表清理历史脏数据（分批处理，避免 OOM）。
 *
 * 用法：
 *   pnpm db:clean-filtered -- --dry-run   # 仅预览
 *   pnpm db:clean-filtered               # 实际删除
 *   pnpm db:clean-filtered -- --analyze  # 删除后 ANALYZE
 */
import { initDB, closeDB, query, queryOne, execute } from './index.js';
import { loadEnabledFilters, shouldFilterEvent, } from '../filters/eventFilters.js';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const doAnalyze = args.has('--analyze') || args.has('--vacuum');
const BATCH_SIZE = 1000;
function parseData(raw) {
    if (raw == null)
        return {};
    if (typeof raw === 'object')
        return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        }
        catch {
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
    // 先统计候选总量
    const placeholders = types.map(() => '?').join(', ');
    const totalRow = await queryOne(`SELECT COUNT(*)::int as count FROM events WHERE type IN (${placeholders})`, types);
    const totalCandidates = Number(totalRow?.count) || 0;
    console.log(`候选事件（${types.join(',')}）: ${totalCandidates}`);
    const toDeleteIds = [];
    const byType = {};
    let processed = 0;
    let lastId = 0;
    // 分批读取候选事件
    while (true) {
        const batch = await query(`SELECT id, type, data FROM events
       WHERE type IN (${placeholders}) AND id > ?
       ORDER BY id ASC LIMIT ?`, [...types, lastId, BATCH_SIZE]);
        if (batch.length === 0)
            break;
        for (const row of batch) {
            const event = { type: row.type, data: parseData(row.data) };
            if (await shouldFilterEvent(event)) {
                toDeleteIds.push(Number(row.id));
                byType[row.type] = (byType[row.type] || 0) + 1;
            }
            lastId = Math.max(lastId, Number(row.id));
        }
        processed += batch.length;
        console.log(`已扫描 ${processed}/${totalCandidates}，命中 ${toDeleteIds.length}`);
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
        console.log('dry-run 结束，未执行删除。去掉 --dry-run 再跑一次即可真正清理。');
        await closeDB();
        return;
    }
    // 分批删除
    let deleted = 0;
    for (let i = 0; i < toDeleteIds.length; i += BATCH_SIZE) {
        const batchIds = toDeleteIds.slice(i, i + BATCH_SIZE);
        const ph = batchIds.map(() => '?').join(', ');
        const count = await execute(`DELETE FROM events WHERE id IN (${ph})`, batchIds);
        deleted += count;
        console.log(`已删除 ${deleted}/${toDeleteIds.length}`);
    }
    if (doAnalyze) {
        console.log('执行 ANALYZE…');
        await execute('ANALYZE events');
    }
    const remain = await queryOne(`SELECT COUNT(*)::int as count FROM events`);
    console.log(`清理完成。当前 events 总量: ${Number(remain?.count) || 0}`);
    await closeDB();
}
main().catch(async (err) => {
    console.error(err);
    await closeDB().catch(() => { });
    process.exit(1);
});
//# sourceMappingURL=clean-filtered.js.map