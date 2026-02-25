import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);
const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { text, speed, pitch } = req.body as {
    text?: string;
    speed?: number;
    pitch?: number;
  };

  if (!text || text.trim() === '') {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmpWav = path.join(os.tmpdir(), `reader-${id}.wav`);
  const tmpMp3 = path.join(os.tmpdir(), `reader-${id}.mp3`);

  try {
    // Write text to a temp file to safely pass it to espeak-ng
    const tmpTxt = path.join(os.tmpdir(), `reader-${id}.txt`);
    fs.writeFileSync(tmpTxt, text, 'utf8');

    const speedArg = speed ? `-s ${Math.max(80, Math.min(400, Number(speed)))}` : '';
    const pitchArg = pitch ? `-p ${Math.max(0, Math.min(99, Number(pitch)))}` : '';

    await execAsync(`espeak-ng ${speedArg} ${pitchArg} -f "${tmpTxt}" -w "${tmpWav}"`);
    fs.unlinkSync(tmpTxt);

    // Convert WAV to MP3 if ffmpeg is available, otherwise serve WAV
    let audioFile = tmpWav;
    let contentType = 'audio/wav';

    try {
      await execAsync(`ffmpeg -y -i "${tmpWav}" "${tmpMp3}" 2>/dev/null`);
      audioFile = tmpMp3;
      contentType = 'audio/mpeg';
      fs.unlinkSync(tmpWav);
    } catch {
      // ffmpeg not available, use WAV
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="speech.${contentType === 'audio/mpeg' ? 'mp3' : 'wav'}"`);

    const stream = fs.createReadStream(audioFile);
    stream.pipe(res);
    stream.on('end', () => {
      fs.unlink(audioFile, () => {/* cleanup */});
    });
    stream.on('error', () => {
      fs.unlink(audioFile, () => {/* cleanup */});
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio file' });
      }
    });
  } catch (err) {
    fs.unlink(tmpWav, () => {/* cleanup */});
    fs.unlink(tmpMp3, () => {/* cleanup */});
    console.error('TTS error:', err);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export { router as ttsRouter };
