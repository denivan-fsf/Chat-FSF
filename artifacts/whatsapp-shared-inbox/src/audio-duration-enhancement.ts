type AudioWithDuration = HTMLAudioElement & { dataset: DOMStringMap };

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function enhanceAudio(audio: AudioWithDuration) {
  if (audio.dataset.fsfDurationReady === '1') return;
  audio.dataset.fsfDurationReady = '1';
  audio.preload = 'metadata';

  const wrapper = document.createElement('div');
  wrapper.className = 'fsf-audio-wrapper';

  const duration = document.createElement('span');
  duration.className = 'fsf-audio-duration';
  duration.textContent = '0:00';
  duration.title = 'Duração do áudio';

  const parent = audio.parentElement;
  if (!parent) return;
  parent.insertBefore(wrapper, audio);
  wrapper.appendChild(audio);
  wrapper.appendChild(duration);

  const update = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration.textContent = formatDuration(audio.duration);
      duration.dataset.ready = '1';
    }
  };

  audio.addEventListener('loadedmetadata', update, { once: false });
  audio.addEventListener('durationchange', update, { once: false });
  audio.addEventListener('canplay', update, { once: false });

  // Faz o navegador buscar os metadados imediatamente, sem iniciar a reprodução.
  try { audio.load(); } catch { /* navegador já pode estar carregando */ }
  update();
}

function styles() {
  if (document.getElementById('fsf-audio-duration-style')) return;
  const style = document.createElement('style');
  style.id = 'fsf-audio-duration-style';
  style.textContent = `
    .fsf-audio-wrapper{display:flex;flex-direction:column;gap:3px;min-width:250px;max-width:340px}
    .fsf-audio-wrapper audio{width:100%;display:block}
    .fsf-audio-duration{font-size:9px;line-height:1;color:#55766c;text-align:right;font-family:var(--app-font-mono,monospace);font-weight:700}
    .fsf-audio-duration[data-ready="1"]{color:#355f51}
  `;
  document.head.appendChild(style);
}

function scan() {
  document.querySelectorAll('audio.fsf-audio').forEach((audio) => enhanceAudio(audio as AudioWithDuration));
}

export function installAudioDurationEnhancement() {
  styles();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
}
