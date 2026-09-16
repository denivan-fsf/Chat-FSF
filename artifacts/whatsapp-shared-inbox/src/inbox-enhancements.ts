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
    .fsf-reply-btn{border:1px solid #d5e2d8;background:#fff;color:#55796d;border-radius:7px;padding:5px 8px;cursor:pointer;font:600 9px var(--app-font-mono)}
    .fsf-reply-btn:focus-visible{outline:2px solid #77a98e;outline-offset:1px}
    .fsf-reply-bar{display:flex;gap:8px;align-items:center;padding:8px 10px;margin-bottom:8px;border-left:3px solid #77a98e;background:#edf5ee;border-radius:7px;color:#55766c;font-size:10px}
    .fsf-reply-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fsf-reply-bar button{margin-left:auto;border:0;background:transparent;cursor:pointer}
    .fsf-quote{border-left:3px solid #78a98e;background:rgba(120,169,142,.12);padding:6px 8px;margin-bottom:5px;border-radius:6px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fsf-file{display:flex;gap:8px;align-items:center;padding:7px 9px;margin-bottom:8px;background:#edf5ee;border:1px solid #d3e1d7;border-radius:7px;font-size:10px}
    .fsf-file button{margin-left:auto;border:0;background:transparent;cursor:pointer}
    .fsf-audio-player{display:grid;grid-template-columns:34px minmax(120px,1fr) auto;align-items:center;gap:9px;width:min(340px,100%);max-width:100%;padding:8px 10px;border-radius:9px;background:#e9f3eb;border:1px solid #d1e2d6;box-sizing:border-box}
    .fsf-audio-play{width:32px;height:32px;border:0;border-radius:50%;background:#163f37;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:none}
    .fsf-audio-play svg{width:15px;height:15px;fill:currentColor}
    .fsf-audio-progress{width:100%;min-width:0;accent-color:#163f37;cursor:pointer}
    .fsf-audio-time{font:600 9px var(--app-font-mono);color:#547067;min-width:45px;text-align:right;white-space:nowrap}
    .fsf-image{max-width:280px;max-height:240px;border-radius:8px;display:block}
    .fsf-video{max-width:320px;max-height:240px;border-radius:8px;display:block}
    .fsf-doc{display:block;color:inherit;text-decoration:none;padding:8px;border-radius:7px;background:rgba(90,120,105,.08)}
    .fsf-media-loading{display:inline-block;padding:9px 11px;border-radius:7px;background:rgba(90,120,105,.08);font-size:10px;color:#55766c}
    .composer{position:relative !important;display:block !important;padding:7px 8px 42px !important;}
    .composer textarea{display:block !important;width:100% !important;box-sizing:border-box !important;padding:0 !important;min-height:34px !important;max-height:120px !important;}
    .composer .composer-hint{display:none !important;}
    .fsf-compose-tools{position:absolute !important;left:8px !important;right:8px !important;bottom:6px !important;display:flex !important;align-items:center !important;gap:6px !important;z-index:20 !important;background:transparent !important;}
    .fsf-compose-btn{border:0 !important;background:#0b2f29 !important;color:#d9f75c !important;border-radius:7px !important;width:32px !important;height:30px !important;min-width:32px !important;padding:0 !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;cursor:pointer !important;box-shadow:none !important;}
    .fsf-compose-btn:hover{filter:brightness(1.08)}
    .fsf-compose-btn:focus-visible{outline:2px solid #77a98e !important;outline-offset:1px}
    .fsf-compose-btn svg{width:17px;height:17px;stroke:currentColor;}
    .fsf-compose-btn.recording{background:#163c34 !important;}
    .fsf-compose-hint{color:#83978c !important;font-size:8px !important;line-height:1 !important;white-space:nowrap !important;pointer-events:none !important;margin-left:auto !important;}
    .fsf-compose-tools .fsf-send-btn{width:36px !important;min-width:36px !important;height:30px !important;font-size:17px !important;font-weight:800 !important;}
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
  const tools = document.createElement('div'); tools.className = 'fsf-tools';
  const button = document.createElement('button'); button.type='button'; button.className='fsf-reply-btn'; button.textContent='↩ Responder';
  button.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();setReply(id,text);(document.querySelector('.composer textarea') as HTMLTextAreaElement|null)?.focus();});
  tools.appendChild(button); line.querySelector('.bubble-wrap')?.appendChild(tools);
}

async function mediaObjectUrl(message: EnhancedMessage) {
  if (!message.mediaUrl) return null;
  const cached = mediaObjectUrls.get(message.id); if (cached) return cached;
  const response = await fetch(`${API}/api/messages/${encodeURIComponent(message.id)}/media`,{credentials:'include',headers:authHeaders()});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob); mediaObjectUrls.set(message.id,objectUrl); return objectUrl;
}

function formatAudioTime(value:number){if(!Number.isFinite(value)||value<0)return '0:00';const minutes=Math.floor(value/60);const seconds=Math.floor(value%60).toString().padStart(2,'0');return `${minutes}:${seconds}`;}
function audioIcon(kind:'play'|'pause'){return kind==='play'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"></path></svg>';}

function renderAudioPlayer(bubble:HTMLElement,src:string){
  const wrap=document.createElement('div');wrap.className='fsf-audio-player';
  const audio=document.createElement('audio');audio.preload='metadata';audio.src=src;audio.style.display='none';
  const play=document.createElement('button');play.type='button';play.className='fsf-audio-play';play.setAttribute('aria-label','Reproduzir áudio');play.innerHTML=audioIcon('play');
  const progress=document.createElement('input');progress.type='range';progress.className='fsf-audio-progress';progress.min='0';progress.max='100';progress.value='0';progress.step='0.1';progress.setAttribute('aria-label','Progresso do áudio');
  const time=document.createElement('span');time.className='fsf-audio-time';time.textContent='0:00';
  play.addEventListener('click',()=>{if(audio.paused)void audio.play().catch(()=>{});else audio.pause();});
  progress.addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=(Number(progress.value)/100)*audio.duration;});
  audio.addEventListener('loadedmetadata',()=>{time.textContent=`0:00 / ${formatAudioTime(audio.duration)}`;});
  audio.addEventListener('timeupdate',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0){progress.value=String((audio.currentTime/audio.duration)*100);time.textContent=`${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`;}});
  audio.addEventListener('play',()=>{play.innerHTML=audioIcon('pause');play.setAttribute('aria-label','Pausar áudio');});
  audio.addEventListener('pause',()=>{play.innerHTML=audioIcon('play');play.setAttribute('aria-label','Reproduzir áudio');});
  audio.addEventListener('ended',()=>{progress.value='0';play.innerHTML=audioIcon('play');play.setAttribute('aria-label','Reproduzir áudio');});
  wrap.append(audio,play,progress,time);bubble.appendChild(wrap);
}

async function renderMedia(bubble:HTMLElement,message:EnhancedMessage){
  bubble.textContent='';
  if(!message.mediaUrl){bubble.textContent=message.content||'';return;}
  const loading=document.createElement('span');loading.className='fsf-media-loading';loading.textContent='Carregando mídia...';bubble.appendChild(loading);
  try{const src=await mediaObjectUrl(message);loading.remove();if(!src)throw new Error('Mídia indisponível');const type=String(message.mediaType||'').toLowerCase();
    if(type.startsWith('audio/')){renderAudioPlayer(bubble,src);return;}
    if(type.startsWith('image/')){const image=document.createElement('img');image.className='fsf-image';image.src=src;image.alt=message.content||'Imagem';bubble.appendChild(image);return;}
    if(type.startsWith('video/')){const video=document.createElement('video');video.className='fsf-video';video.controls=true;video.preload='metadata';video.src=src;bubble.appendChild(video);return;}
    const link=document.createElement('a');link.className='fsf-doc';link.href=src;link.download=message.content||'arquivo';link.target='_blank';link.rel='noopener noreferrer';link.textContent=`📎 ${message.content||'Abrir arquivo'}`;bubble.appendChild(link);
  }catch{bubble.textContent=`📎 ${message.content||'Mídia indisponível'}`;}
}

async function enhanceMessages(){
  const thread=document.querySelector('.messages-scroller');if(!thread)return;const id=await activeConversation().catch(()=> '');if(!id)return;
  try{const messages:EnhancedMessage[]=await api(`/api/conversations/${encodeURIComponent(id)}/messages`);const map=new Map(messages.map((item)=>[item.id,item]));
    thread.querySelectorAll('.message-line').forEach((line)=>{const message=map.get(String(line.getAttribute('data-testid')||'').replace(/^message-/,''));
      if(message?.replyTo&&!line.querySelector('.fsf-quote')){const q=document.createElement('div');q.className='fsf-quote';q.textContent=message.replyTo.content||'Mensagem';line.querySelector('.bubble-wrap')?.insertBefore(q,line.querySelector('.bubble')||null);}
      if(message?.mediaUrl&&line.querySelector('.bubble')&&!line.querySelector('.fsf-audio-player,.fsf-image,.fsf-video,.fsf-doc,.fsf-media-loading'))void renderMedia(line.querySelector('.bubble') as HTMLElement,message);
      addReplyButton(line,message);
    });
  }catch{thread.querySelectorAll('.message-line').forEach((line)=>addReplyButton(line));}
}

function fileToDataUrl(input:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('Falha ao ler arquivo'));reader.readAsDataURL(input);});}
function showFile(){document.querySelector('.fsf-file')?.remove();if(!file)return;const area=document.querySelector('.composer-area');if(!area)return;const box=document.createElement('div');box.className='fsf-file';box.innerHTML=`<span>${file.type.startsWith('audio/')?'🎙':'📎'}</span><span>${escapeHtml(file.name)}</span><button type="button" aria-label="Remover anexo">×</button>`;box.querySelector('button')?.addEventListener('click',()=>{file=null;showFile();});const bar=area.querySelector('.fsf-reply-bar');if(bar)bar.insertAdjacentElement('afterend',box);else area.prepend(box);}
function chooseFile(){const input=document.createElement('input');input.type='file';input.accept='audio/*,image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';input.onchange=()=>{file=input.files?.[0]||null;showFile();};input.click();}

function microphoneIcon(){return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="3" width="7" height="11" rx="3.5" stroke="currentColor" stroke-width="2"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;}
async function record(button:HTMLButtonElement){
  if(recorder){recorder.stop();return;}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){window.alert('Seu navegador não permite gravação de áudio.');return;}
  try{recorderStream=await navigator.mediaDevices.getUserMedia({audio:true});const preferred=['audio/ogg;codecs=opus','audio/ogg','audio/webm;codecs=opus','audio/webm'];const mime=preferred.find((item)=>MediaRecorder.isTypeSupported(item));recorder=mime?new MediaRecorder(recorderStream,{mimeType:mime}):new MediaRecorder(recorderStream);chunks=[];button.innerHTML='<span aria-hidden="true">■</span>';button.classList.add('recording');button.title='Parar gravação';recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=()=>{const active=recorder;const mimeType=active?.mimeType||'audio/webm';const ext=mimeType.includes('ogg')?'ogg':'webm';file=new File([new Blob(chunks,{type:mimeType})],`audio-${Date.now()}.${ext}`,{type:mimeType});recorderStream?.getTracks().forEach((track)=>track.stop());recorder=null;recorderStream=null;chunks=[];button.innerHTML=microphoneIcon();button.title='Gravar áudio';button.classList.remove('recording');showFile();};recorder.start(200);
  }catch(error){recorderStream?.getTracks().forEach((track)=>track.stop());recorder=null;recorderStream=null;chunks=[];button.innerHTML=microphoneIcon();button.title='Gravar áudio';button.classList.remove('recording');window.alert(error instanceof Error?error.message:'Não foi possível acessar o microfone.');}
}

function syncTextarea(textarea:HTMLTextAreaElement,value:string){const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(setter)setter.call(textarea,value);else textarea.value=value;textarea.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',data:null}));textarea.dispatchEvent(new Event('change',{bubbles:true}));}

async function send(){
  if(sending)return;const textarea=document.querySelector('.composer textarea') as HTMLTextAreaElement|null;if(!textarea||textarea.disabled)return;const content=textarea.value.trim();if(!content&&!file)return;const id=await activeConversation();if(!id){window.alert('Não consegui identificar a conversa aberta.');return;}sending=true;
  try{const body:any={content,replyToMessageId:reply?.id||null};if(file)body.file={name:file.name,type:file.type||'application/octet-stream',data:await fileToDataUrl(file)};await api(`/api/conversations/${encodeURIComponent(id)}/messages/advanced`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});syncTextarea(textarea,'');file=null;showFile();clearReply();window.setTimeout(()=>void enhanceMessages(),250);window.setTimeout(()=>void enhanceMessages(),900);}
  catch(error){window.alert(error instanceof Error?error.message:'Não foi possível enviar.');}
  finally{sending=false;}
}

function composer(){const root=document.querySelector('.composer');if(!root)return;const textarea=root.querySelector('textarea') as HTMLTextAreaElement|null;if(!textarea)return;const oldSend=root.querySelector('.send-btn') as HTMLElement|null;if(oldSend)oldSend.style.display='none';const oldAttach=root.querySelector('.composer-tool') as HTMLElement|null;if(oldAttach)oldAttach.style.display='none';if(root.querySelector('.fsf-compose-tools'))return;const tools=document.createElement('div');tools.className='fsf-compose-tools';const attach=document.createElement('button');attach.type='button';attach.className='fsf-compose-btn';attach.title='Anexar arquivo';attach.innerHTML='<span aria-hidden="true">📎</span>';attach.onclick=chooseFile;const mic=document.createElement('button');mic.type='button';mic.className='fsf-compose-btn';mic.title='Gravar áudio';mic.innerHTML=microphoneIcon();mic.onclick=()=>void record(mic);const hint=document.createElement('span');hint.className='fsf-compose-hint';hint.textContent='Enter para enviar';const sendButton=document.createElement('button');sendButton.type='button';sendButton.className='fsf-compose-btn fsf-send-btn';sendButton.title='Enviar mensagem';sendButton.textContent='➤';sendButton.onclick=()=>void send();tools.append(attach,mic,hint,sendButton);root.appendChild(tools);}

let timer:number|undefined;function schedule(){if(timer)clearTimeout(timer);timer=window.setTimeout(()=>{composer();void enhanceMessages();},100);}
export function installInboxEnhancements(){styles();const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});schedule();}
