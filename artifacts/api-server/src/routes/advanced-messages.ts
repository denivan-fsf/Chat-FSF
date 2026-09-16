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

async function getMediaRow(messageId: string) {
  const q = await pool.query(`
    select m.media_url,m.media_type,m.content,c.id as conversation_id,wn.uzapi_username,wn.phone_number_id
    from public.messages m
    join public.conversations c on c.id=m.conversation_id
    join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id
    where m.id=$1
    limit 1
  `, [messageId]);
  return q.rows[0] || null;
}

async function getRemoteMedia(row: any) {
  const username = row.uzapi_username || process.env.UZAPI_USERNAME;
  const token = process.env.UZAPI_ACCESS_TOKEN;
  const version = process.env.UZAPI_VERSION || 'v1';
  if (!username || !token) throw new Error('Credenciais UZAPI não configuradas no backend');

  const stored = String(row.media_url || '');
  let remoteUrl: string | null = null;
  if (stored.startsWith('uzapi-media://')) {
    remoteUrl = await resolveMediaUrl(username, version, stored.slice('uzapi-media://'.length).trim(), token);
  } else {
    remoteUrl = stored;
  }
  if (!remoteUrl) throw new Error('A UZAPI não retornou a URL da mídia');

  const response = await fetch(remoteUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Não foi possível baixar a mídia da UZAPI');
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || row.media_type || 'application/octet-stream',
    filename: row.content || 'arquivo',
  };
}

router.get('/messages/:messageId/media', requireUser(async (req: any, res: any) => {
  try {
    const row = await getMediaRow(req.params.messageId);
    if (!row?.media_url) return res.status(404).json({ error: 'Mídia não encontrada' });
    const media = await getRemoteMedia(row);
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Content-Length', String(media.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(media.buffer);
  } catch (error: any) {
    console.error('Erro ao recuperar mídia', error);
    return res.status(502).json({ error: error?.message || 'Não foi possível recuperar a mídia' });
  }
}));

router.get('/messages/:messageId/media-download', requireUser(async (req: any, res: any) => {
  try {
    const row = await getMediaRow(req.params.messageId);
    if (!row?.media_url) return res.status(404).json({ error: 'Mídia não encontrada' });
    const media = await getRemoteMedia(row);
    const safeFilename = String(media.filename || 'arquivo').replace(/[\\/\r\n]/g, '_');
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', String(media.buffer.length));
    return res.status(200).send(media.buffer);
  } catch (error: any) {
    console.error('Erro no download de mídia', error);
    return res.status(502).json({ error: error?.message || 'Não foi possível baixar o arquivo' });
  }
}));

router.post('/conversations/:id/messages/advanced', requireUser(async (req: any, res: any) => {
  const { content, replyToMessageId, file } = req.body || {};
  const text = String(content || '').trim();
  const replyId = replyToMessageId ? String(replyToMessageId) : null;
  const fileName = file ? String(file.name || 'arquivo') : '';

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
  let localContent = text;

  if (file) {
    const name = fileName || 'arquivo';
    const mimeType = String(file.type || 'application/octet-stream').toLowerCase();
    const raw = String(file.data || '');
    const comma = raw.indexOf(',');
    if (!raw.startsWith('data:') || comma < 0) {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }

    const base64Data = raw.slice(comma + 1).replace(/\s/g, '');
    if (!base64Data) return res.status(400).json({ error: 'Arquivo vazio' });

    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Arquivo vazio' });
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
      localContent = text || 'Áudio';
      payload = { to, type: 'audio', audio: { id: mediaId } };
    } else if (mimeType.startsWith('image/')) {
      type = 'image';
      localContent = text || name;
      payload = { to, type: 'image', image: { id: mediaId, ...(text ? { caption: text } : {}) } };
    } else if (mimeType.startsWith('video/')) {
      type = 'video';
      localContent = text || name;
      payload = { to, type: 'video', video: { id: mediaId, ...(text ? { caption: text } : {}) } };
    } else {
      type = 'document';
      localContent = text || name;
      payload = { to, type: 'document', document: { id: mediaId, filename: name, ...(text ? { caption: text } : {}) } };
    }
  } else {
    localContent = text;
    payload = { to, type: 'text', text: { preview_url: false, body: text }, delayMessage: 0, delayTyping: 0 };
  }

  if (replyProviderId) payload.context = { message_id: replyProviderId };

  const inserted = await pool.query(`
    insert into public.messages(conversation_id,direction,content,media_url,media_type,sent_by_user_id,status,reply_to_message_id)
    values($1,'outbound',$2,$3,$4,$5,'pending',$6)
    returning *
  `, [req.params.id, localContent, mediaUrlValue, mediaTypeValue, req.currentUser.id, replyId]);
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
    await pool.query('update public.conversations set last_message_preview=$2,last_message_at=now(),updated_at=now() where id=$1', [req.params.id, localContent]);
    broadcastRealtime({ type: 'message.created', conversationId: req.params.id });

    const full = await pool.query(`
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
    `, [local.id]);
    return res.status(201).json(publicMessage(full.rows[0]));
  } catch (error) {
    await pool.query("update public.messages set status='failed' where id=$1", [local.id]);
    console.error('Erro no envio avançado UZAPI', error);
    return res.status(502).json({ error: 'Não foi possível comunicar com a UZAPI' });
  }
}));

router.post(
  [
    '/webhooks/whatsapp',
    '/webhook/message/audio',
    '/webhook/message/image',
    '/webhook/message/video',
    '/webhook/message/document',
  ],
  async (req: any, res: any, next: any) => {
    try {
      const payload = req.body || {};
      const entries = Array.isArray(payload.entry) ? payload.entry : [];
      const token = process.env.UZAPI_ACCESS_TOKEN;
      if (!token) return next();

      let handledMedia = false;

      for (const entry of entries) {
        for (const change of entry?.changes || []) {
          const value = change?.value || {};
          if (change?.field !== 'messages') continue;

          const metadata = value?.metadata || {};
          const phoneNumberId = String(metadata?.phone_number_id || '').trim();
          const displayPhone = String(metadata?.display_phone_number || '').replace(/\D/g, '');
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          const mediaMessages = messages.filter((m: any) => ['audio', 'image', 'video', 'document'].includes(String(m?.type || '').toLowerCase()));
          if (!mediaMessages.length) continue;

          let numberQ: any;
          if (phoneNumberId) {
            numberQ = await pool.query('select id,uzapi_username,phone_number_id from public.whatsapp_numbers where phone_number_id=$1 limit 1', [phoneNumberId]);
          }
          if ((!numberQ || !numberQ.rows[0]) && displayPhone) {
            numberQ = await pool.query('select id,uzapi_username,phone_number_id from public.whatsapp_numbers where phone_number=$1 limit 1', [displayPhone]);
          }
          if (!numberQ?.rows[0]) continue;

          const numberId = numberQ.rows[0].id;
          for (const message of mediaMessages) {
            const providerId = String(message?.id || '').trim() || null;
            if (!providerId) continue;
            const existing = await pool.query('select id from public.messages where provider_message_id=$1 limit 1', [providerId]);
            if (existing.rows[0]) continue;

            const phone = String(message?.from || '').replace(/\D/g, '');
            if (!phone) continue;
            const senderName = safeName(
              value?.contacts?.find((c: any) => String(c?.wa_id || '').replace(/\D/g, '') === phone)?.profile?.name ||
              value?.contacts?.[0]?.profile?.name ||
              value?.contacts?.[0]?.name,
            );

            const type = String(message.type || '').toLowerCase();
            const media = message[type] || {};
            const mediaId = String(media?.id || '').trim();
            if (!mediaId) continue;
            const mimeType = String(
              media?.mime_type ||
              (type === 'audio' ? 'audio/ogg; codecs=opus' :
               type === 'image' ? 'image/jpeg' :
               type === 'video' ? 'video/mp4' :
               'application/octet-stream'),
            );
            const content = String(
              media?.caption ||
              media?.filename ||
              (type === 'audio' ? 'Áudio' : type === 'image' ? 'Imagem' : type === 'video' ? 'Vídeo' : 'Arquivo'),
            );

            const ct = await pool.query(`
              insert into public.contacts(name,phone_number)
              values($1,$2)
              on conflict(phone_number)
              do update set
                name=case when excluded.name <> 'Cliente' then excluded.name else public.contacts.name end,
                updated_at=now()
              returning id
            `, [senderName, phone]);

            const cv = await pool.query(`
              insert into public.conversations(contact_id,whatsapp_number_id,status,unread_count,last_message_preview,last_message_at)
              values($1,$2,'open',1,$3,now())
              on conflict(contact_id,whatsapp_number_id)
              do update set
                unread_count=public.conversations.unread_count+1,
                last_message_preview=excluded.last_message_preview,
                last_message_at=excluded.last_message_at,
                updated_at=now()
              returning id
            `, [ct.rows[0].id, numberId, content]);

            await pool.query(`
              insert into public.messages(
                conversation_id,direction,content,media_url,media_type,status,provider_message_id,created_at
              )
              values($1,'inbound',$2,$3,$4,'delivered',$5,coalesce(to_timestamp($6),now()))
            `, [cv.rows[0].id, content, mediaRef(mediaId), mimeType, providerId, message?.timestamp || null]);

            broadcastRealtime({ type: 'message.received', conversationId: cv.rows[0].id });
            handledMedia = true;
          }
        }
      }

      return handledMedia ? res.status(200).json({ ok: true, mediaProcessed: true }) : next();
    } catch (error) {
      console.error('Erro webhook de mídia UZAPI', error);
      return next(error);
    }
  },
);

export default router;
