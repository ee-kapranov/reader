import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export type OfflineProviderId = 'espeak' | 'piper';

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

export interface GenerateSpeechOptions {
  textFilePath: string;
  outputWavPath: string;
  text: string;
  speed: number | null;
  pitch: number | null;
  voice: string | null;
}

export class TtsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtsValidationError';
  }
}

interface OfflineProvider {
  id: OfflineProviderId;
  label: string;
  listVoices: () => Promise<VoiceOption[]>;
  synthesizeToWav: (options: GenerateSpeechOptions) => Promise<void>;
}

function runProcess(command: string, args: string[], stdinText?: string): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    if (stdinText != null) {
      child.stdin.write(stdinText, 'utf8');
      child.stdin.end();
    }

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout });
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function listEspeakVoices(): Promise<VoiceOption[]> {
  const { stdout } = await runProcess('espeak-ng', ['--voices']);
  const lines = stdout.split('\n').slice(1);
  const voices: VoiceOption[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const cols = trimmed.split(/\s+/);
    if (cols.length < 4 || !/^\d+$/.test(cols[0])) {
      continue;
    }

    const language = cols[1];
    const voiceName = cols[3];
    voices.push({
      id: voiceName,
      name: voiceName,
      language,
    });
  }

  return voices;
}

async function synthesizeWithEspeak(options: GenerateSpeechOptions): Promise<void> {
  const args: string[] = [];

  if (options.speed != null) {
    args.push('-s', String(options.speed));
  }

  if (options.pitch != null) {
    args.push('-p', String(options.pitch));
  }

  if (options.voice) {
    args.push('-v', options.voice);
  }

  args.push('-f', options.textFilePath, '-w', options.outputWavPath);
  await runProcess('espeak-ng', args);
}

function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function commandExists(command: string): boolean {
  const pathVar = process.env.PATH;
  if (!pathVar) {
    return false;
  }

  const dirs = pathVar.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, command);
    if (fs.existsSync(candidate)) {
      return true;
    }
  }

  return false;
}

function modelNameFromPath(modelPath: string): string {
  const base = path.basename(modelPath);
  return base.replace(/\.onnx$/i, '');
}

function parsePiperLanguage(modelName: string): string {
  const prefix = modelName.split('-')[0] ?? '';
  return prefix || 'unknown';
}

function configuredPiperModels(): string[] {
  const models = [process.env.PIPER_MODEL, ...splitCsv(process.env.PIPER_MODELS)]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(models));
}

function configuredExistingPiperModels(): string[] {
  return configuredPiperModels().filter((modelPath) => fs.existsSync(modelPath));
}

async function listPiperVoices(): Promise<VoiceOption[]> {
  if (!commandExists('piper')) {
    return [];
  }

  const models = configuredExistingPiperModels();
  return models
    .map((modelPath) => {
    const modelName = modelNameFromPath(modelPath);
    return {
      id: modelPath,
      name: modelName,
      language: parsePiperLanguage(modelName),
    };
    });
}

async function synthesizeWithPiper(options: GenerateSpeechOptions): Promise<void> {
  if (!commandExists('piper')) {
    throw new TtsValidationError('Piper binary is not installed or not in PATH. Install `piper` and restart the server.');
  }

  const selectedVoice = options.voice?.trim() || null;
  const validModels = configuredExistingPiperModels();
  if (selectedVoice && !validModels.includes(selectedVoice)) {
    throw new TtsValidationError('Selected Piper voice is not configured on server.');
  }

  const modelPath = selectedVoice || process.env.PIPER_MODEL;
  if (!modelPath) {
    throw new TtsValidationError('Piper model is not configured. Set PIPER_MODEL or select a configured Piper voice.');
  }

  if (!fs.existsSync(modelPath)) {
    throw new TtsValidationError(`Configured Piper model file was not found: ${modelPath}`);
  }

  const args: string[] = ['--model', modelPath, '--output_file', options.outputWavPath];
  if (options.speed != null) {
    const lengthScale = Math.max(0.5, Math.min(2, 175 / options.speed));
    args.push('--length_scale', lengthScale.toFixed(2));
  }

  await runProcess('piper', args, options.text);
}

const providers: Record<OfflineProviderId, OfflineProvider> = {
  espeak: {
    id: 'espeak',
    label: 'eSpeak NG',
    listVoices: listEspeakVoices,
    synthesizeToWav: synthesizeWithEspeak,
  },
  piper: {
    id: 'piper',
    label: 'Piper',
    listVoices: listPiperVoices,
    synthesizeToWav: synthesizeWithPiper,
  },
};

export function isOfflineProviderId(value: string): value is OfflineProviderId {
  return value in providers;
}

export function listOfflineProviders(): Array<{ id: OfflineProviderId; label: string }> {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
  }));
}

export async function listVoicesForProvider(providerId: OfflineProviderId): Promise<VoiceOption[]> {
  return providers[providerId].listVoices();
}

export async function synthesizeWithProvider(providerId: OfflineProviderId, options: GenerateSpeechOptions): Promise<void> {
  await providers[providerId].synthesizeToWav(options);
}
