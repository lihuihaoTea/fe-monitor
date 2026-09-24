import express from 'express';
import cors from 'cors';
import { db, initDB } from './db/index.js';
import { reportRouter } from './routes/report.js';
import { statsRouter } from './routes/stats.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 80;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

initDB();

app.use('/api/report', reportRouter);
app.use('/api/stats', statsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✨ FE Monitor Server running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Stats API: https://api.lihuihao.chat/api/stats`);
});
