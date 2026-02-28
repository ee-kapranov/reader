(function () {
  'use strict';

  const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('url-input'));
  const loadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('load-btn'));
  const textInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('text-input'));
  const charCount = document.getElementById('char-count');
  const speedRange = /** @type {HTMLInputElement} */ (document.getElementById('speed'));
  const speedVal = document.getElementById('speed-val');
  const pitchRange = /** @type {HTMLInputElement} */ (document.getElementById('pitch'));
  const pitchVal = document.getElementById('pitch-val');
  const providerSelect = /** @type {HTMLSelectElement} */ (document.getElementById('provider'));
  const voiceSelect = /** @type {HTMLSelectElement} */ (document.getElementById('voice'));
  const providerStatus = document.getElementById('provider-status');
  const generateBtn = /** @type {HTMLButtonElement} */ (document.getElementById('generate-btn'));
  const loading = document.getElementById('loading');
  const playerSection = document.getElementById('player-section');
  const audioPlayer = /** @type {HTMLAudioElement} */ (document.getElementById('audio-player'));
  const downloadLink = /** @type {HTMLAnchorElement} */ (document.getElementById('download-link'));
  const urlError = document.getElementById('url-error');
  const genError = document.getElementById('gen-error');

  // Live character count
  textInput.addEventListener('input', () => {
    const len = textInput.value.length;
    charCount.textContent = `${len.toLocaleString()} character${len === 1 ? '' : 's'}`;
  });

  // Speed / pitch labels
  speedRange.addEventListener('input', () => {
    speedVal.textContent = `${speedRange.value} wpm`;
  });
  pitchRange.addEventListener('input', () => {
    pitchVal.textContent = pitchRange.value;
  });

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideError(el) {
    el.classList.add('hidden');
  }

  /** @type {Record<string, { id: string; name: string; language: string }[]>} */
  const voicesByProvider = {};

  function populateProviders(providers) {
    providerSelect.innerHTML = '';
    let firstEnabledProviderId = null;

    for (const provider of providers) {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.label;
      const voiceCount = (provider.voices || []).length;
      const isDisabled = provider.id === 'piper' && voiceCount === 0;
      option.disabled = isDisabled;
      if (isDisabled) {
        option.textContent = `${provider.label} (not configured)`;
      } else if (!firstEnabledProviderId) {
        firstEnabledProviderId = provider.id;
      }
      providerSelect.appendChild(option);
      voicesByProvider[provider.id] = provider.voices || [];
    }

    if (firstEnabledProviderId) {
      providerSelect.value = firstEnabledProviderId;
    }
  }

  function populateVoices(providerId) {
    voiceSelect.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Default voice';
    voiceSelect.appendChild(defaultOption);

    const voices = voicesByProvider[providerId] || [];
    for (const voice of voices) {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = `${voice.name} (${voice.language})`;
      voiceSelect.appendChild(option);
    }
  }

  function renderProviderStatus(providers) {
    const espeak = providers.find((provider) => provider.id === 'espeak');
    const piper = providers.find((provider) => provider.id === 'piper');

    const espeakStatus = espeak
      ? `eSpeak: ready (${(espeak.voices || []).length} voices)`
      : 'eSpeak: unavailable';

    const piperVoiceCount = (piper && piper.voices ? piper.voices.length : 0);
    const piperStatus = piperVoiceCount > 0
      ? `Piper: configured (${piperVoiceCount} models)`
      : 'Piper: not configured (set PIPER_MODEL/PIPER_MODELS)';

    providerStatus.textContent = `${espeakStatus} · ${piperStatus}`;
  }

  async function loadVoiceOptions() {
    try {
      const res = await fetch('/api/tts/voices');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load voices');
      }

      const providers = data.providers || [];
      if (providers.length === 0) {
        throw new Error('No offline providers available');
      }

      populateProviders(providers);
      populateVoices(providerSelect.value || providers[0].id);
      renderProviderStatus(providers);
    } catch (err) {
      showError(genError, err.message || 'Failed to load voices');
      providerSelect.innerHTML = '<option value="espeak">eSpeak NG</option>';
      voiceSelect.innerHTML = '<option value="">Default voice</option>';
      providerStatus.textContent = 'Provider status unavailable';
    }
  }

  providerSelect.addEventListener('change', () => {
    populateVoices(providerSelect.value);
  });

  // Load text from URL
  loadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showError(urlError, 'Please enter a URL.');
      return;
    }
    hideError(urlError);
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading…';

    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load URL');
      }

      textInput.value = data.text || '';
      textInput.dispatchEvent(new Event('input'));
    } catch (err) {
      showError(urlError, err.message || 'Failed to load URL');
    } finally {
      loadBtn.disabled = false;
      loadBtn.innerHTML = '<span class="icon">🔗</span> Load';
    }
  });

  // Generate speech
  generateBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
      showError(genError, 'Please enter some text or load content from a URL.');
      return;
    }
    hideError(genError);

    // Revoke any previous blob URL
    if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
      URL.revokeObjectURL(audioPlayer.src);
    }

    playerSection.style.display = 'none';
    loading.classList.remove('hidden');
    generateBtn.disabled = true;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          speed: Number(speedRange.value),
          pitch: Number(pitchRange.value),
          provider: providerSelect.value,
          voice: voiceSelect.value || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate speech');
      }

      const contentType = res.headers.get('Content-Type') || 'audio/wav';
      const ext = contentType.includes('mpeg') ? 'mp3' : 'wav';
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      audioPlayer.src = blobUrl;
      downloadLink.href = blobUrl;
      downloadLink.download = `speech.${ext}`;

      playerSection.style.display = '';
      audioPlayer.play().catch((err) => {
        console.warn('Audio playback failed or was blocked by the browser:', err);
      });
    } catch (err) {
      showError(genError, err.message || 'Failed to generate speech');
    } finally {
      loading.classList.add('hidden');
      generateBtn.disabled = false;
    }
  });

  loadVoiceOptions();
})();
