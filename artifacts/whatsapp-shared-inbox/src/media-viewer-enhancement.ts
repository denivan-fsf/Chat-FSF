type MediaMessage = {
  id: string;
  content?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const authHeaders = () => {
  const token = localStorage.getItem('fsf_access_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function getMediaSource(message: MediaMessage) {
  const response = await fetch(`${API}/api/messages/${encodeURIComponent(message.id)}/media`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function injectStyles() {
  if (document.getElementById('fsf-media-viewer-style')) return;
  const style = document.createElement('style');
  style.id = 'fsf-media-viewer-style';
  style.textContent = `
    .fsf-media-image-wrap{position:relative;display:inline-block;max-width:100%}
    .fsf-media-image-btn{display:block;padding:0;border:0;background:transparent;cursor:zoom-in;line-height:0}
    .fsf-media-image-btn img{cursor:zoom-in}
    .fsf-media-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}
    .fsf-media-action{border:1px solid #cddbd2;background:#fff;color:#21483f;border-radius:7px;padding:5px 8px;font:600 9px var(--app-font-mono);cursor:pointer;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
    .fsf-media-action:hover{filter:brightness(.98)}
    .fsf-media-lightbox{position:fixed;inset:0;background:rgba(5,25,21,.82);display:flex;align-items:center;justify-content:center;padding:28px;z-index:10000}
    .fsf-media-modal{position:relative;max-width:min(94vw,1100px);max-height:94vh;background:#eef5f0;border-radius:14px;padding:14px;box-shadow:0 24px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:10px}
    .fsf-media-modal img{display:block;max-width:min(90vw,1060px);max-height:calc(94vh - 85px);object-fit:contain;border-radius:10px}
    .fsf-media-modal-bar{display:flex;justify-content:flex-end;gap:7px;align-items:center}
    .fsf-media-modal-title{margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 10px var(--app-font-mono);color:#355b50}
    .fsf-media-close{border:0;background:#163f37;color:#d9f75c;border-radius:8px;padding:7px 10px;cursor:pointer;font:700 10px var(--app-font-mono)}
    .fsf-media-document-card{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:9px;background:#eef5f0;border:1px solid #cfddd4}
    .fsf-media-document-info{min-width:0;display:flex;flex-direction:column;gap:2px}
    .fsf-media-document-name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fsf-media-document-type{font:500 8px var(--app-font-mono);color:#628076;text-transform:uppercase}
  `;
  document.head.appendChild(style);
}

function closeLightbox() {
  document.querySelector('.fsf-media-lightbox')?.remove();
}

function openImage(message: MediaMessage, src: string) {
  closeLightbox();
  const overlay = document.createElement('div');
  overlay.className = 'fsf-media-lightbox';
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeLightbox(); });
  const modal = document.createElement('div');
  modal.className = 'fsf-media-modal';
  const img = document.createElement('img');
  img.src = src;
  img.alt = message.content || 'Imagem';
  const bar = document.createElement('div');
  bar.className = 'fsf-media-modal-bar';
  const title = document.createElement('span');
  title.className = 'fsf-media-modal-title';
  title.textContent = message.content || 'Imagem';
  const download = document.createElement('a');
  download.className = 'fsf-media-action';
  download.href = `${API}/api/messages/${encodeURIComponent(message.id)}/media-download`;
  download.setAttribute('download', message.content || 'imagem');
  download.textContent = '⬇ Baixar';
  download.onclick = (event) => {
    const token = localStorage.getItem('fsf_access_token');
    if (!token) return;
    event.preventDefault();
    fetch(download.href, { credentials:'include', headers:authHeaders() })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => { const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=message.content||'imagem'; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000); })
      .catch(()=>{});
  };
  const close = document.createElement('button');
  close.className = 'fsf-media-close';
  close.type = 'button';
  close.textContent = 'Fechar';
  close.onclick = closeLightbox;
  bar.append(title, download, close);
  modal.append(img, bar);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function downloadMessage(message: MediaMessage) {
  const url = `${API}/api/messages/${encodeURIComponent(message.id)}/media-download`;
  const token = localStorage.getItem('fsf_access_token');
  fetch(url, { credentials: 'include', headers: authHeaders() })
    .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
    .then(blob => { const objectUrl=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=objectUrl; a.download=message.content||'arquivo'; a.click(); setTimeout(()=>URL.revokeObjectURL(objectUrl),1000); })
    .catch(()=>window.alert('Não foi possível baixar o arquivo.'));
}

async function enhance() {
  injectStyles();
  const thread = document.querySelector('.messages-scroller');
  if (!thread) return;
  const apiToken = localStorage.getItem('fsf_access_token');
  if (!apiToken) return;
  const person = document.querySelector('.message-person');
  const phone = (person?.querySelector('p')?.textContent || '').replace(/\D/g,'');
  const name = person?.querySelector('h2')?.textContent?.trim() || '';
  if (!phone && !name) return;

  try {
    const listResponse = await fetch(`${API}/api/conversations`, { credentials:'include', headers:authHeaders() });
    if (!listResponse.ok) return;
    const conversations = await listResponse.json();
    const conversation = (conversations || []).find((item:any) => String(item?.contact?.phoneNumber || '').replace(/\D/g,'') === phone || (!phone && item?.contact?.name === name));
    if (!conversation?.id) return;
    const response = await fetch(`${API}/api/conversations/${encodeURIComponent(conversation.id)}/messages`, { credentials:'include', headers:authHeaders() });
    if (!response.ok) return;
    const messages: MediaMessage[] = await response.json();
    const map = new Map(messages.map(message => [message.id, message]));

    thread.querySelectorAll<HTMLElement>('.message-line').forEach(line => {
      const id = String(line.getAttribute('data-testid') || '').replace(/^message-/,'');
      const message = map.get(id);
      if (!message?.mediaUrl) return;
      const bubble = line.querySelector<HTMLElement>('.bubble');
      if (!bubble || bubble.dataset.viewerReady === '1') return;
      const type = String(message.mediaType || '').toLowerCase();

      if (type.startsWith('image/')) {
        const oldImage = bubble.querySelector('img');
        if (oldImage) {
          oldImage.style.maxWidth = '360px';
          oldImage.style.maxHeight = '320px';
          if (oldImage.parentElement?.classList.contains('fsf-media-image-wrap')) {
            bubble.dataset.viewerReady='1';
            return;
          }
          const src = oldImage.src;
          const wrap = document.createElement('div'); wrap.className='fsf-media-image-wrap';
          const button = document.createElement('button'); button.type='button'; button.className='fsf-media-image-btn';
          oldImage.remove(); button.appendChild(oldImage); wrap.appendChild(button); bubble.appendChild(wrap);
          button.onclick=()=>openImage(message,src);
          const actions=document.createElement('div'); actions.className='fsf-media-actions';
          const download=document.createElement('button'); download.type='button'; download.className='fsf-media-action'; download.textContent='⬇ Baixar'; download.onclick=()=>downloadMessage(message); actions.appendChild(download);
          wrap.appendChild(actions); bubble.dataset.viewerReady='1'; return;
        }
      }

      if (type.includes('pdf') || type.includes('document') || (!type.startsWith('audio/') && !type.startsWith('video/'))) {
        if (bubble.querySelector('.fsf-media-document-card')) { bubble.dataset.viewerReady='1'; return; }
        bubble.textContent='';
        const card=document.createElement('div'); card.className='fsf-media-document-card';
        const info=document.createElement('div'); info.className='fsf-media-document-info';
        const nameEl=document.createElement('div'); nameEl.className='fsf-media-document-name'; nameEl.textContent=message.content||'Arquivo';
        const typeEl=document.createElement('div'); typeEl.className='fsf-media-document-type'; typeEl.textContent=message.mediaType||'arquivo';
        info.append(nameEl,typeEl);
        const download=document.createElement('button'); download.type='button'; download.className='fsf-media-action'; download.textContent='⬇ Baixar'; download.onclick=()=>downloadMessage(message);
        card.append('📎',info,download); bubble.appendChild(card); bubble.dataset.viewerReady='1';
      }
    });
  } catch {
    // A visualização original continua funcionando caso a consulta adicional falhe.
  }
}

export function installMediaViewerEnhancement() {
  const run = () => void enhance();
  run();
  window.setInterval(run, 4000);
  const observer = new MutationObserver(() => run());
  observer.observe(document.body, { childList:true, subtree:true });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeLightbox(); });
}
