import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ttsRouter } from './routes/tts.js';
import { fetchUrlRouter } from './routes/fetchUrl.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(requestIdMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/tts', ttsRouter);
app.use('/api/fetch-url', fetchUrlRouter);

app.listen(PORT, () => {
  logger.info({ event: 'server_started', port: PORT });
});
