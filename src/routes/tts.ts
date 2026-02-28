import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { logger } from '../logger.js';
import {
  isOfflineProviderId,
  listOfflineProviders,
  listVoicesForProvider,
  synthesizeWithProvider,
  TtsValidationError,
} from '../tts/providers.js';

const router = Router();

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

router.get('/voices', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.requestId;

  const providers = listOfflineProviders();
  const withVoices: Array<{
    id: string;
    label: string;
    voices: Array<{ id: string; name: string; language: string }>;
  }> = [];

  for (const provider of providers) {
    try {
      const voices = await listVoicesForProvider(provider.id);
      withVoices.push({
        ...provider,
        voices,
      });
    } catch (err) {
      logger.info({
        requestId,
        event: 'tts_provider_unavailable',
        provider: provider.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (withVoices.length === 0) {
    res.status(500).json({ error: 'No offline TTS providers available on this server' });
    return;
  }

  res.json({ providers: withVoices });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.requestId;
  const { text, speed, pitch, provider, voice } = req.body as {
    text?: string;
    speed?: number | string;
    pitch?: number | string;
    provider?: string;
    voice?: string;
  };

  if (!text || text.trim() === '') {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  const providerId = provider?.trim() ? provider.trim() : 'espeak';
  if (!isOfflineProviderId(providerId)) {
    res.status(400).json({ error: `Unsupported provider: ${providerId}` });
    return;
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmpWav = path.join(os.tmpdir(), `reader-${id}.wav`);
  const tmpMp3 = path.join(os.tmpdir(), `reader-${id}.mp3`);
  const tmpTxt = path.join(os.tmpdir(), `reader-${id}.txt`);

  const parsedSpeed = speed == null ? null : Number(speed);
  const parsedPitch = pitch == null ? null : Number(pitch);

  if (speed != null && !Number.isFinite(parsedSpeed)) {
    res.status(400).json({ error: 'Speed must be a valid number' });
    return;
  }

  if (pitch != null && !Number.isFinite(parsedPitch)) {
    res.status(400).json({ error: 'Pitch must be a valid number' });
    return;
  }

  const speedValue = parsedSpeed == null ? null : Math.max(80, Math.min(400, Math.round(parsedSpeed)));
  const pitchValue = parsedPitch == null ? null : Math.max(0, Math.min(99, Math.round(parsedPitch)));

  try {
    fs.writeFileSync(tmpTxt, text, 'utf8');

    logger.info({ requestId, event: 'tts_start', textLength: text.length, speed, pitch, provider: providerId, voice });

    await synthesizeWithProvider(providerId, {
      textFilePath: tmpTxt,
      outputWavPath: tmpWav,
      text,
      speed: speedValue,
      pitch: pitchValue,
      voice: voice?.trim() ? voice.trim() : null,
    });

    // Convert WAV to MP3 if ffmpeg is available, otherwise serve WAV
    let audioFile = tmpWav;
    let contentType = 'audio/wav';

    try {
      await runProcess('ffmpeg', ['-y', '-i', tmpWav, tmpMp3]);
      audioFile = tmpMp3;
      contentType = 'audio/mpeg';
      fs.unlinkSync(tmpWav);
    } catch (ffmpegErr) {
      logger.info({
        requestId,
        event: 'ffmpeg_unavailable',
        reason: ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr),
      });
    }

    logger.info({ requestId, event: 'tts_complete', contentType });

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="speech.${contentType === 'audio/mpeg' ? 'mp3' : 'wav'}"`,
    );

    const stream = fs.createReadStream(audioFile);
    stream.pipe(res);
    stream.on('end', () => {
      fs.unlink(audioFile, () => {
        /* cleanup */
      });
    });
    stream.on('error', (streamErr) => {
      logger.error({ requestId, event: 'tts_stream_error', error: streamErr.message });
      fs.unlink(audioFile, () => {
        /* cleanup */
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio file' });
      }
    });
  } catch (err) {
    if (err instanceof TtsValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }

    const typedErr = err as NodeJS.ErrnoException;
    if (typedErr.code === 'ENOENT') {
      logger.error({ requestId, event: 'tts_dependency_missing', error: typedErr.message });
      res.status(500).json({
        error: `Speech engine is not installed on server (missing binary in PATH for provider \`${providerId}\`)`,
      });
      return;
    }

    fs.unlink(tmpWav, () => {
      /* cleanup */
    });
    fs.unlink(tmpMp3, () => {
      /* cleanup */
    });
    logger.error({ requestId, event: 'tts_error', error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate speech' });
  } finally {
    fs.unlink(tmpTxt, () => {
      /* cleanup */
    });
  }
});

export { router as ttsRouter };
