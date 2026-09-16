import { Router } from 'express';
import { pool } from '@workspace/db';

const router = Router();

async function authUser(req: any) {
  const token = req.cookies?.fsf_access_token || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const auth: any = await response.json();
  const q = await pool.query('select id from public.workspace_users where id=$1 limit 1', [auth.id]);
  return q.rows[0] || null;
}

async function resolveRemoteUrl(stored: string, username: string, version: string, token: string) {
  if (!stored.startsWith('uzapi-media://')) return stored;
  const mediaId = stored.slice('uzapi-media://'.length).trim();
  const response = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data?.url || null;
}

router.get('/messages/:messageId/media-download', async (req: any, res: any, next: any) => {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    const q = await pool.query(`
      select m.media_url,m.media_type,m.content,wn.uzapi_username
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

    const remoteUrl = await resolveRemoteUrl(String(row.media_url), username, version, token);
    if (!remoteUrl) return res.status(502).json({ error: 'A UZAPI não retornou a URL da mídia' });

    const response = await fetch(remoteUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return res.status(502).json({ error: 'Não foi possível baixar a mídia da UZAPI' });

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || row.media_type || 'application/octet-stream';
    const safeName = String(row.content || 'arquivo').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 120) || 'arquivo';
    const extByType: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'video/mp4': '.mp4',
      'application/pdf': '.pdf',
    };
    const lowerName = safeName.toLowerCase();
    const filename = /\.[a-z0-9]{2,6}$/i.test(lowerName) ? safeName : `${safeName}${extByType[contentType.split(';')[0].toLowerCase()] || ''}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
});

export default router;
