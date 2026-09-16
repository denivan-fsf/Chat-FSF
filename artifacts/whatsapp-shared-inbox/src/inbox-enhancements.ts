type EnhancedMessage = {
  id: string;
  content?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  replyTo?: { id: string; content?: string } | null;
};

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const authHeaders = () => localStorage.getItem('fsf_access_token') ? { Authorization: `Bearer ${localStorage.getItem('fsf_access_token')}` } : {};

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...(options.headers || {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function phone(value: string) { return String(value || '').replace(/\D/g, ''); }
function escapeHtml(value: string) { return value.replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c] || c); }

let activeConversationId = '';
let activeStamp = '';
let reply: { id: string; text: string } | null = null;
let file: File | null = null;
let recorder: MediaRecorder | null = null;
let recorderStream: MediaStream | null = null;
let chunks: Blob[] = [];
let sending = false;

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
  style.textContent = `.fsf-tools{display:flex;gap:5px;margin-top:4px;opacity:0}.message-line:hover .fsf-tools{opacity:1}.fsf-reply-btn,.fsf-compose-btn{border:1px solid #d5e2d8;background:#fff;color:#55796d;border-radius:7px;padding:5px 8px;cursor:pointer;font:600 9px var(--app-font-mono)}.fsf-reply-bar{display:flex;gap:8px;align-items:center;padding:8px 10px;margin-bottom:8px;border-left:3px solid #77a98e;background:#edf5ee;border-radius:7px;color:#55766c;font-size:10px}.fsf-reply-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fsf-reply-bar button{margin-left:auto;border:0;background:transparent;cursor:pointer}.fsf-quote{border-left:3px solid #78a98e;background:rgba(120,169,142,.12);padding:6px 8px;margin-bottom:5px;border-radius:6px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fsf-file{display:flex;gap:8px;align-items:center;padding:7px 9px;margin-bottom:8px;background:#edf5ee;border:1px solid #d3e1d7;border-radius:7px;font-size:10px}.fsf-file button{margin-left:auto;border:0;background:transparent;cursor:pointer}.fsf-audio{width:min(320px,100%)}.fsf-image{max-width:280px;max-height:240px;border-radius:8px}.fsf-video{max-width:320px;max-height:240px;border-radius:8px}.fsf-doc{display:block;color:inherit;text-decoration:none;padding:8px;border-radius:7px;background:rgba(90,120,105,.08)}`;
  document.head.appendChild(style);
}

function setReply(id: string, text: string) {
  reply = { id, text: text || 'Mensagem' };
  const area = document.querySelector('.composer-area');
  if (!area) return;
  let bar = area.querySelector('.fsf-reply-bar') as HTMLElement | null;
  if (!bar) { bar = document.createElement('div'); bar.className = 'fsf-reply-bar'; area.prepend(bar); }
  bar.innerHTML = `<b>↩</b><span>${escapeHtml(reply.text)}</span><button>×</button>`;
  bar.querySelector('button')?.addEventListener('click', clearReply);
}
function clearReply() { reply = null; document.querySelector('.fsf-reply-bar')?.remove(); }

function addReplyButton(line: Element, message?: EnhancedMessage) {
  if (line.querySelector('.fsf-tools')) return;
  const id = message?.id || String(line.getAttribute('data-testid') || '').replace(/^message-/, '');
  if (!id) return;
  const text = line.querySelector('.bubble')?.textContent?.trim() || 'Mensagem';
  const tools = document.createElement('div'); tools.className = 'fsf-tools';
  const button = document.createElement('button'); button.className = 'fsf-reply-btn'; button.textContent = '↩ Responder';
  button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setReply(id, text); (document.querySelector('.composer textarea') as HTMLTextAreaElement | null)?.focus(); });
  tools.appendChild(button); line.querySelector('.bubble-wrap')?.appendChild(tools);
}

function renderMedia(bubble: HTMLElement, message: EnhancedMessage) {
  if (!message.mediaUrl) { bubble.textContent = message.content || ''; return; }
  const type = String(message.mediaType || '');
  if (type.startsWith('audio/')) { const audio = document.createElement('audio'); audio.className='fsf-audio'; audio.controls=true; audio.src=message.mediaUrl; bubble.appendChild(audio); return; }
  if (type.startsWith('image/')) { const image=document.createElement('img'); image.className='fsf-image'; image.src=message.mediaUrl; image.alt=message.content||'Imagem'; bubble.appendChild(image); return; }
  if (type.startsWith('video/')) { const video=document.createElement('video'); video.className='fsf-video'; video.controls=true; video.src=message.mediaUrl; bubble.appendChild(video); return; }
  const link=document.createElement('a'); link.className='fsf-doc'; link.href=message.mediaUrl; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent=`📎 ${message.content||'Abrir arquivo'}`; bubble.appendChild(link);
}

async function enhanceMessages() {
  const thread=document.querySelector('.messages-scroller');
  if(!thread) return;
  const id=await activeConversation().catch(()=> '');
  if(!id) return;
  try {
    const messages: EnhancedMessage[]=await api(`/api/conversations/${encodeURIComponent(id)}/messages`);
    const map=new Map(messages.map((item)=>[item.id,item]));
    thread.querySelectorAll('.message-line').forEach((line)=>{
      const message=map.get(String(line.getAttribute('data-testid')||'').replace(/^message-/,''));
      if(message?.replyTo && !line.querySelector('.fsf-quote')) { const q=document.createElement('div'); q.className='fsf-quote'; q.textContent=message.replyTo.content||'Mensagem'; line.querySelector('.bubble-wrap')?.insertBefore(q,line.querySelector('.bubble')||null); }
      if(message?.mediaUrl && line.querySelector('.bubble') && !line.querySelector('.fsf-audio,.fsf-image,.fsf-video,.fsf-doc')) { const b=line.querySelector('.bubble') as HTMLElement; b.textContent=''; renderMedia(b,message); }
      addReplyButton(line,message);
    });
  } catch { thread.querySelectorAll('.message-line').forEach((line)=>addReplyButton(line)); }
}

function fileToDataUrl(input: File) { return new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result||'')); reader.onerror=()=>reject(reader.error||new Error('Falha ao ler arquivo')); reader.readAsDataURL(input); }); }
function showFile() {
  document.querySelector('.fsf-file')?.remove();
  if(!file) return;
  const area=document.querySelector('.composer-area'); if(!area) return;
  const box=document.createElement('div'); box.className='fsf-file'; box.innerHTML=`<span>${file.type.startsWith('audio/')?'🎙':'📎'}</span><span>${escapeHtml(file.name)}</span><button>×</button>`;
  box.querySelector('button')?.addEventListener('click',()=>{file=null;showFile();});
  const bar=area.querySelector('.fsf-reply-bar'); if(bar) bar.insertAdjacentElement('afterend',box); else area.prepend(box);
}

function chooseFile() {
  const input=document.createElement('input'); input.type='file'; input.accept='audio/*,image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
  input.onchange=()=>{file=input.files?.[0]||null;showFile();}; input.click();
}

async function record(button: HTMLButtonElement) {
  if(recorder){recorder.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){window.alert('Seu navegador não permite gravação de áudio.');return;}
  try {
    recorderStream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mime=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm'].find((item)=>MediaRecorder.isTypeSupported(item));
    recorder=mime?new MediaRecorder(recorderStream,{mimeType:mime}):new MediaRecorder(recorderStream);
    chunks=[]; button.textContent='■'; button.classList.add('recording');
    recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data);};
    recorder.onstop=()=>{const mimeType=recorder?.mimeType||'audio/webm';const ext=mimeType.includes('ogg')?'ogg':'webm';file=new File([new Blob(chunks,{type:mimeType})],`audio-${Date.now()}.${ext}`,{type:mimeType});recorderStream?.getTracks().forEach((track)=>track.stop());recorder=null;recorderStream=null;button.textContent='🎙';button.classList.remove('recording');showFile();};
    recorder.start();
  } catch(error){recorderStream?.getTracks().forEach((track)=>track.stop());recorder=null;recorderStream=null;button.textContent='🎙';button.classList.remove('recording');window.alert(error instanceof Error?error.message:'Não foi possível acessar o microfone.');}
}

function appendSent(message: EnhancedMessage) {
  const thread=document.querySelector('.messages-scroller'); if(!thread)return;
  const line=document.createElement('div'); line.className='message-line own'; line.dataset.testid=`message-${message.id}`;
  const wrap=document.createElement('div'); wrap.className='bubble-wrap';
  const author=document.createElement('span');author.className='bubble-author';author.textContent='Você';wrap.appendChild(author);
  if(message.replyTo){const q=document.createElement('div');q.className='fsf-quote';q.textContent=message.replyTo.content||'Mensagem';wrap.appendChild(q);}
  const bubble=document.createElement('div');bubble.className='bubble';renderMedia(bubble,message);wrap.appendChild(bubble);
  const meta=document.createElement('small');meta.className='bubble-meta';meta.textContent=new Date(message.createdAt||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});meta.insertAdjacentHTML('beforeend',' ✓');wrap.appendChild(meta);line.appendChild(wrap);thread.appendChild(line);thread.scrollTop=thread.scrollHeight;addReplyButton(line,message);
}

async function send() {
  if(sending)return;
  const textarea=document.querySelector('.composer textarea') as HTMLTextAreaElement|null;
  if(!textarea||textarea.disabled)return;
  const content=textarea.value.trim();if(!content&&!file)return;
  const id=await activeConversation();if(!id){window.alert('Não consegui identificar a conversa aberta.');return;}
  sending=true;
  try {
    const body:any={content,replyToMessageId:reply?.id||null};
    if(file)body.file={name:file.name,type:file.type,data:await fileToDataUrl(file)};
    const message=await api(`/api/conversations/${encodeURIComponent(id)}/messages/advanced`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    textarea.value='';file=null;showFile();clearReply();appendSent(message);
  } catch(error){window.alert(error instanceof Error?error.message:'Não foi possível enviar.');}
  finally{sending=false;}
}

function composer() {
  const root=document.querySelector('.composer');if(!root)return;
  const textarea=root.querySelector('textarea') as HTMLTextAreaElement|null;if(!textarea)return;
  const oldSend=root.querySelector('.send-btn') as HTMLElement|null;if(oldSend)oldSend.style.display='none';
  const oldAttach=root.querySelector('.composer-tool') as HTMLElement|null;if(oldAttach)oldAttach.style.display='none';
  if(root.querySelector('.fsf-compose-tools'))return;
  const tools=document.createElement('div');tools.className='fsf-compose-tools';
  const attach=document.createElement('button');attach.type='button';attach.className='fsf-compose-btn';attach.title='Anexar arquivo';attach.textContent='📎';attach.onclick=chooseFile;
  const mic=document.createElement('button');mic.type='button';mic.className='fsf-compose-btn';mic.title='Gravar áudio';mic.textContent='🎙';mic.onclick=()=>void record(mic);
  const sendButton=document.createElement('button');sendButton.type='button';sendButton.className='fsf-compose-btn';sendButton.title='Enviar';sendButton.textContent='➤';sendButton.onclick=()=>void send();
  tools.append(attach,mic,sendButton);root.insertBefore(tools,textarea);
}

let timer:number|undefined;
function schedule(){if(timer)clearTimeout(timer);timer=window.setTimeout(()=>{composer();void enhanceMessages();},100);}

export function installInboxEnhancements(){styles();window.addEventListener('keydown',(event)=>{const target=event.target as HTMLElement|null;if(event.key==='Enter'&&!event.shiftKey&&target?.matches('.composer textarea')){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void send();}},true);const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});schedule();}
