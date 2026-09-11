import express from 'express';
import cors from 'cors';
import { db, initDB } from './db/index.js';
import { collectRouter } from './routes/collect.js';
import { statsRouter } from './routes/stats.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3100;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

initDB();

app.use('/api/collect', collectRouter);
app.use('/api/stats', statsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`✨ FE Monitor Server running on http://localhost:${PORT}`);
  console.log(`📊 Stats API: http://localhost:${PORT}/api/stats`);
});
