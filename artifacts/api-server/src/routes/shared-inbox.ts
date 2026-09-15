import { Router } from 'express';
import { pool } from '@workspace/db';
import { broadcastRealtime } from '../lib/realtime';

const router = Router();
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'FS';

const normalizeRole = (role: any) =>
  role === 'super_admin' || role === 'admin' ? 'super_admin' :
  role === 'manager' ? 'manager' :
  'agent';

const userFrom = (r: any) =>
  r.user
    ? {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        role: normalizeRole(r.user.role),
        initials: initials(r.user.name),
        online: r.user.online !== false,
      }
    : null;

async function currentUser(req:any) {
  const token =
    req.cookies?.fsf_access_token ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return null;
  }

  const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) return null;

  const auth:any = await resp.json();
  const name =
    auth.user_metadata?.name ||
    auth.user_metadata?.full_name ||
    auth.email?.split('@')[0] ||
    'Usuário';

  const q = await pool.query(
    'select id,name,email,role,online from public.workspace_users where id=$1 limit 1',
    [auth.id],
  );

  if (!q.rows[0]) {
    const legacy = await pool.query(
      'select role from public.users where lower(email)=lower($1) limit 1',
      [auth.email],
    );

    const role = normalizeRole(legacy.rows[0]?.role);

    const created = await pool.query(
      'insert into public.workspace_users (id,name,email,role,online) values ($1,$2,$3,$4,true) returning id,name,email,role,online',
      [auth.id, name, auth.email, role],
    );

    return userFrom({ user: created.rows[0] });
  }

  const updated = await pool.query(
    'update public.workspace_users set name=$2,email=$3,online=true,updated_at=now() where id=$1 returning id,name,email,role,online',
    [auth.id, name, auth.email],
  );

  return userFrom({ user: updated.rows[0] });
}
function requireAuth(handler:any) { return async (req:any,res:any,next:any)=>{ try { const u=await currentUser(req); if(!u) return res.status(401).json({error:'Não autenticado'}); req.currentUser=u; return handler(req,res,next);} catch(e){return next(e);} }; }

router.post('/auth/login', async (req:any,res:any) => {
  const {email,password}=req.body||{};
  if(!email||!password) return res.status(400).json({error:'E-mail e senha são obrigatórios'});
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return res.status(500).json({error:'Supabase não configurado'});
  const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data:any=await response.json();
  if(!response.ok) return res.status(401).json({error:data?.error_description||'Credenciais inválidas'});
  res.cookie('fsf_access_token',data.access_token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:process.env.NODE_ENV==='production'?'none':'lax',maxAge:(data.expires_in||3600)*1000,path:'/'});
  const req2:any={cookies:{fsf_access_token:data.access_token},headers:{}}; const user=await currentUser(req2);
  return res.json({user,accessToken:data.access_token,refreshToken:data.refresh_token});
});
router.get('/auth/session', async (req:any,res:any)=>{ const u=await currentUser(req); if(!u)return res.status(401).json({error:'Sem sessão'}); return res.json({user:u,accessToken:'cookie',refreshToken:''}); });
router.post('/auth/logout',(req:any,res:any)=>{res.clearCookie('fsf_access_token',{path:'/'});res.status(204).end();});

router.get('/dashboard/summary', requireAuth(async (_req:any,res:any)=>{
 const q=await pool.query(`select count(*) filter(where status='open') open,count(*) filter(where status='in_progress') ip,count(*) filter(where status='waiting_customer') wc,count(*) filter(where status='closed' and last_message_at::date=current_date) closed from public.conversations`);
 const u=await pool.query('select count(*) from public.workspace_users'); const n=await pool.query(`select count(*) total,count(*) filter(where status='connected') connected from public.whatsapp_numbers`);
 res.json({open:+q.rows[0].open,inProgress:+q.rows[0].ip,waitingCustomer:+q.rows[0].wc,closedToday:+q.rows[0].closed,responseTimeMinutes:0,onlineAgents:+u.rows[0].count,totalAgents:+u.rows[0].count,connectedNumbers:+n.rows[0].connected,totalNumbers:+n.rows[0].total});
}));
router.get('/users', requireAuth(async (_:any,res:any)=>{
  const q = await pool.query(
    'select id,name,email,role,online from public.workspace_users order by name',
  );
  res.json(q.rows.map((r:any)=>({
    id: r.id,
    name: r.name,
    email: r.email,
    role: normalizeRole(r.role),
    initials: initials(r.name),
    online: Boolean(r.online),
  })));
}));
router.post('/users', requireAuth(async (req:any,res:any)=>{
  const {name,email,password,role='agent',numberIds=[]}=req.body||{};
  if(!name||!email||!password) return res.status(400).json({error:'Nome, e-mail e senha são obrigatórios'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({error:'Supabase Admin não configurado no backend'});
  if(!['agent','manager'].includes(role)) return res.status(400).json({error:'Papel inválido'});
  if(String(password).length < 4) return res.status(400).json({error:'A senha deve ter pelo menos 4 caracteres'});
  const adminResp=await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`,{
    method:'POST',
    headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({email:String(email).trim().toLowerCase(),password:String(password),email_confirm:true,user_metadata:{name:String(name).trim()}}),
  });
  const adminData:any=await adminResp.json().catch(()=>({}));
  if(!adminResp.ok){
    const detail=adminData?.msg||adminData?.message||adminData?.error_description||'Não foi possível criar a conta no Supabase Auth';
    return res.status(adminResp.status===422?409:500).json({error:detail});
  }
  const userId=adminData.id;
  try{
    const created=await pool.query(
      'insert into public.workspace_users (id,name,email,role,online) values ($1,$2,$3,$4,false) on conflict (id) do update set name=excluded.name,email=excluded.email,role=excluded.role,updated_at=now() returning id,name,email,role,online',
      [userId,String(name).trim(),String(email).trim().toLowerCase(),role],
    );
    const cleanIds=Array.isArray(numberIds)?numberIds.filter((x:any)=>typeof x==='string'&&x):[];
    if(cleanIds.length){
      await pool.query('delete from public.workspace_user_numbers where user_id=$1',[userId]);
      for(const numberId of cleanIds){
        await pool.query('insert into public.workspace_user_numbers(user_id,whatsapp_number_id) values($1,$2) on conflict do nothing',[userId,numberId]);
      }
    }
    return res.status(201).json(userFrom({user:created.rows[0]}));
  }catch(error:any){
    await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`,{
      method:'DELETE',
      headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},
    }).catch(()=>{});
    console.error('Erro ao criar workspace_users',error);
    return res.status(500).json({error:'Conta criada no Auth, mas não foi possível concluir o cadastro do atendente.'});
  }
}));

router.delete('/users/:id', requireAuth(async (req:any,res:any)=>{
  const userId=req.params.id;

  if(userId===req.currentUser.id){
    return res.status(400).json({
      error:'Você não pode excluir a própria conta.',
    });
  }

  const target=await pool.query(
    'select id,name,email,role from public.workspace_users where id=$1 limit 1',
    [userId],
  );

  if(!target.rows[0]){
    return res.status(404).json({
      error:'Usuário não encontrado.',
    });
  }

  const targetUser=target.rows[0];

  if(targetUser.role==='super_admin'){
    return res.status(403).json({
      error:'A conta de administrador não pode ser excluída por esta tela.',
    });
  }

  const client=await pool.connect();

  try{
    await client.query('begin');

    // Remove bloqueios de conversas criados pelo usuário.
    await client.query(
      'delete from public.conversation_locks where locked_by=$1',
      [userId],
    );

    // Libera conversas que estavam atribuídas ao usuário.
    await client.query(
      'update public.conversations set assigned_user_id=null, updated_at=now() where assigned_user_id=$1',
      [userId],
    );

    // Remove os acessos do usuário aos números.
    await client.query(
      'delete from public.workspace_user_numbers where user_id=$1',
      [userId],
    );

    // Remove o usuário do workspace.
    await client.query(
      'delete from public.workspace_users where id=$1',
      [userId],
    );

    await client.query('commit');

    // Remove também a conta do Supabase Auth.
    if(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY){
      await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
          method:'DELETE',
          headers:{
            apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      ).catch((error)=>{
        console.error('Usuário removido do workspace, mas não foi possível remover o Auth:',error);
      });
    }

    broadcastRealtime({
      type:'user.deleted',
      id:userId,
    });

    return res.json({
      ok:true,
      id:userId,
      name:targetUser.name,
    });
  }catch(error){
    await client.query('rollback');
    console.error('Erro ao excluir usuário',error);

    return res.status(500).json({
      error:'Não foi possível excluir o atendente.',
    });
  }finally{
    client.release();
  }
}));

router.get('/whatsapp-numbers', requireAuth(async (_:any,res:any)=>{
  const q=await pool.query(`
    select
      n.*,
      coalesce((
        select sum(c.unread_count)
        from public.conversations c
        where c.whatsapp_number_id=n.id
      ),0) as unread_count,
      coalesce((
        select count(*)
        from public.workspace_user_numbers w
        where w.whatsapp_number_id=n.id
      ),0) as team_count
    from public.whatsapp_numbers n
    order by n.created_at
  `);
  res.json(q.rows.map((r:any)=>({
    id:r.id,
    name:r.name,
    phoneNumber:r.phone_number,
    status:r.status,
    unreadCount:Number(r.unread_count),
    teamCount:Number(r.team_count),
  })));
}));
router.get('/whatsapp-numbers/:id/access', requireAuth(async (req:any,res:any)=>{
  const numberId=req.params.id;

  const number=await pool.query(
    'select id,name,phone_number from public.whatsapp_numbers where id=$1',
    [numberId],
  );

  if(!number.rows[0]){
    return res.status(404).json({error:'Número não encontrado'});
  }

  const users=await pool.query(`
    select
      u.id,
      u.name,
      u.email,
      u.role,
      u.online,
      exists(
        select 1
        from public.workspace_user_numbers w
        where w.user_id=u.id
          and w.whatsapp_number_id=$1
      ) as has_access
    from public.workspace_users u
    order by u.name
  `,[numberId]);

  return res.json({
    number:{
      id:number.rows[0].id,
      name:number.rows[0].name,
      phoneNumber:number.rows[0].phone_number,
    },
    users:users.rows.map((u:any)=>({
      id:u.id,
      name:u.name,
      email:u.email,
      role:normalizeRole(u.role),
      online:Boolean(u.online),
      hasAccess:Boolean(u.has_access),
      initials:initials(u.name),
    })),
  });
}));
router.put('/whatsapp-numbers/:id/access', requireAuth(async (req:any,res:any)=>{
  const numberId=req.params.id;
  const userIds=Array.isArray(req.body?.userIds)
    ? req.body.userIds.filter((id:any)=>typeof id==='string' && id)
    : [];

  const number=await pool.query(
    'select id from public.whatsapp_numbers where id=$1',
    [numberId],
  );

  if(!number.rows[0]){
    return res.status(404).json({error:'Número não encontrado'});
  }

  const validUsers=await pool.query(
    'select id from public.workspace_users where id = any($1::uuid[])',
    [userIds],
  );

  const allowedUserIds=validUsers.rows.map((row:any)=>row.id);

  const client=await pool.connect();

  try{
    await client.query('begin');

    await client.query(
      'delete from public.workspace_user_numbers where whatsapp_number_id=$1',
      [numberId],
    );

    for(const userId of allowedUserIds){
      await client.query(
        `insert into public.workspace_user_numbers
          (user_id,whatsapp_number_id)
         values($1,$2)
         on conflict do nothing`,
        [userId,numberId],
      );
    }

    await client.query('commit');

    return res.json({
      ok:true,
      teamCount:allowedUserIds.length,
      userIds:allowedUserIds,
    });
  }catch(error){
    await client.query('rollback');
    console.error('Erro ao atualizar acesso do número',error);
    return res.status(500).json({
      error:'Não foi possível atualizar o acesso do número.',
    });
  }finally{
    client.release();
  }
}));
router.post('/whatsapp-numbers', requireAuth(async (req:any,res:any)=>{
  const {name,phoneNumber,phoneNumberId,uzapiUsername}=req.body||{};
  if(!name||!phoneNumber) return res.status(400).json({error:'Nome e telefone são obrigatórios'});
  const q=await pool.query('insert into public.whatsapp_numbers(name,phone_number,phone_number_id,provider,uzapi_username,status) values($1,$2,$3,\'uzapi\',$4,\'disconnected\') returning *',[name,String(phoneNumber).replace(/\D/g,''),phoneNumberId||null,uzapiUsername||process.env.UZAPI_USERNAME||null]);
  const r=q.rows[0];
  res.status(201).json({id:r.id,name:r.name,phoneNumber:r.phone_number,status:r.status,phoneNumberId:r.phone_number_id,unreadCount:0,teamCount:0});
}));

const convSql=`select c.*,ct.name contact_name,ct.phone_number contact_phone,ct.profile_pic,wn.name number_name,wn.phone_number number_phone,wn.status number_status,p.id user_id,p.name user_name,p.email user_email,p.role user_role from public.conversations c join public.contacts ct on ct.id=c.contact_id join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id left join public.workspace_users p on p.id=c.assigned_user_id`;
const mapConv=(r:any)=>({id:r.id,contact:{id:r.contact_id,name:r.contact_name,phoneNumber:r.contact_phone,profilePic:r.profile_pic,initials:initials(r.contact_name)},whatsappNumber:{id:r.whatsapp_number_id,name:r.number_name,phoneNumber:r.number_phone,status:r.number_status,unreadCount:0,teamCount:0},assignedUser:r.user_id?{id:r.user_id,name:r.user_name,email:r.user_email,role:normalizeRole(r.user_role),initials:initials(r.user_name),online:false}:null,status:r.status,lastMessagePreview:r.last_message_preview,lastMessageAt:r.last_message_at,unreadCount:r.unread_count,tags:r.tags||[],activeViewer:null,activeViewerName:null});
router.get('/conversations', requireAuth(async (req:any,res:any)=>{const args:any[]=[];let where='';if(req.query.numberId){args.push(req.query.numberId);where+=` and c.whatsapp_number_id=$${args.length}`;}if(req.query.status){args.push(req.query.status);where+=` and c.status=$${args.length}`;}if(req.query.search){args.push(`%${req.query.search}%`);where+=` and (ct.name ilike $${args.length} or ct.phone_number ilike $${args.length})`;}const q=await pool.query(convSql+' where true'+where+' order by c.last_message_at desc',args);res.json(q.rows.map(mapConv));}));
router.get('/conversations/:id', requireAuth(async (req:any,res:any)=>{const q=await pool.query(convSql+' where c.id=$1',[req.params.id]);if(!q.rows[0])return res.status(404).json({error:'Conversa não encontrada'});const m=await pool.query('select * from public.messages where conversation_id=$1 order by created_at',[req.params.id]);res.json({...mapConv(q.rows[0]),messages:m.rows.map((x:any)=>({id:x.id,conversationId:x.conversation_id,direction:x.direction,content:x.content,mediaUrl:x.media_url,mediaType:x.media_type,sentByUser:null,status:x.status,createdAt:x.created_at}))});}));
router.patch('/conversations/:id', requireAuth(async (req:any,res:any)=>{
  const {status,assignedUserId,tags,markRead}=req.body||{};

  const q=await pool.query(
    `update public.conversations
     set
       status=coalesce($2,status),
       assigned_user_id=coalesce($3,assigned_user_id),
       tags=coalesce($4,tags),
       unread_count=case when $5=true then 0 else unread_count end,
       updated_at=now()
     where id=$1
     returning id`,
    [
      req.params.id,
      status ?? null,
      assignedUserId ?? null,
      tags ? JSON.stringify(tags) : null,
      markRead === true,
    ],
  );

  if(!q.rows[0])
    return res.status(404).json({error:'Conversa não encontrada'});

  const row=await pool.query(
    convSql+' where c.id=$1',
    [req.params.id],
  );

  broadcastRealtime({
    type:'conversation.updated',
    id:req.params.id,
  });

  res.json(mapConv(row.rows[0]));
}));router.post('/conversations/:id/lock', requireAuth(async (req:any,res:any)=>{const expires=new Date(Date.now()+120000);await pool.query(`insert into public.conversation_locks(conversation_id,locked_by,expires_at) values($1,$2,$3) on conflict(conversation_id) do update set locked_by=excluded.locked_by,expires_at=excluded.expires_at where public.conversation_locks.expires_at < now() or public.conversation_locks.locked_by=excluded.locked_by`,[req.params.id,req.currentUser.id,expires]);res.json({conversationId:req.params.id,lockedBy:req.currentUser,expiresAt:expires.toISOString()});}));
router.get('/conversations/:id/messages', requireAuth(async (req:any,res:any)=>{const q=await pool.query('select * from public.messages where conversation_id=$1 order by created_at',[req.params.id]);res.json(q.rows.map((x:any)=>({id:x.id,conversationId:x.conversation_id,direction:x.direction,content:x.content,mediaUrl:x.media_url,mediaType:x.media_type,sentByUser:null,status:x.status,createdAt:x.created_at})));}));
router.post('/conversations/:id/messages', requireAuth(async (req:any,res:any)=>{
  const {content,mediaUrl,mediaType}=req.body||{};
  const text=String(content||'').trim();
  if(!text) return res.status(400).json({error:'Mensagem vazia'});
  if(mediaType && mediaType!=='text/plain') return res.status(400).json({error:'Nesta etapa, o envio pela UZAPI está habilitado para texto.'});
  const numberQ=await pool.query(`select wn.id,wn.phone_number,wn.phone_number_id,wn.uzapi_username,wn.status,ct.phone_number as contact_phone
    from public.conversations c join public.contacts ct on ct.id=c.contact_id join public.whatsapp_numbers wn on wn.id=c.whatsapp_number_id where c.id=$1 limit 1`,[req.params.id]);
  if(!numberQ.rows[0]) return res.status(404).json({error:'Conversa ou número não encontrado'});
  const n=numberQ.rows[0];
  const username=n.uzapi_username||process.env.UZAPI_USERNAME;
  const token=process.env.UZAPI_ACCESS_TOKEN;
  const version=process.env.UZAPI_VERSION||'v1';
  if(!username||!token) return res.status(500).json({error:'Credenciais UZAPI não configuradas no backend'});
  if(!n.phone_number_id) return res.status(400).json({error:'O número WhatsApp ainda não possui phone_number_id configurado'});
  if(n.status!=='connected') return res.status(400).json({error:'O número WhatsApp está desconectado da UZAPI'});
  const to=String(n.contact_phone||'').replace(/\D/g,'');
  if(!to) return res.status(400).json({error:'O contato não possui telefone válido'});
  const inserted=await pool.query('insert into public.messages(conversation_id,direction,content,media_url,media_type,sent_by_user_id,status) values($1,$2,$3,$4,$5,$6,$7) returning *',[req.params.id,'outbound',text,mediaUrl||null,mediaType||'text',req.currentUser.id,'pending']);
  const x=inserted.rows[0];
  try{
    const apiResp=await fetch(`https://api.uzapi.com.br/${encodeURIComponent(username)}/${encodeURIComponent(version)}/${encodeURIComponent(n.phone_number_id)}/messages`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({to,type:'text',text:{preview_url:false,body:text},delayMessage:0,delayTyping:0}),
    });
    const apiData:any=await apiResp.json().catch(()=>({}));
    if(!apiResp.ok){
      await pool.query('update public.messages set status=\'failed\' where id=$1',[x.id]);
      return res.status(502).json({error:apiData?.message||apiData?.error||'A UZAPI recusou o envio da mensagem'});
    }
    const providerMessageId=apiData?.messageId||apiData?.id||apiData?.queueId||null;
    await pool.query('update public.messages set status=\'sent\',provider_message_id=$2 where id=$1',[x.id,providerMessageId]);
    await pool.query('update public.conversations set last_message_preview=$2,last_message_at=now(),updated_at=now() where id=$1',[req.params.id,text]);
    broadcastRealtime({type:'message.created',conversationId:req.params.id});
    return res.status(201).json({id:x.id,conversationId:x.conversation_id,direction:x.direction,content:x.content,mediaUrl:x.media_url,mediaType:x.media_type,sentByUser:req.currentUser,status:'sent',createdAt:x.created_at,providerMessageId});
  }catch(error:any){
    await pool.query('update public.messages set status=\'failed\' where id=$1',[x.id]);
    console.error('Erro ao enviar mensagem pela UZAPI',error);
    return res.status(502).json({error:'Não foi possível comunicar com a UZAPI'});
  }
}));
router.post('/contacts', requireAuth(async (req:any,res:any)=>{const {name,phoneNumber,numberId}=req.body;const client=await pool.connect();try{await client.query('begin');let ct=await client.query('insert into public.contacts(name,phone_number) values($1,$2) on conflict(phone_number) do update set name=excluded.name returning *',[name,phoneNumber]);let numberId2=numberId;if(!numberId2){const n=await client.query('select id from public.whatsapp_numbers order by created_at limit 1');numberId2=n.rows[0]?.id;}if(!numberId2) throw new Error('Cadastre um número WhatsApp primeiro');const c=await client.query('insert into public.conversations(contact_id,whatsapp_number_id) values($1,$2) on conflict(contact_id,whatsapp_number_id) do update set updated_at=now() returning id',[ct.rows[0].id,numberId2]);await client.query('commit');const full=await pool.query(convSql+' where c.id=$1',[c.rows[0].id]);res.status(201).json({...mapConv(full.rows[0]),messages:[]});}catch(e:any){await client.query('rollback');res.status(400).json({error:e.message});}finally{client.release();}}));

router.get('/webhooks/whatsapp', (_req:any,res:any)=>res.status(200).send('OK'));
router.get('/webhook/uzapi', (_req:any,res:any)=>res.status(200).send('OK'));

async function processUzapiWebhook(req:any,res:any){
  try{
    const payload=req.body||{};
    const entries=Array.isArray(payload.entry)?payload.entry:[];
    let processed=0;
    for(const entry of entries){
      for(const change of (entry?.changes||[])){
        const value=change?.value||{};
        const metadata=value?.metadata||{};
        const phoneNumberId=String(metadata?.phone_number_id||'').trim();
        const messages=Array.isArray(value?.messages)?value.messages:[];
        const statuses=Array.isArray(value?.statuses)?value.statuses:[];
        const displayPhone=String(metadata?.display_phone_number||'').replace(/\D/g,'');

        if(change?.field==='connection'){
          const connected=Array.isArray(value?.status)&&String(value.status[0]?.connection||'').toLowerCase()==='connected';
          if(phoneNumberId) await pool.query('update public.whatsapp_numbers set status=$2,updated_at=now() where phone_number_id=$1',[phoneNumberId,connected?'connected':'disconnected']);
          if(!phoneNumberId && displayPhone) await pool.query('update public.whatsapp_numbers set status=$2,updated_at=now() where phone_number=$1',[displayPhone,connected?'connected':'disconnected']);
        }

        for(const message of messages){
          if(String(message?.type||'')!=='text') continue;
          const phone=String(message?.from||'').replace(/\D/g,'');
          const content=String(message?.text?.body||'').trim();
          if(!phone||!content) continue;
          const providerId=String(message?.id||'').trim()||null;
          const senderName=String(value?.contacts?.[0]?.profile?.name||value?.contacts?.[0]?.name||'Cliente').trim()||'Cliente';
          let numberQ:any;
          if(phoneNumberId){ numberQ=await pool.query('select id from public.whatsapp_numbers where phone_number_id=$1 limit 1',[phoneNumberId]); }
          if((!numberQ||!numberQ.rows[0])&&displayPhone){ numberQ=await pool.query('select id from public.whatsapp_numbers where phone_number=$1 limit 1',[displayPhone]); }
          if(!numberQ?.rows[0]) continue;
          const numberId=numberQ.rows[0].id;
          const existing=providerId?await pool.query('select id from public.messages where provider_message_id=$1 limit 1',[providerId]):{rows:[]};
          if(existing.rows[0]) continue;
          const ct=await pool.query('insert into public.contacts(name,phone_number) values($1,$2) on conflict(phone_number) do update set name=coalesce(nullif(excluded.name,\'Cliente\'),public.contacts.name),updated_at=now() returning id,name',[senderName,phone]);
          const cv=await pool.query(`insert into public.conversations(contact_id,whatsapp_number_id,status,unread_count,last_message_preview,last_message_at) values($1,$2,'open',1,$3,now()) on conflict(contact_id,whatsapp_number_id) do update set unread_count=public.conversations.unread_count+1,last_message_preview=excluded.last_message_preview,last_message_at=now(),updated_at=now() returning id`,[ct.rows[0].id,numberId,content]);
          await pool.query('insert into public.messages(conversation_id,direction,content,status,provider_message_id,created_at) values($1,$2,$3,$4,$5,coalesce(to_timestamp($6),now()))',[cv.rows[0].id,'inbound',content,'delivered',providerId,message?.timestamp||null]);
          broadcastRealtime({type:'message.received',conversationId:cv.rows[0].id});
          processed++;
        }

        for(const status of statuses){
          const providerId=String(status?.id||'').trim();
          const providerStatus=String(status?.status||'').toLowerCase();
          if(!providerId||!providerStatus) continue;
          const localStatus=providerStatus==='read'?'read':providerStatus==='delivered'?'delivered':providerStatus==='sent'?'sent':providerStatus==='failed'?'failed':'pending';
          const updated=await pool.query('update public.messages set status=$2 where provider_message_id=$1',[providerId,localStatus]);
          if(updated.rowCount) processed+=updated.rowCount;
        }
      }
    }
    return res.status(200).json({ok:true,processed});
  }catch(error){
    console.error('Erro webhook UZAPI',error);
    return res.status(500).json({ok:false});
  }
}

router.post([
  '/webhook/uzapi',
  '/webhooks/whatsapp',
  '/webhook/message/text',
  '/webhook/status/delivered',
  '/webhook/status/read',
  '/webhook/connection/connected',
  '/webhook/connection/disconnected',
], processUzapiWebhook);
export default router;
