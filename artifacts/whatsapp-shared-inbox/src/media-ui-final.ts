type MediaRow = { id: string; content?: string | null; mediaType?: string | null };

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const authHeaders = () => {
  const token = localStorage.getItem('fsf_access_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
};

let messagesById = new Map<string, MediaRow>();
let busy = false;

function injectStyles() {
  if (document.getElementById('fsf-media-final-style')) return;
  const style = document.createElement('style');
  style.id = 'fsf-media-final-style';
  style.textContent = `
    .fsf-media-final-wrap{position:relative;display:inline-block;max-width:100%}
    .fsf-media-final-image{display:block;max-width:min(360px,100%);max-height:320px;border-radius:9px;cursor:zoom-in;object-fit:contain}
    .fsf-media-final-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}
    .fsf-media-final-btn{appearance:none;border:1px solid #cddbd2!important;background:#fff!important;color:#21483f!important;border-radius:7px!important;padding:6px 9px!important;font:700 9px var(--app-font-mono)!important;cursor:pointer!important;text-decoration:none!important;display:inline-flex!important;align-items:center!important;gap:4px!important}
    .fsf-media-final-btn:hover{filter:brightness(.97)}
    .fsf-media-final-lightbox{position:fixed;inset:0;background:rgba(5,25,21,.86);display:flex;align-items:center;justify-content:center;padding:22px;z-index:99999}
    .fsf-media-final-card{max-width:96vw;max-height:96vh;background:#eff6f1;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:9px;box-shadow:0 24px 80px rgba(0,0,0,.38)}
    .fsf-media-final-card img{max-width:92vw;max-height:84vh;object-fit:contain;border-radius:10px;background:#fff}
    .fsf-media-final-bar{display:flex;align-items:center;gap:7px}
    .fsf-media-final-title{margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 10px var(--app-font-mono);color:#355b50}
  `;
  document.head.appendChild(style);
}

async function loadMessages() {
  const token = localStorage.getItem('fsf_access_token');
  if (!token) return;
  const person = document.querySelector('.message-person');
  const phone = (person?.querySelector('p')?.textContent || '').replace(/\D/g, '');
  const name = person?.querySelector('h2')?.textContent?.trim() || '';
  if (!phone && !name) return;

  const listResponse = await fetch(`${API}/api/conversations`, { credentials: 'include', headers: authHeaders() });
  if (!listResponse.ok) return;
  const list = await listResponse.json();
  const conversation = (list || []).find((item: any) => {
    const itemPhone = String(item?.contact?.phoneNumber || '').replace(/\D/g, '');
    return (phone && itemPhone === phone) || (!phone && item?.contact?.name === name);
  });
  if (!conversation?.id) return;
  const response = await fetch(`${API}/api/conversations/${encodeURIComponent(conversation.id)}/messages`, { credentials: 'include', headers: authHeaders() });
  if (!response.ok) return;
  const rows: MediaRow[] = await response.json();
  messagesById = new Map(rows.map(row => [row.id, row]));
}

async function downloadMedia(message: MediaRow) {
  try {
    const response = await fetch(`${API}/api/messages/${encodeURIComponent(message.id)}/media-download`, { credentials: 'include', headers: authHeaders() });
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = message.content || 'arquivo';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    window.alert('Não foi possível baixar a mídia.');
  }
}

function openImage(message: MediaRow, src: string) {
  document.querySelector('.fsf-media-final-lightbox')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'fsf-media-final-lightbox';
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });

  const card = document.createElement('div');
  card.className = 'fsf-media-final-card';
  const image = document.createElement('img');
  image.src = src;
  image.alt = message.content || 'Imagem';

  const bar = document.createElement('div');
  bar.className = 'fsf-media-final-bar';
  const title = document.createElement('span');
  title.className = 'fsf-media-final-title';
  title.textContent = message.content || 'Imagem';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'fsf-media-final-btn';
  download.textContent = '⬇ Baixar';
  download.onclick = () => void downloadMedia(message);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'fsf-media-final-btn';
  close.textContent = 'Fechar';
  close.onclick = () => overlay.remove();

  bar.append(title, download, close);
  card.append(image, bar);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function enhanceImages() {
  document.querySelectorAll<HTMLElement>('.message-line').forEach(line => {
    const id = String(line.getAttribute('data-testid') || '').replace(/^message-/, '');
    const message = messagesById.get(id);
    if (!message || !String(message.mediaType || '').toLowerCase().startsWith('image/')) return;
    const bubble = line.querySelector<HTMLElement>('.bubble');
    if (!bubble) return;
    const image = bubble.querySelector<HTMLImageElement>('img');
    if (!image || image.closest('.fsf-media-final-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'fsf-media-final-wrap';
    const src = image.currentSrc || image.src;
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'border:0;background:transparent;padding:0;margin:0;cursor:zoom-in;display:block;max-width:100%;';
    button.appendChild(image);
    button.onclick = () => openImage(message, src);

    const actions = document.createElement('div');
    actions.className = 'fsf-media-final-actions';
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'fsf-media-final-btn';
    view.textContent = '⌕ Ampliar';
    view.onclick = () => openImage(message, src);
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'fsf-media-final-btn';
    download.textContent = '⬇ Baixar';
    download.onclick = () => void downloadMedia(message);
    actions.append(view, download);

    wrap.append(button, actions);
    bubble.appendChild(wrap);
  });
}

function enhanceDocuments() {
  document.querySelectorAll<HTMLElement>('.message-line').forEach(line => {
    const id = String(line.getAttribute('data-testid') || '').replace(/^message-/, '');
    const message = messagesById.get(id);
    if (!message) return;
    const type = String(message.mediaType || '').toLowerCase();
    if (!(type.includes('pdf') || type.includes('document') || type.includes('spreadsheet') || type.includes('presentation') || type === 'text/plain' || type === 'text/csv' || type === 'application/zip')) return;
    const bubble = line.querySelector<HTMLElement>('.bubble');
    if (!bubble || bubble.querySelector('.fsf-media-final-document')) return;

    const existing = bubble.querySelector<HTMLAnchorElement>('a.fsf-doc');
    if (!existing) return;
    existing.style.textDecoration = 'none';
    const actions = document.createElement('span');
    actions.className = 'fsf-media-final-actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'fsf-media-final-btn';
    download.textContent = '⬇ Baixar arquivo';
    download.onclick = (event) => { event.preventDefault(); event.stopPropagation(); void downloadMedia(message); };
    actions.appendChild(download);
    existing.parentElement?.appendChild(actions);
    existing.dataset.downloadEnhanced = '1';
    actions.classList.add('fsf-media-final-document');
  });
}

async function run() {
  if (busy) return;
  busy = true;
  try {
    injectStyles();
    await loadMessages();
    enhanceImages();
    enhanceDocuments();
  } catch {
    // O histórico original continua utilizável.
  } finally {
    busy = false;
  }
}

export function installMediaUiFinal() {
  void run();
  window.setInterval(() => void run(), 2500);
  const observer = new MutationObserver(() => { window.setTimeout(() => void run(), 100); });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') document.querySelector('.fsf-media-final-lightbox')?.remove();
  });
}
