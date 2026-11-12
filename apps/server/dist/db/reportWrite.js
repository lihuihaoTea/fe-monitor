import { applyRollupBatch, schedulePerfP50Refresh } from './dailyStats.js';
import { clientQuery, withTransaction } from './index.js';
const pending = [];
let queuedEvents = 0;
let draining = false;
function writeBatchSize() {
    const n = Number(process.env.REPORT_WRITE_BATCH);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
}
function queueMax() {
    const n = Number(process.env.REPORT_WRITE_QUEUE_MAX);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20000;
}
/**
 * 同一 Node 进程同时只开一个写入事务。
 * 并发上报在内存里排队，而不是各自 BEGIN 后在同一条 app_id+date 上链式等锁。
 * 明细 INSERT 与增量 rollup 仍在同一事务：rebuild 的快照看不到未提交明细，避免加两次。
 */
export function enqueueReportWrite(rows) {
    if (rows.length === 0)
        return Promise.resolve();
    if (queuedEvents + rows.length > queueMax()) {
        return Promise.reject(new Error('report write queue is full'));
    }
    return new Promise((resolve, reject) => {
        pending.push({ rows, resolve, reject });
        queuedEvents += rows.length;
        void drainReportWrites();
    });
}
function takeChunk() {
    const max = writeBatchSize();
    const chunk = [];
    let count = 0;
    while (pending.length > 0) {
        const next = pending[0];
        if (chunk.length > 0 && count + next.rows.length > max)
            break;
        pending.shift();
        queuedEvents -= next.rows.length;
        chunk.push(next);
        count += next.rows.length;
    }
    return chunk;
}
async function insertEventRows(client, rows) {
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const params = chunk.flatMap((row) => [
            row.type,
            row.subType,
            row.timestamp,
            row.appId,
            row.sessionId,
            row.visitorId,
            row.url,
            row.userAgent,
            row.clientIp,
            JSON.stringify(row.data),
            row.createdAt,
        ]);
        await clientQuery(client, `INSERT INTO events (
        type, sub_type, timestamp, app_id, session_id, visitor_id,
        url, user_agent, client_ip, data, created_at
      ) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)').join(', ')}`, params);
    }
}
async function drainReportWrites() {
    if (draining)
        return;
    draining = true;
    try {
        while (pending.length > 0) {
            const chunk = takeChunk();
            const rows = chunk.flatMap((job) => job.rows);
            try {
                const targets = await withTransaction(async (client) => {
                    await insertEventRows(client, rows);
                    return applyRollupBatch(client, rows.map((row) => ({
                        type: row.type,
                        subType: row.subType,
                        timestamp: row.timestamp,
                        appId: row.appId,
                        visitorId: row.visitorId,
                        url: row.url,
                        data: row.data,
                    })));
                });
                schedulePerfP50Refresh(targets);
                for (const job of chunk)
                    job.resolve();
            }
            catch (err) {
                console.error('[report] write failed', err);
                for (const job of chunk)
                    job.reject(err);
            }
            if (pending.length > 0) {
                await new Promise((resolve) => setImmediate(resolve));
            }
        }
    }
    finally {
        draining = false;
        if (pending.length > 0)
            void drainReportWrites();
    }
}
//# sourceMappingURL=reportWrite.js.map