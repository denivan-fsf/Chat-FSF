import { Router } from 'express';
import { pool } from '@workspace/db';
import { broadcastRealtime } from '../lib/realtime';

const router = Router();

function normalizeRole(role: any) {
  return role === 'super_admin' || role === 'admin' ? 'super_admin' : role === 'manager' ? 'manager' : 'agent';
}

function safeName(value: any, fallback = 'Cliente') {
  const name = String(value || '').trim();
  return name || fallback;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'FS';
}

async function authUser(req: any) {
  const token = req.cookies?.fsf_access_token || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const auth: any = await response.json();
  const q = await pool.query('select id,name,email,role,online from public.workspace_users where id=$1 limit 1', [auth.id]);
  return q.rows[0] || null;
}

function requireUser(handler: any) {
  return async (req: any, res: any, next: any) => {
    try {
      const user = await authUser(req);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });
      req.currentUser = user;
      return handler(req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}

async function resolveMediaUrl(username: string, version: string, mediaId: string, token: string) {
  const response = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data?.url || null;
}

function mediaRef(mediaId: string) {
  return `uzapi-media://${mediaId}`;
}

function publicMessage(row: any) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    content: row.content || '',
    mediaUrl: row.media_url || null,
    mediaType: row.media_type || null,
    sentByUser: row.sent_by_user_id ? {
      id: row.sent_user_id,
      name: row.sent_user_name,
      email: row.sent_user_email,
      role: normalizeRole(row.sent_user_role),
      initials: initials(row.sent_user_name || 'AT'),
      online: row.sent_user_online !== false,
    } : null,
    status: row.status,
    createdAt: row.created_at,
    providerMessageId: row.provider_message_id || null,
    replyTo: row.reply_to_id ? {
      id: row.reply_to_id,
      content: row.reply_to_content || '',
      mediaUrl: row.reply_to_media_url || null,
      mediaType: row.reply_to_media_type || null,
      direction: row.reply_to_direction,
    } : null,
  };
}

router.get('/conversations/:id/messages', requireUser(async (req: any, res: any) => {
  const q = await pool.query(`
    select
      m.*,
      u.id as sent_user_id,
      u.name as sent_user_name,
      u.email as sent_user_email,
      u.role as sent_user_role,
      u.online as sent_user_online,
      r.id as reply_to_id,
      r.content as reply_to_content,
      r.media_url as reply_to_media_url,
      r.media_type as reply_to_media_type,
      r.direction as reply_to_direction
    from public.messages m
    left join public.workspace_users u on u.id=m.sent_by_user_id
    left join public.messages r on r.id=m.reply_to_message_id
    where m.conversation_id=$1
    order by m.created_at
  `, [req.params.id]);
  return res.json(q.rows.map(publicMessage));
}));

router.get('/messages/:messageId/media', requireUser(async (req: any, res: any) => {
  const q = await pool.query(`
    select m.media_url,m.media_type,wn.uzapi_username,wn.phone_number_id
    from public.messages m
    join public.conversations c on c.id=m.conversation_id
    join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id
    where m.id=$1
    limit 1
  `, [req.params.messageId]);

  const row = q.rows[0];
  if (!row?.media_url) return res.status(404).json({ error: 'Mídia não encontrada' });

  const username = row.uzapi_username || process.env.UZAPI_USERNAME;
  const token = process.env.UZAPI_ACCESS_TOKEN;
  const version = process.env.UZAPI_VERSION || 'v1';
  if (!username || !token) return res.status(500).json({ error: 'Credenciais UZAPI não configuradas no backend' });

  const stored = String(row.media_url);
  let remoteUrl: string | null = null;
  if (stored.startsWith('uzapi-media://')) {
    remoteUrl = await resolveMediaUrl(username, version, stored.slice('uzapi-media://'.length).trim(), token);
  } else {
    remoteUrl = stored;
  }

  if (!remoteUrl) return res.status(502).json({ error: 'A UZAPI não retornou a URL da mídia' });

  const response = await fetch(remoteUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return res.status(502).json({ error: 'Não foi possível baixar a mídia da UZAPI' });

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || row.media_type || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).send(buffer);
}));

router.post('/conversations/:id/messages/advanced', requireUser(async (req: any, res: any) => {
  const { content, replyToMessageId, file } = req.body || {};
  const text = String(content || '').trim();
  const replyId = replyToMessageId ? String(replyToMessageId) : null;

  const numberQ = await pool.query(`
    select wn.id,wn.phone_number_id,wn.uzapi_username,wn.status,ct.phone_number as contact_phone
    from public.conversations c
    join public.contacts ct on ct.id=c.contact_id
    join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id
    where c.id=$1
    limit 1
  `, [req.params.id]);
  if (!numberQ.rows[0]) return res.status(404).json({ error: 'Conversa ou número não encontrado' });

  const n = numberQ.rows[0];
  const username = n.uzapi_username || process.env.UZAPI_USERNAME;
  const token = process.env.UZAPI_ACCESS_TOKEN;
  const version = process.env.UZAPI_VERSION || 'v1';
  if (!username || !token) return res.status(500).json({ error: 'Credenciais UZAPI não configuradas no backend' });
  if (!n.phone_number_id) return res.status(400).json({ error: 'O número WhatsApp ainda não possui phone_number_id configurado' });
  if (n.status !== 'connected') return res.status(400).json({ error: 'O número WhatsApp está desconectado da UZAPI' });

  const to = String(n.contact_phone || '').replace(/\D/g, '');
  if (!to) return res.status(400).json({ error: 'O contato não possui telefone válido' });
  if (!text && !file) return res.status(400).json({ error: 'Informe uma mensagem, áudio ou arquivo' });

  let replyProviderId: string | null = null;
  if (replyId) {
    const replyQ = await pool.query('select id,provider_message_id from public.messages where id=$1 and conversation_id=$2 limit 1', [replyId, req.params.id]);
    if (!replyQ.rows[0]) return res.status(400).json({ error: 'A mensagem selecionada para resposta não foi encontrada' });
    replyProviderId = replyQ.rows[0].provider_message_id || null;
    if (!replyProviderId) return res.status(400).json({ error: 'A mensagem selecionada ainda não possui identificador da UZAPI para resposta' });
  }

  let type = 'text';
  let mediaUrlValue: string | null = null;
  let mediaTypeValue: string | null = null;
  let payload: any;

  if (file) {
    const name = String(file.name || 'arquivo');
    const mimeType = String(file.type || 'application/octet-stream').toLowerCase();
    const raw = String(file.data || '');
    const match = raw.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Arquivo inválido' });

    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'O arquivo deve ter no máximo 20 MB' });

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), name);
    form.append('messaging_product', 'whatsapp');

    const uploadResponse = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(n.phone_number_id)}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadData: any = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) return res.status(502).json({ error: uploadData?.message || uploadData?.error || 'A UZAPI recusou o upload do arquivo' });

    const mediaId = uploadData?.id || uploadData?.mediaId;
    if (!mediaId) return res.status(502).json({ error: 'A UZAPI não retornou o ID da mídia' });

    mediaUrlValue = mediaRef(String(mediaId));
    mediaTypeValue = mimeType;

    if (mimeType.startsWith('audio/')) {
      type = 'audio';
      payload = { to, type: 'audio', audio: { id: mediaId } };
    } else if (mimeType.startsWith('image/')) {
      type = 'image';
      payload = { to, type: 'image', image: { id: mediaId, ...(text ? { caption: text } : {}) } };
    } else if (mimeType.startsWith('video/')) {
      type = 'video';
      payload = { to, type: 'video', video: { id: mediaId, ...(text ? { caption: text } : {}) } };
    } else {
      type = 'document';
      payload = { to, type: 'document', document: { id: mediaId, filename: name, ...(text ? { caption: text } : {}) } };
    }
  } else {
    payload = { to, type: 'text', text: { preview_url: false, body: text }, delayMessage: 0, delayTyping: 0 };
  }

  if (replyProviderId) payload.context = { message_id: replyProviderId };

  const inserted = await pool.query(`
    insert into public.messages(conversation_id,direction,content,media_url,media_type,sent_by_user_id,status,reply_to_message_id)
    values($1,'outbound',$2,$3,$4,$5,'pending',$6)
    returning *
  `, [req.params.id, text || (type === 'audio' ? 'Áudio' : name), mediaUrlValue, mediaTypeValue, req.currentUser.id, replyId]);
  const local = inserted.rows[0];

  try {
    const apiResponse = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(n.phone_number_id)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const apiData: any = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      await pool.query("update public.messages set status='failed' where id=$1", [local.id]);
      return res.status(502).json({ error: apiData?.message || apiData?.error || 'A UZAPI recusou o envio' });
    }

    const providerMessageId = apiData?.messageId || apiData?.id || apiData?.queueId || null;
    await pool.query("update public.messages set status='sent',provider_message_id=$2 where id=$1", [local.id, providerMessageId]);
    await pool.query('update public.conversations set last_message_preview=$2,last_message_at=now(),updated_at=now() where id=$1', [req.params.id, text || (type === 'audio' ? 'Áudio' : name)]);
    broadcastRealtime({ type: 'message.created', conversationId: req.params.id });

    const full = await pool.query(`
      select m.*,u.id as sent_user_id,u.name as sent_user_name,u.email as sent_user_email,u.role as sent_user_role,u.online as sent_user_online,
      r.id as reply_to_id,r.content as reply_to_content,r.media_url as reply_to_media_url,r.media_type as reply_to_media_type,r.direction as reply_to_direction
      from public.messages m
      left join public.workspace_users u on u.id=m.sent_by_user_id
      left join public.messages r on r.id=m.reply_to_message_id
      where m.id=$1
    `, [local.id]);
    return res.status(201).json(publicMessage(full.rows[0]));
  } catch (error) {
    await pool.query("update public.messages set status='failed' where id=$1", [local.id]);
    console.error('Erro no envio avançado UZAPI', error);
    return res.status(502).json({ error: 'Não foi possível comunicar com a UZAPI' });
  }
}));

export default router;
