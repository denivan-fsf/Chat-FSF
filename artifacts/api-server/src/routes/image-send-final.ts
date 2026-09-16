import { Router } from 'express';
import { pool } from '@workspace/db';
import { broadcastRealtime } from '../lib/realtime';

const router = Router();

function initials(name: string) {
  return String(name || 'AT').split(/\s+/).filter(Boolean).slice(0, 2).map((x: string) => x[0]).join('').toUpperCase() || 'AT';
}

function normalizeRole(role: any) {
  return role === 'super_admin' || role === 'admin' ? 'super_admin' : role === 'manager' ? 'manager' : 'agent';
}

async function currentUser(req: any) {
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
      const user = await currentUser(req);
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
  return response.ok ? String(data?.url || '') : '';
}

router.post('/conversations/:id/messages/advanced', requireUser(async (req: any, res: any, next: any) => {
  const file = req.body?.file;
  const mimeType = String(file?.type || '').toLowerCase().split(';')[0];
  if (!file || !mimeType.startsWith('image/')) return next();

  const content = String(req.body?.content || '').trim();
  const replyId = req.body?.replyToMessageId ? String(req.body.replyToMessageId) : null;
  const name = String(file.name || 'imagem');
  const raw = String(file.data || '');
  const comma = raw.indexOf(',');
  if (!raw.startsWith('data:') || comma < 0) return res.status(400).json({ error: 'Arquivo de imagem inválido.' });

  const buffer = Buffer.from(raw.slice(comma + 1).replace(/\s/g, ''), 'base64');
  if (!buffer.length) return res.status(400).json({ error: 'A imagem está vazia.' });
  if (buffer.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'A imagem deve ter no máximo 20 MB.' });

  const numberQ = await pool.query(`
    select wn.id, wn.phone_number_id, wn.uzapi_username, wn.status, ct.phone_number as contact_phone
    from public.conversations c
    join public.contacts ct on ct.id=c.contact_id
    join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id
    where c.id=$1 limit 1
  `, [req.params.id]);
  const n = numberQ.rows[0];
  if (!n) return res.status(404).json({ error: 'Conversa ou número não encontrado.' });

  const username = n.uzapi_username || process.env.UZAPI_USERNAME;
  const token = process.env.UZAPI_ACCESS_TOKEN;
  const version = process.env.UZAPI_VERSION || 'v1';
  if (!username || !token) return res.status(500).json({ error: 'Credenciais UZAPI não configuradas no backend.' });
  if (!n.phone_number_id) return res.status(400).json({ error: 'O número WhatsApp não possui phone_number_id configurado.' });
  if (n.status !== 'connected') return res.status(400).json({ error: 'O número WhatsApp está desconectado.' });

  const to = String(n.contact_phone || '').replace(/\D/g, '');
  if (!to) return res.status(400).json({ error: 'O contato não possui telefone válido.' });

  let replyProviderId: string | null = null;
  if (replyId) {
    const replyQ = await pool.query('select provider_message_id from public.messages where id=$1 and conversation_id=$2 limit 1', [replyId, req.params.id]);
    if (!replyQ.rows[0]) return res.status(400).json({ error: 'A mensagem selecionada para resposta não foi encontrada.' });
    replyProviderId = replyQ.rows[0].provider_message_id || null;
    if (!replyProviderId) return res.status(400).json({ error: 'A mensagem selecionada não possui identificador da UZAPI.' });
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
  if (!uploadResponse.ok) return res.status(502).json({ error: uploadData?.message || uploadData?.error || 'A UZAPI recusou o upload da imagem.' });

  const mediaId = String(uploadData?.id || uploadData?.mediaId || '').trim();
  if (!mediaId) return res.status(502).json({ error: 'A UZAPI não retornou o ID da imagem.' });

  const storedMediaRef = `uzapi-media://${mediaId}`;
  const localContent = content || name;
  const inserted = await pool.query(`
    insert into public.messages(conversation_id,direction,content,media_url,media_type,sent_by_user_id,status,reply_to_message_id)
    values($1,'outbound',$2,$3,$4,$5,'pending',$6) returning *
  `, [req.params.id, localContent, storedMediaRef, mimeType, req.currentUser.id, replyId]);
  const local = inserted.rows[0];

  try {
    const remoteUrl = await resolveMediaUrl(username, version, mediaId, token);
    const basePayload: any = { to, type: 'image', delayMessage: 0, delayTyping: 0 };
    if (replyProviderId) basePayload.context = { message_id: replyProviderId };

    let apiResponse: Response;
    let apiData: any = {};

    if (remoteUrl) {
      apiResponse = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(n.phone_number_id)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...basePayload, image: { link: remoteUrl, ...(content ? { caption: content } : {}) } }),
      });
      apiData = await apiResponse.json().catch(() => ({}));
    } else {
      apiResponse = new Response(null, { status: 502 });
    }

    if (!apiResponse.ok) {
      apiResponse = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(n.phone_number_id)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...basePayload, image: { id: mediaId, ...(content ? { caption: content } : {}) } }),
      });
      apiData = await apiResponse.json().catch(() => ({}));
    }

    if (!apiResponse.ok) {
      await pool.query("update public.messages set status='failed' where id=$1", [local.id]);
      return res.status(502).json({ error: apiData?.message || apiData?.error || 'A UZAPI recusou o envio da imagem.' });
    }

    const providerMessageId = apiData?.messageId || apiData?.id || apiData?.queueId || null;
    await pool.query("update public.messages set status='sent', provider_message_id=$2 where id=$1", [local.id, providerMessageId]);
    await pool.query('update public.conversations set last_message_preview=$2,last_message_at=now(),updated_at=now() where id=$1', [req.params.id, localContent]);
    broadcastRealtime({ type: 'message.created', conversationId: req.params.id });

    const full = await pool.query(`
      select m.*, u.id as sent_user_id, u.name as sent_user_name, u.email as sent_user_email,
             u.role as sent_user_role, u.online as sent_user_online,
             r.id as reply_to_id, r.content as reply_to_content, r.media_url as reply_to_media_url,
             r.media_type as reply_to_media_type, r.direction as reply_to_direction
      from public.messages m
      left join public.workspace_users u on u.id=m.sent_by_user_id
      left join public.messages r on r.id=m.reply_to_message_id
      where m.id=$1
    `, [local.id]);
    const row = full.rows[0];
    return res.status(201).json({
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction,
      content: row.content || '',
      mediaUrl: row.media_url || null,
      mediaType: row.media_type || null,
      sentByUser: { id: row.sent_user_id, name: row.sent_user_name, email: row.sent_user_email, role: normalizeRole(row.sent_user_role), initials: initials(row.sent_user_name), online: row.sent_user_online !== false },
      status: row.status,
      createdAt: row.created_at,
      providerMessageId: row.provider_message_id || null,
      replyTo: row.reply_to_id ? { id: row.reply_to_id, content: row.reply_to_content || '', mediaUrl: row.reply_to_media_url || null, mediaType: row.reply_to_media_type || null, direction: row.reply_to_direction } : null,
    });
  } catch (error) {
    await pool.query("update public.messages set status='failed' where id=$1", [local.id]).catch(() => {});
    console.error('Erro no envio final de imagem UZAPI', error);
    return res.status(502).json({ error: 'Não foi possível enviar a imagem pela UZAPI.' });
  }
}));

export default router;
