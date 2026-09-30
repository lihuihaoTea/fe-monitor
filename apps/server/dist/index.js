import express from 'express';
import cors from 'cors';
import { initDB } from './db/index.js';
import { pruneExpiredEvents } from './db/prune-events.js';
import { reportRouter } from './routes/report.js';
import { statsRouter } from './routes/stats.js';
import { eventsRouter } from './routes/events.js';
const app = express();
const PORT = Number(process.env.PORT) || 80;
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json());
app.use('/api/report', reportRouter);
app.use('/api/stats', statsRouter);
app.use('/api/events', eventsRouter);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
function scheduleEventPrune() {
    const ttlDays = Number(process.env.EVENTS_TTL_DAYS ?? 7);
    if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
        console.log('[prune] EVENTS_TTL_DAYS<=0，未启用明细 TTL');
        return;
    }
    const run = async () => {
        try {
            const result = await pruneExpiredEvents({ ttlDays });
            if (result.total > 0) {
                console.log(`[prune] TTL=${ttlDays}d 删除 behavior/performance ${result.deleted}/${result.total}`);
            }
        }
        catch (err) {
            console.error('[prune] failed', err);
        }
    };
    // 启动后 1 分钟跑一次，之后每 24 小时
    setTimeout(() => {
        void run();
    }, 60000);
    setInterval(() => {
        void run();
    }, 24 * 60 * 60 * 1000);
    console.log(`[prune] 已启用，保留 behavior/performance ${ttlDays} 天`);
}
async function main() {
    await initDB();
    scheduleEventPrune();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✨ FE Monitor Server running on http://0.0.0.0:${PORT}`);
        console.log(`📊 Stats API: https://api.lihuihao.chat/api/stats`);
    });
}
main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map