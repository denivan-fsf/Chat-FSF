type EnhancedMessage = {
  id: string;
  content?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  replyTo?: { id: string; content?: string } | null;
};

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const authToken = () => localStorage.getItem('fsf_access_token') || '';
const authHeaders = () => authToken() ? { Authorization: `Bearer ${authToken()}` } : {};

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...(options.headers || {}), ...authHeaders() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function phone(value: string) { return String(value || '').replace(/\D/g, ''); }
function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c] || c);
}

let activeConversationId = '';
let activeStamp = '';
let reply: { id: string; text: string } | null = null;
let file: File | null = null;
let recorder: MediaRecorder | null = null;
let recorderStream: MediaStream | null = null;
let chunks: Blob[] = [];
let sending = false;
const mediaObjectUrls = new Map<string, string>();

async function activeConversation() {
  const person = document.querySelector('.message-person');
  const name = person?.querySelector('h2')?.textContent?.trim() || '';
  const contactPhone = phone(person?.querySelector('p')?.textContent || '');
  const stamp = `${name}|${contactPhone}`;
  if (stamp === activeStamp && activeConversationId) return activeConversationId;
  if (!name && !contactPhone) return '';
  const list = await api('/api/conversations');
  const match = (list || []).find((item: any) => phone(item?.contact?.phoneNumber || '') === contactPhone || (!contactPhone && item?.contact?.name === name));
  activeStamp = stamp;
  activeConversationId = match?.id || '';
  return activeConversationId;
}

function styles() {
  if (document.getElementById('fsf-enhancement-style')) return;
  const style = document.createElement('style');
  style.id = 'fsf-enhancement-style';
  style.textContent = `
    .fsf-tools{display:flex;gap:5px;margin-top:4px;opacity:0}
    .message-line:hover .fsf-tools{opacity:1}
    .fsf-reply-btn,.fsf-compose-btn{border:1px solid #d5e2d8;background:#fff;color:#55796d;border-radius:7px;padding:5px 8px;cursor:pointer;font:600 9px var(--app-font-mono)}
    .fsf-reply-btn:focus-visible,.fsf-compose-btn:focus-visible{outline:2px solid #77a98e;outline-offset:1px}
    .fsf-reply-bar{display:flex;gap:8px;align-items:center;padding:8px 10px;margin-bottom:8px;border-left:3px solid #77a98e;background:#edf5ee;border-radius:7px;color:#55766c;font-size:10px}
    .fsf-reply-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fsf-reply-bar button{margin-left:auto;border:0;background:transparent;cursor:pointer}
    .fsf-quote{border-left:3px solid #78a98e;background:rgba(120,169,142,.12);padding:6px 8px;margin-bottom:5px;border-radius:6px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fsf-file{display:flex;gap:8px;align-items:center;padding:7px 9px;margin-bottom:8px;background:#edf5ee;border:1px solid #d3e1d7;border-radius:7px;font-size:10px}
    .fsf-file button{margin-left:auto;border:0;background:transparent;cursor:pointer}
    .fsf-audio{width:min(320px,100%)}
    .fsf-image{max-width:280px;max-height:240px;border-radius:8px;display:block}
    .fsf-video{max-width:320px;max-height:240px;border-radius:8px;display:block}
    .fsf-doc{display:block;color:inherit;text-decoration:none;padding:8px;border-radius:7px;background:rgba(90,120,105,.08)}
    .fsf-media-loading{display:inline-block;padding:9px 11px;border-radius:7px;background:rgba(90,120,105,.08);font-size:10px;color:#55766c}
    .composer{position:relative}
    .composer textarea{padding-bottom:46px !important}
    .fsf-compose-tools{position:absolute;left:10px;right:10px;bottom:7px;display:flex;align-items:center;gap:6px;z-index:10}
    .fsf-compose-tools .fsf-compose-btn:last-child{margin-left:auto;min-width:34px}
    .fsf-compose-btn.recording{font-weight:800}
  `;
  document.head.appendChild(style);
}

function setReply(id: string, text: string) {
  reply = { id, text: text || 'Mensagem' };
  const area = document.querySelector('.composer-area');
  if (!area) return;
  let bar = area.querySelector('.fsf-reply-bar') as HTMLElement | null;
  if (!bar) { bar = document.createElement('div'); bar.className = 'fsf-reply-bar'; area.prepend(bar); }
  bar.innerHTML = `<b>↩</b><span>${escapeHtml(reply.text)}</span><button type="button" aria-label="Cancelar resposta">×</button>`;
  bar.querySelector('button')?.addEventListener('click', clearReply);
}
function clearReply() { reply = null; document.querySelector('.fsf-reply-bar')?.remove(); }

function addReplyButton(line: Element, message?: EnhancedMessage) {
  if (line.querySelector('.fsf-tools')) return;
  const id = message?.id || String(line.getAttribute('data-testid') || '').replace(/^message-/, '');
  if (!id) return;
  const text = line.querySelector('.bubble')?.textContent?.trim() || 'Mensagem';
  const tools = document.createElement('div');
  tools.className = 'fsf-tools';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fsf-reply-btn';
  button.textContent = '↩ Responder';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setReply(id, text);
    (document.querySelector('.composer textarea') as HTMLTextAreaElement | null)?.focus();
  });
  tools.appendChild(button);
  line.querySelector('.bubble-wrap')?.appendChild(tools);
}

async function mediaObjectUrl(message: EnhancedMessage) {
  if (!message.mediaUrl) return null;
  const cached = mediaObjectUrls.get(message.id);
  if (cached) return cached;

  const response = await fetch(`${API}/api/messages/${encodeURIComponent(message.id)}/media`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  mediaObjectUrls.set(message.id, objectUrl);
  return objectUrl;
}

async function renderMedia(bubble: HTMLElement, message: EnhancedMessage) {
  bubble.textContent = '';
  if (!message.mediaUrl) {
    bubble.textContent = message.content || '';
    return;
  }

  const loading = document.createElement('span');
  loading.className = 'fsf-media-loading';
  loading.textContent = 'Carregando mídia...';
  bubble.appendChild(loading);

  try {
    const src = await mediaObjectUrl(message);
    loading.remove();
    if (!src) throw new Error('Mídia indisponível');
    const type = String(message.mediaType || '').toLowerCase();

    if (type.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.className = 'fsf-audio';
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = src;
      bubble.appendChild(audio);
      return;
    }
    if (type.startsWith('image/')) {
      const image = document.createElement('img');
      image.className = 'fsf-image';
      image.src = src;
      image.alt = message.content || 'Imagem';
      bubble.appendChild(image);
      return;
    }
    if (type.startsWith('video/')) {
      const video = document.createElement('video');
      video.className = 'fsf-video';
      video.controls = true;
      video.preload = 'metadata';
      video.src = src;
      bubble.appendChild(video);
      return;
    }

    const link = document.createElement('a');
    link.className = 'fsf-doc';
    link.href = src;
    link.download = message.content || 'arquivo';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `📎 ${message.content || 'Abrir arquivo'}`;
    bubble.appendChild(link);
  } catch {
    bubble.textContent = `📎 ${message.content || 'Mídia indisponível'}`;
  }
}

async function enhanceMessages() {
  const thread = document.querySelector('.messages-scroller');
  if (!thread) return;
  const id = await activeConversation().catch(() => '');
  if (!id) return;
  try {
    const messages: EnhancedMessage[] = await api(`/api/conversations/${encodeURIComponent(id)}/messages`);
    const map = new Map(messages.map((item) => [item.id, item]));
    thread.querySelectorAll('.message-line').forEach((line) => {
      const message = map.get(String(line.getAttribute('data-testid') || '').replace(/^message-/, ''));
      if (message?.replyTo && !line.querySelector('.fsf-quote')) {
        const q = document.createElement('div');
        q.className = 'fsf-quote';
        q.textContent = message.replyTo.content || 'Mensagem';
        line.querySelector('.bubble-wrap')?.insertBefore(q, line.querySelector('.bubble') || null);
      }
      if (message?.mediaUrl && line.querySelector('.bubble') && !line.querySelector('.fsf-audio,.fsf-image,.fsf-video,.fsf-doc,.fsf-media-loading')) {
        const b = line.querySelector('.bubble') as HTMLElement;
        void renderMedia(b, message);
      }
      addReplyButton(line, message);
    });
  } catch {
    thread.querySelectorAll('.message-line').forEach((line) => addReplyButton(line));
  }
}

function fileToDataUrl(input: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(input);
  });
}

function showFile() {
  document.querySelector('.fsf-file')?.remove();
  if (!file) return;
  const area = document.querySelector('.composer-area');
  if (!area) return;
  const box = document.createElement('div');
  box.className = 'fsf-file';
  box.innerHTML = `<span>${file.type.startsWith('audio/') ? '🎙' : '📎'}</span><span>${escapeHtml(file.name)}</span><button type="button" aria-label="Remover anexo">×</button>`;
  box.querySelector('button')?.addEventListener('click', () => { file = null; showFile(); });
  const bar = area.querySelector('.fsf-reply-bar');
  if (bar) bar.insertAdjacentElement('afterend', box); else area.prepend(box);
}

function chooseFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
  input.onchange = () => { file = input.files?.[0] || null; showFile(); };
  input.click();
}

async function record(button: HTMLButtonElement) {
  if (recorder) {
    recorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    window.alert('Seu navegador não permite gravação de áudio.');
    return;
  }

  try {
    recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = [
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];
    const mime = preferred.find((item) => MediaRecorder.isTypeSupported(item));
    recorder = mime ? new MediaRecorder(recorderStream, { mimeType: mime }) : new MediaRecorder(recorderStream);
    chunks = [];
    button.textContent = '■';
    button.classList.add('recording');
    button.title = 'Parar gravação';

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    recorder.onstop = () => {
      const mimeType = recorder?.mimeType || 'audio/ogg;codecs=opus';
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      file = new File([new Blob(chunks, { type: mimeType })], `audio-${Date.now()}.${ext}`, { type: mimeType });
      recorderStream?.getTracks().forEach((track) => track.stop());
      recorder = null;
      recorderStream = null;
      button.textContent = '🎙';
      button.title = 'Gravar áudio';
      button.classList.remove('recording');
      showFile();
    };

    recorder.start();
  } catch (error) {
    recorderStream?.getTracks().forEach((track) => track.stop());
    recorder = null;
    recorderStream = null;
    button.textContent = '🎙';
    button.title = 'Gravar áudio';
    button.classList.remove('recording');
    window.alert(error instanceof Error ? error.message : 'Não foi possível acessar o microfone.');
  }
}

function appendSent(message: EnhancedMessage) {
  const thread = document.querySelector('.messages-scroller');
  if (!thread) return;
  const line = document.createElement('div');
  line.className = 'message-line own';
  line.dataset.testid = `message-${message.id}`;
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  const author = document.createElement('span');
  author.className = 'bubble-author';
  author.textContent = 'Você';
  wrap.appendChild(author);
  if (message.replyTo) {
    const q = document.createElement('div');
    q.className = 'fsf-quote';
    q.textContent = message.replyTo.content || 'Mensagem';
    wrap.appendChild(q);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  wrap.appendChild(bubble);
  const meta = document.createElement('small');
  meta.className = 'bubble-meta';
  meta.textContent = new Date(message.createdAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  meta.insertAdjacentHTML('beforeend', ' ✓');
  wrap.appendChild(meta);
  line.appendChild(wrap);
  thread.appendChild(line);
  thread.scrollTop = thread.scrollHeight;
  addReplyButton(line, message);
  void renderMedia(bubble, message);
}

function syncTextarea(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function send() {
  if (sending) return;
  const textarea = document.querySelector('.composer textarea') as HTMLTextAreaElement | null;
  if (!textarea || textarea.disabled) return;
  const content = textarea.value.trim();
  if (!content && !file) return;

  const id = await activeConversation();
  if (!id) {
    window.alert('Não consegui identificar a conversa aberta.');
    return;
  }

  sending = true;
  try {
    const body: any = { content, replyToMessageId: reply?.id || null };
    if (file) body.file = { name: file.name, type: file.type || 'application/octet-stream', data: await fileToDataUrl(file) };
    const message = await api(`/api/conversations/${encodeURIComponent(id)}/messages/advanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    syncTextarea(textarea, '');
    file = null;
    showFile();
    clearReply();
    appendSent(message);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Não foi possível enviar.');
  } finally {
    sending = false;
  }
}

function composer() {
  const root = document.querySelector('.composer');
  if (!root) return;
  const textarea = root.querySelector('textarea') as HTMLTextAreaElement | null;
  if (!textarea) return;

  const oldSend = root.querySelector('.send-btn') as HTMLElement | null;
  if (oldSend) oldSend.style.display = 'none';
  const oldAttach = root.querySelector('.composer-tool') as HTMLElement | null;
  if (oldAttach) oldAttach.style.display = 'none';

  if (root.querySelector('.fsf-compose-tools')) return;

  const tools = document.createElement('div');
  tools.className = 'fsf-compose-tools';

  const attach = document.createElement('button');
  attach.type = 'button';
  attach.className = 'fsf-compose-btn';
  attach.title = 'Anexar arquivo';
  attach.textContent = '📎';
  attach.onclick = chooseFile;

  const mic = document.createElement('button');
  mic.type = 'button';
  mic.className = 'fsf-compose-btn';
  mic.title = 'Gravar áudio';
  mic.textContent = '🎙';
  mic.onclick = () => void record(mic);

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'fsf-compose-btn';
  sendButton.title = 'Enviar mensagem';
  sendButton.textContent = '➤';
  sendButton.onclick = () => void send();

  tools.append(attach, mic, sendButton);
  root.appendChild(tools);
}

let timer: number | undefined;
function schedule() {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => { composer(); void enhanceMessages(); }, 100);
}

export function installInboxEnhancements() {
  styles();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();
}
