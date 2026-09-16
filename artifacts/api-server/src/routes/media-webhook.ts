import { Router } from 'express';
import { pool } from '@workspace/db';
import { broadcastRealtime } from '../lib/realtime';

const router = Router();

const MEDIA_TYPES = new Set(['audio', 'image', 'video', 'document']);

function clean(value: any) {
  return String(value ?? '').trim();
}

function digits(value: any) {
  return clean(value).replace(/\D/g, '');
}

function entriesFromPayload(payload: any) {
  if (Array.isArray(payload?.entry)) return payload.entry;
  if (Array.isArray(payload?.changes)) return [{ changes: payload.changes }];
  if (payload?.value) return [{ changes: [{ value: payload.value }] }];
  return [];
}

function senderName(value: any, senderPhone: string) {
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  const exact = contacts.find((item: any) => digits(item?.wa_id) === senderPhone);
  return clean(exact?.profile?.name || exact?.name || contacts[0]?.profile?.name || contacts[0]?.name || 'Cliente') || 'Cliente';
}

function mediaContent(type: string, media: any) {
  if (type === 'audio') return 'Áudio';
  if (type === 'image') return clean(media?.caption) || 'Imagem';
  if (type === 'video') return clean(media?.caption) || 'Vídeo';
  return clean(media?.caption || media?.filename) || 'Arquivo';
}

function mediaMime(type: string, media: any) {
  const supplied = clean(media?.mime_type);
  if (supplied) return supplied;
  if (type === 'audio') return 'audio/ogg; codecs=opus';
  if (type === 'image') return 'image/jpeg';
  if (type === 'video') return 'video/mp4';
  return 'application/octet-stream';
}

function mediaReference(mediaId: string) {
  return `uzapi-media://${mediaId}`;
}

router.post(
  [
    '/webhooks/whatsapp',
    '/webhook/uzapi',
    '/webhook/message/audio',
    '/webhook/message/image',
    '/webhook/message/video',
    '/webhook/message/document',
  ],
  async (req: any, res: any, next: any) => {
    try {
      const payload = req.body || {};
      const entries = entriesFromPayload(payload);
      let processed = 0;
      let sawMedia = false;

      for (const entry of entries) {
        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
          const value = change?.value || {};
          const metadata = value?.metadata || {};
          const phoneNumberId = clean(metadata?.phone_number_id);
          const displayPhone = digits(metadata?.display_phone_number);
          const messages = Array.isArray(value?.messages) ? value.messages : [];

          for (const message of messages) {
            const type = clean(message?.type).toLowerCase();
            if (!MEDIA_TYPES.has(type)) continue;
            sawMedia = true;

            const providerId = clean(message?.id) || null;
            const senderPhone = digits(message?.from);
            const media = message?.[type] || {};
            const mediaId = clean(media?.id);
            if (!senderPhone || !mediaId) continue;

            if (providerId) {
              const duplicate = await pool.query(
                'select id from public.messages where provider_message_id=$1 limit 1',
                [providerId],
              );
              if (duplicate.rows[0]) continue;
            }

            let numberQ: any = null;
            if (phoneNumberId) {
              numberQ = await pool.query(
                'select id from public.whatsapp_numbers where phone_number_id=$1 limit 1',
                [phoneNumberId],
              );
            }
            if (!numberQ?.rows?.[0] && displayPhone) {
              numberQ = await pool.query(
                'select id from public.whatsapp_numbers where phone_number=$1 limit 1',
                [displayPhone],
              );
            }
            if (!numberQ?.rows?.[0]) {
              console.error('UZAPI mídia recebida sem número configurado', { phoneNumberId, displayPhone, type, providerId });
              continue;
            }

            const numberId = numberQ.rows[0].id;
            const name = senderName(value, senderPhone);
            const content = mediaContent(type, media);
            const mimeType = mediaMime(type, media);
            const timestamp = clean(message?.timestamp);

            const contactQ = await pool.query(
              `insert into public.contacts(name,phone_number)
               values($1,$2)
               on conflict(phone_number)
               do update set
                 name=case when excluded.name <> 'Cliente' then excluded.name else public.contacts.name end,
                 updated_at=now()
               returning id`,
              [name, senderPhone],
            );
            const contactId = contactQ.rows[0].id;

            const conversationQ = await pool.query(
              `insert into public.conversations(
                 contact_id,whatsapp_number_id,status,unread_count,last_message_preview,last_message_at
               )
               values($1,$2,'open',1,$3,now())
               on conflict(contact_id,whatsapp_number_id)
               do update set
                 unread_count=public.conversations.unread_count+1,
                 last_message_preview=excluded.last_message_preview,
                 last_message_at=excluded.last_message_at,
                 updated_at=now()
               returning id`,
              [contactId, numberId, content],
            );
            const conversationId = conversationQ.rows[0].id;

            await pool.query(
              `insert into public.messages(
                 conversation_id,direction,content,media_url,media_type,status,provider_message_id,created_at
               )
               values(
                 $1,'inbound',$2,$3,$4,'delivered',$5,
                 case when $6 ~ '^[0-9]+$' then to_timestamp($6::double precision) else now() end
               )`,
              [conversationId, content, mediaReference(mediaId), mimeType, providerId, timestamp],
            );

            broadcastRealtime({ type: 'message.received', conversationId });
            processed += 1;
          }
        }
      }

      if (sawMedia) {
        return res.status(200).json({ ok: true, processed });
      }
      return next();
    } catch (error) {
      console.error('Erro ao processar webhook de mídia UZAPI', error);
      return res.status(500).json({ ok: false, error: 'Erro interno ao processar mídia' });
    }
  },
);

export default router;
