type AudioMessage = {
  id: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const token = () => localStorage.getItem('fsf_access_token') || '';
const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};

function phone(value: string) { return String(value || '').replace(/\D/g, ''); }
function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.floor(value);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function getJson(path: string) {
  const response = await fetch(`${API}${path}`, { credentials: 'include', headers: headers() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

async function activeConversationId() {
  const person = document.querySelector('.message-person');
  const name = person?.querySelector('h2')?.textContent?.trim() || '';
  const contactPhone = phone(person?.querySelector('p')?.textContent || '');
  if (!name && !contactPhone) return '';
  const list = await getJson('/api/conversations');
  return (list || []).find((item: any) =>
    (contactPhone && phone(item?.contact?.phoneNumber || '') === contactPhone) ||
    (!contactPhone && item?.contact?.name === name)
  )?.id || '';
}

function audioStyles() {
  if (document.getElementById('fsf-direct-audio-style')) return;
  const style = document.createElement('style');
  style.id = 'fsf-direct-audio-style';
  style.textContent = `
    .fsf-direct-audio{display:flex;align-items:center;gap:9px;width:min(340px,100%);max-width:100%;padding:8px 10px;border-radius:10px;background:#e9f3eb;border:1px solid #d1e2d6;box-sizing:border-box}
    .message-line.own .fsf-direct-audio{background:#dbece4;border-color:#c1dacd}
    .fsf-direct-audio-play{width:34px;height:34px;min-width:34px;border:0;border-radius:50%;background:#163f37;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-size:14px;font-weight:800}
    .fsf-direct-audio-track{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
    .fsf-direct-audio-range{width:100%;margin:0;accent-color:#163f37;cursor:pointer}
    .fsf-direct-audio-time{font:600 9px var(--app-font-mono,monospace);color:#547067;white-space:nowrap;text-align:right}
    .fsf-direct-audio-loading{font:600 9px var(--app-font-mono,monospace);color:#6f8b80;white-space:nowrap}
  `;
  document.head.appendChild(style);
}

async function remoteAudioUrl(messageId: string) {
  const data = await getJson(`/api/messages/${encodeURIComponent(messageId)}/media-url`);
  return String(data?.url || '');
}

function createPlayer(line: Element, message: AudioMessage, url: string) {
  const bubble = line.querySelector('.bubble') as HTMLElement | null;
  if (!bubble || line.getAttribute('data-fsf-direct-audio') === '1') return;
  line.setAttribute('data-fsf-direct-audio', '1');
  bubble.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'fsf-direct-audio';

  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  audio.crossOrigin = 'anonymous';
  audio.style.display = 'none';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fsf-direct-audio-play';
  button.innerHTML = '▶';
  button.setAttribute('aria-label', 'Reproduzir áudio');

  const track = document.createElement('div');
  track.className = 'fsf-direct-audio-track';

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'fsf-direct-audio-range';
  range.min = '0';
  range.max = '100';
  range.step = '0.1';
  range.value = '0';
  range.setAttribute('aria-label', 'Progresso do áudio');

  const time = document.createElement('span');
  time.className = 'fsf-direct-audio-time';
  time.textContent = 'Carregando duração...';

  button.addEventListener('click', () => {
    if (audio.paused) {
      void audio.play().catch(() => { time.textContent = 'Não foi possível reproduzir'; });
    } else {
      audio.pause();
    }
  });

  range.addEventListener('input', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(range.value) / 100) * audio.duration;
    }
  });

  const updateDuration = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      time.textContent = `0:00 / ${formatTime(audio.duration)}`;
    }
  };

  audio.addEventListener('loadedmetadata', updateDuration);
  audio.addEventListener('durationchange', updateDuration);
  audio.addEventListener('loadeddata', updateDuration);
  audio.addEventListener('progress', updateDuration);
  audio.addEventListener('timeupdate', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      range.value = String((audio.currentTime / audio.duration) * 100);
      time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    }
  });
  audio.addEventListener('play', () => { button.innerHTML = '❚❚'; });
  audio.addEventListener('pause', () => { button.innerHTML = '▶'; });
  audio.addEventListener('ended', () => { range.value = '0'; button.innerHTML = '▶'; time.textContent = `0:00 / ${formatTime(audio.duration)}`; });
  audio.addEventListener('error', () => { time.textContent = 'Áudio indisponível'; });

  track.append(range, time);
  wrap.append(audio, button, track);
  bubble.appendChild(wrap);

  try { audio.load(); } catch { /* carregamento iniciado pelo navegador */ }
}

async function enhance() {
  const thread = document.querySelector('.messages-scroller');
  if (!thread) return;
  const conversationId = await activeConversationId().catch(() => '');
  if (!conversationId) return;
  const messages: AudioMessage[] = await getJson(`/api/conversations/${encodeURIComponent(conversationId)}/messages`).catch(() => []);
  const byId = new Map(messages.map((m) => [m.id, m]));

  for (const line of Array.from(thread.querySelectorAll('.message-line'))) {
    const id = String(line.getAttribute('data-testid') || '').replace(/^message-/, '');
    const message = byId.get(id);
    const type = String(message?.mediaType || '').toLowerCase();
    if (!message?.mediaUrl || !type.startsWith('audio/')) continue;
    if (line.getAttribute('data-fsf-direct-audio') === '1') continue;

    try {
      const url = await remoteAudioUrl(message.id);
      if (url) createPlayer(line, message, url);
    } catch {
      const bubble = line.querySelector('.bubble') as HTMLElement | null;
      if (bubble && !bubble.querySelector('.fsf-direct-audio-error')) {
        const error = document.createElement('span');
        error.className = 'fsf-direct-audio-error';
        error.textContent = 'Áudio indisponível';
        bubble.replaceChildren(error);
      }
    }
  }
}

export function installAudioDirectEnhancement() {
  audioStyles();
  const observer = new MutationObserver(() => { void enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
  void enhance();
}
