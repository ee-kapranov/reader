import express from 'express';
import path from 'path';
import { ttsRouter } from './routes/tts';
import { fetchUrlRouter } from './routes/fetchUrl';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/tts', ttsRouter);
app.use('/api/fetch-url', fetchUrlRouter);

app.listen(PORT, () => {
  console.log(`Reader app running at http://localhost:${PORT}`);
});
