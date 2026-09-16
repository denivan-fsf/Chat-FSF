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

router.get('/messages/:messageId/media-url', async (req: any, res: any, next: any) => {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    const q = await pool.query(`
      select m.media_url,m.media_type,wn.uzapi_username
      from public.messages m
      join public.conversations c on c.id=m.conversation_id
      join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id
      where m.id=$1
      limit 1
    `, [req.params.messageId]);

    const row = q.rows[0];
    if (!row?.media_url) return res.status(404).json({ error: 'Mídia não encontrada' });

    const stored = String(row.media_url);
    const username = row.uzapi_username || process.env.UZAPI_USERNAME;
    const token = process.env.UZAPI_ACCESS_TOKEN;
    const version = process.env.UZAPI_VERSION || 'v1';
    if (!username || !token) return res.status(500).json({ error: 'Credenciais UZAPI não configuradas no backend' });

    let url = stored;
    if (stored.startsWith('uzapi-media://')) {
      const mediaId = stored.slice('uzapi-media://'.length).trim();
      const response = await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) return res.status(502).json({ error: 'A UZAPI não retornou a URL da mídia' });
      url = data.url;
    }

    return res.json({ url, mediaType: row.media_type || null });
  } catch (error) {
    return next(error);
  }
});

export default router;
