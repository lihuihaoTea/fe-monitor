import express from 'express';
import cors from 'cors';
import { initDB } from './db/index.js';
import { pruneExpiredEvents } from './db/prune-events.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
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
app.use('/api/auth', authRouter);
app.use('/api/report', reportRouter);
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/events', requireAuth, eventsRouter);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
function scheduleEventPrune() {
    const ttlDays = Number(process.env.EVENTS_TTL_DAYS ?? 7);
    const detailTtlDays = Number(process.env.EVENTS_DETAIL_TTL_DAYS ?? 30);
    const aggOn = Number.isFinite(ttlDays) && ttlDays > 0;
    const detailOn = Number.isFinite(detailTtlDays) && detailTtlDays > 0;
    if (!aggOn && !detailOn) {
        console.log('[prune] TTL 均未启用（EVENTS_TTL_DAYS / EVENTS_DETAIL_TTL_DAYS）');
        return;
    }
    const run = async () => {
        try {
            const result = await pruneExpiredEvents({ ttlDays, detailTtlDays });
            if (result.total > 0) {
                console.log(`[prune] 删除 ${result.deleted}/${result.total}` +
                    `（behavior/performance≤${ttlDays}d；error/api/resource/blank≤${detailTtlDays}d）`);
            }
        }
        catch (err) {
            console.error('[prune] failed', err);
        }
    };
    // 启动后 1 分钟跑一次，之后每 6 小时
    setTimeout(() => {
        void run();
    }, 300000); // 5 minutes after startup to avoid blocking health check
    setInterval(() => {
        void run();
    }, 6 * 60 * 60 * 1000);
    console.log(`[prune] 已启用：behavior/performance ${aggOn ? `${ttlDays}d` : '关'}；` +
        `error/api/resource/blank ${detailOn ? `${detailTtlDays}d` : '关'}；间隔 6h`);
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