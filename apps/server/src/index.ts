import express from 'express';
import cors from 'cors';
import { initDB } from './db/index.js';
import { reportRouter } from './routes/report.js';
import { statsRouter } from './routes/stats.js';
import { eventsRouter } from './routes/events.js';

const app = express();
const PORT = Number(process.env.PORT) || 80;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/report', reportRouter);
app.use('/api/stats', statsRouter);
app.use('/api/events', eventsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

async function main() {
  await initDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✨ FE Monitor Server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Stats API: https://api.lihuihao.chat/api/stats`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
