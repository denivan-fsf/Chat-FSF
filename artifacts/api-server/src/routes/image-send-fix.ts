import { Router } from 'express';
import { pool } from '@workspace/db';
import { broadcastRealtime } from '../lib/realtime';

const router = Router();

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
  return String(data?.url || '') || null;
}

function normalizeRole(role: any) {
  return role === 'super_admin' || role === 'admin' ? 'super_admin' : role === 'manager' ? 'manager' : 'agent';
}

function initials(name: string) {
  return String(name || 'AT').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'AT';
}

async function publicMessageById(id: string) {
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
    where m.id=$1
    limit 1
  `, [id]);
  const row = q.rows[0];
  if (!row) return null;
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
      initials: initials(row.sent_user_name),
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

async function sendImagePayload(username: string, version: string, phoneNumberId: string, token: string, payload: any) {
  const response = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data: any = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

router.post('/conversations/:id/messages/advanced', requireUser(async (req: any, res: any, next: any) => {
  const { content, replyToMessageId, file } = req.body || {};
  if (!file) return next();

  const mimeType = String(file.type || '').toLowerCase().split(';')[0].trim();
  if (!mimeType.startsWith('image/')) return next();

  const text = String(content || '').trim();
  const replyId = replyToMessageId ? String(replyToMessageId) : null;
  const name = String(file.name || `imagem-${Date.now()}.jpg`);
  const raw = String(file.data || '');
  const comma = raw.indexOf(',');
  if (!raw.startsWith('data:') || comma < 0) return res.status(400).json({ error: 'Imagem inválida' });

  const base64Data = raw.slice(comma + 1).replace(/\s/g, '');
  if (!base64Data) return res.status(400).json({ error: 'Imagem vazia' });
  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length) return res.status(400).json({ error: 'Imagem vazia' });
  if (buffer.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'A imagem deve ter no máximo 20 MB' });

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

  let replyProviderId: string | null = null;
  if (replyId) {
    const replyQ = await pool.query('select provider_message_id from public.messages where id=$1 and conversation_id=$2 limit 1', [replyId, req.params.id]);
    if (!replyQ.rows[0]) return res.status(400).json({ error: 'A mensagem selecionada para resposta não foi encontrada' });
    replyProviderId = replyQ.rows[0].provider_message_id || null;
    if (!replyProviderId) return res.status(400).json({ error: 'A mensagem selecionada ainda não possui identificador da UZAPI para resposta' });
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), name);
  form.append('messaging_product', 'whatsapp');

  const uploadResponse = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(n.phone_number_id)}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadData: any = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    return res.status(502).json({ error: uploadData?.message || uploadData?.error || 'A UZAPI recusou o upload da imagem' });
  }

  const mediaId = String(uploadData?.id || uploadData?.mediaId || '').trim();
  if (!mediaId) return res.status(502).json({ error: 'A UZAPI não retornou o ID da imagem' });

  const context = replyProviderId ? { message_id: replyProviderId } : undefined;
  const basePayload: any = {
    to,
    type: 'image',
    image: { id: mediaId, ...(text ? { caption: text } : {}) },
    ...(context ? { context } : {}),
    delayMessage: 0,
    delayTyping: 0,
  };

  try {
    // A documentação da UZAPI possui um exemplo específico para imagem por ID.
    // Tentamos primeiro esse formato, sem campos extras do Meta Cloud API.
    let attempt = await sendImagePayload(username, version, n.phone_number_id, token, basePayload);

    // Só usamos a URL como fallback se a própria UZAPI rejeitar o envio por ID.
    if (!attempt.ok) {
      const resolvedUrl = await resolveMediaUrl(username, version, mediaId, token);
      if (resolvedUrl) {
        const urlPayload: any = {
          to,
          type: 'image',
          image: { link: resolvedUrl, ...(text ? { caption: text } : {}) },
          ...(context ? { context } : {}),
          delayMessage: 0,
          delayTyping: 0,
        };
        attempt = await sendImagePayload(username, version, n.phone_number_id, token, urlPayload);
      }
    }

    if (!attempt.ok) {
      const detail = attempt.data?.message || attempt.data?.error_description || attempt.data?.error || `HTTP ${attempt.status}`;
      console.error('UZAPI recusou imagem:', { status: attempt.status, detail, to, mediaId });
      return res.status(502).json({ error: `A UZAPI recusou o envio da imagem: ${detail}` });
    }

    const providerMessageId = attempt.data?.messageId || attempt.data?.id || attempt.data?.queueId || null;

    const inserted = await pool.query(`
      insert into public.messages(conversation_id,direction,content,media_url,media_type,sent_by_user_id,status,provider_message_id,reply_to_message_id)
      values($1,'outbound',$2,$3,$4,$5,'sent',$6,$7)
      returning id
    `, [req.params.id, text || name, `uzapi-media://${mediaId}`, mimeType, req.currentUser.id, providerMessageId, replyId]);

    await pool.query('update public.conversations set last_message_preview=$2,last_message_at=now(),updated_at=now() where id=$1', [req.params.id, text || name]);
    broadcastRealtime({ type: 'message.created', conversationId: req.params.id });

    return res.status(201).json(await publicMessageById(inserted.rows[0].id));
  } catch (error) {
    console.error('Erro no envio de imagem pela UZAPI', error);
    return res.status(502).json({ error: 'Não foi possível comunicar com a UZAPI para enviar a imagem' });
  }
}));

export default router;
