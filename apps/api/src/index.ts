import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`);
});
