import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowLeft, ArrowRight, ArrowRightLeft, Bell, Check, CheckCheck, ChevronDown,
  CircleHelp, Clock3, Copy, Link2, LockKeyhole, Menu, MessageSquare, MoreHorizontal,
  Paperclip, PanelRight, Phone, Plus, RefreshCw, Search, Send, Settings as SettingsIcon,
  ShieldCheck, SlidersHorizontal, Tag, UserRound, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import {
  getGetConversationQueryKey, getGetDashboardSummaryQueryKey, getGetSessionQueryKey, getHealthCheckQueryKey,
  getListConversationsQueryKey, getListMessagesQueryKey, getListUsersQueryKey,
  getListWhatsappNumbersQueryKey, getVerifyWhatsappWebhookQueryKey,
  useGetConversation, useGetDashboardSummary, useGetSession, useHealthCheck, useListConversations,
  useListMessages, useListUsers, useListWhatsappNumbers, useLockConversation, useLogin,
  useReceiveWhatsappWebhook, useSendMessage, useUpdateConversation, useVerifyWhatsappWebhook,
} from '@workspace/api-client-react';
import type {
  Conversation, ConversationDetail, ConversationStatus, Message, Session, User, WhatsappNumber,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });

const statusLabels: Record<string, string> = {
  open: 'Aberta',
  in_progress: 'Em atendimento',
  waiting_customer: 'Aguardando cliente',
  closed: 'Encerrada',
};
const statusColors: Record<string, string> = {
  open: 'bg-[#f6b84b] text-[#4e3410]',
  in_progress: 'bg-[#b3dbd2] text-[#164a45]',
  waiting_customer: 'bg-[#d7c9ef] text-[#4a356c]',
  closed: 'bg-[#d4ddd7] text-[#41524c]',
};

function initials(name?: string, fallback = 'AT') {
  if (!name) return fallback;
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return 'agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function Avatar({ name, initials: given, online = false, size = 'md' }: {
  name?: string; initials?: string; online?: boolean; size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`avatar avatar-${size}`} data-testid={`avatar-${name ?? 'user'}`}>
      {given ?? initials(name)}
      {online && <i className="avatar-presence" />}
    </span>
  );
}

function Button({ children, className = '', variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

function LoadingRows({ count = 5 }: { count?: number }) {
  return <div className="space-y-3 p-4" data-testid="loading-conversations">
    {Array.from({ length: count }).map((_, index) => <div className="skeleton-row" key={index}><span /><div><b /><em /></div></div>)}
  </div>;
}

function ErrorState({ message = 'Não conseguimos atualizar este painel.' , onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="state-card" data-testid="error-state">
    <div className="state-icon state-icon-error"><WifiOff size={18} /></div>
    <strong>Conexão interrompida</strong>
    <p>{message}</p>
    <Button variant="secondary" onClick={onRetry} data-testid="button-retry"><RefreshCw size={14} /> Tentar novamente</Button>
  </div>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="state-card" data-testid="empty-state">
    <div className="state-icon"><MessageSquare size={18} /></div>
    <strong>{title}</strong><p>{message}</p>
  </div>;
}

function BrandMark() {
  return <div className="brand-mark"><span /><span /><span /></div>;
}

function Sidebar({ session }: { session?: Session }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const nav = [
    { href: '/', label: 'Caixa de entrada', icon: MessageSquare },
    { href: '/numbers', label: 'Números conectados', icon: Phone },
    { href: '/team', label: 'Equipe', icon: Users },
    { href: '/settings', label: 'Configurações', icon: SettingsIcon },
  ];
  return <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`} data-testid="sidebar">
    <div className="sidebar-top">
      <Link href="/" className="brand-link" data-testid="link-home"><BrandMark /><span><b>atendimento</b><small>compartilhado</small></span></Link>
      <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} aria-label="Recolher menu" data-testid="button-collapse-sidebar"><Menu size={17} /></button>
    </div>
    <div className="workspace-switcher"><span className="workspace-dot" /><div><small>WORKSPACE</small><b>Casa Norte</b></div><ChevronDown size={15} /></div>
    <nav className="sidebar-nav" aria-label="Navegação principal">
      <span className="nav-kicker">Operação</span>
      {nav.slice(0, 1).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} /><span>{label}</span>{href === '/' && <i className="nav-count">8</i>}</Link>)}
      <span className="nav-kicker">Gestão</span>
      {nav.slice(1).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} /><span>{label}</span></Link>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-live"><span className="live-pulse" /><div><b>Operação normal</b><small>Todos os canais ativos</small></div></div>
      <div className="profile-row"><Avatar name={session?.user.name} initials={session?.user.initials} online size="sm" /><div><b>{session?.user.name ?? 'Operador'}</b><small>{session?.user.role === 'super_admin' ? 'Administrador' : 'Atendente'}</small></div><MoreHorizontal size={16} /></div>
    </div>
  </aside>;
}

function Topbar({ title, subtitle, session, onMenu }: { title: string; subtitle?: string; session?: Session; onMenu: () => void }) {
  return <header className="topbar">
    <button className="mobile-menu" onClick={onMenu} data-testid="button-open-menu"><Menu size={20} /></button>
    <div><div className="eyebrow">ATENDIMENTO COMPARTILHADO <span className="eyebrow-line" /></div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="topbar-actions"><div className="connection-state"><span className="live-pulse" /><span className="connection-copy"><b>Conectado</b><small>Atualizado agora</small></span></div><button className="icon-btn" aria-label="Notificações" data-testid="button-notifications"><Bell size={18} /><i /></button><Avatar name={session?.user.name} initials={session?.user.initials} online /></div>
  </header>;
}

function Shell({ session, children }: { session?: Session; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return <div className="app-shell"><div className={`mobile-scrim ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} /><div className={sidebarOpen ? 'sidebar-mobile-open' : ''}><Sidebar session={session} /></div><main className="app-main"><Topbar title={getPageTitle()} session={session} onMenu={() => setSidebarOpen(true)} />{children}</main></div>;
}

function getPageTitle() {
  const path = window.location.pathname;
  if (path === '/numbers') return 'Números conectados';
  if (path === '/team') return 'Equipe';
  if (path === '/settings') return 'Configurações';
  return 'Caixa de entrada';
}

function StatStrip({ summary }: { summary?: { open: number; inProgress: number; waitingCustomer: number; closedToday: number; responseTimeMinutes: number; onlineAgents: number; totalAgents: number } }) {
  const stats = [
    { label: 'Abertas', value: summary?.open ?? '—', tone: 'amber' },
    { label: 'Em atendimento', value: summary?.inProgress ?? '—', tone: 'teal' },
    { label: 'Aguardando cliente', value: summary?.waitingCustomer ?? '—', tone: 'lilac' },
    { label: 'Encerradas hoje', value: summary?.closedToday ?? '—', tone: 'slate' },
  ];
  return <div className="stat-strip">{stats.map((stat) => <div className="stat-cell" key={stat.label}><span className={`stat-dot ${stat.tone}`} /><div><small>{stat.label}</small><strong data-testid={`stat-${stat.label.toLowerCase().replaceAll(' ', '-')}`}>{stat.value}</strong></div></div>)}<div className="stat-meta"><Clock3 size={15} /><span><b>{summary?.responseTimeMinutes ?? '—'} min</b><small>tempo médio de resposta</small></span></div></div>;
}

function Inbox() {
  const sessionQuery = useGetSession({ query: { queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const summaryQuery = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 30_000 } });
  const numbersQuery = useListWhatsappNumbers({ query: { queryKey: getListWhatsappNumbersQueryKey(), staleTime: 30_000 } });
  const usersQuery = useListUsers({ query: { queryKey: getListUsersQueryKey(), staleTime: 30_000 } });
  const [search, setSearch] = useState('');
  const [numberId, setNumberId] = useState('');
  const [status, setStatus] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const params = useMemo(() => ({ numberId: numberId || undefined, status: status || undefined, assignedUserId: assignedUserId || undefined, search: search || undefined }), [numberId, status, assignedUserId, search]);
  const conversationsQuery = useListConversations(params, { query: { queryKey: getListConversationsQueryKey(params), refetchInterval: 20_000 } });
  const conversations = conversationsQuery.data ?? [];
  const activeId = selectedId || conversations[0]?.id || '';
  useEffect(() => { if (selectedId && !conversations.some((item) => item.id === selectedId)) setSelectedId(conversations[0]?.id ?? ''); }, [conversations, selectedId]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const prefix = import.meta.env.BASE_URL.replace(/\/$/, '');
      socket = new WebSocket(`${protocol}//${window.location.host}${prefix}/ws`);
      socket.onmessage = () => {
        void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      };
      socket.onclose = () => {
        if (!disposed) timer = setTimeout(connect, 4000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, []);
  if (sessionQuery.isLoading) return <AuthLoading />;
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  return <WorkspaceInbox session={sessionQuery.data} summary={summaryQuery.data} summaryLoading={summaryQuery.isLoading} numbers={numbersQuery.data ?? []} users={usersQuery.data ?? []} conversations={conversations} conversationsQuery={conversationsQuery} activeId={activeId} onSelect={setSelectedId} search={search} setSearch={setSearch} numberId={numberId} setNumberId={setNumberId} status={status} setStatus={setStatus} assignedUserId={assignedUserId} setAssignedUserId={setAssignedUserId} />;
}

function WorkspaceInbox({ session, summary, summaryLoading, numbers, users, conversations, conversationsQuery, activeId, onSelect, search, setSearch, numberId, setNumberId, status, setStatus, assignedUserId, setAssignedUserId }: any) {
  return <Shell session={session}><div className="page-content inbox-page"><StatStrip summary={summary} />{summaryLoading && <div className="freshness-note"><span className="loading-dot" /> Atualizando indicadores...</div>}<div className="inbox-grid">
    <section className="conversation-panel panel"><div className="panel-heading"><div><h2>Conversas <span>{conversations.length}</span></h2><p>Priorize o que precisa de você.</p></div><Button className="new-filter-button" variant="secondary" onClick={() => { setStatus('open'); setSearch(''); }} data-testid="button-clear-filters"><SlidersHorizontal size={15} /> Filtros</Button></div>
      <div className="search-wrap"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou mensagem" aria-label="Buscar conversas" data-testid="input-search-conversations" />{search && <button onClick={() => setSearch('')} aria-label="Limpar busca" data-testid="button-clear-search"><X size={15} /></button>}</div>
      <div className="filter-row"><select value={numberId} onChange={(event) => setNumberId(event.target.value)} aria-label="Filtrar por número" data-testid="select-filter-number"><option value="">Todos os números</option>{numbers.map((number: WhatsappNumber) => <option key={number.id} value={number.id}>{number.name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por status" data-testid="select-filter-status"><option value="">Qualquer status</option>{Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} aria-label="Filtrar por atendente" data-testid="select-filter-assignee"><option value="">Toda a equipe</option>{users.map((user: User) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></div>
      <div className="conversation-list">{conversationsQuery.isLoading ? <LoadingRows /> : conversationsQuery.isError ? <ErrorState onRetry={() => conversationsQuery.refetch()} /> : conversations.length === 0 ? <EmptyState title="Nada por aqui" message="Tente remover um filtro ou aguarde novas mensagens." /> : conversations.map((conversation: Conversation, index: number) => <ConversationRow key={conversation.id} conversation={conversation} selected={activeId === conversation.id} onClick={() => onSelect(conversation.id)} index={index} />)}</div>
      <div className="list-footer"><span><span className="live-pulse" /> Sincronização contínua</span><span>{conversations.length} exibidas</span></div>
    </section>
    <ConversationView id={activeId} session={session} users={users} />
    <ContextRail conversation={conversations.find((item: Conversation) => item.id === activeId)} summary={summary} numbers={numbers} />
  </div></div></Shell>;
}

function ConversationRow({ conversation, selected, onClick, index }: { conversation: Conversation; selected: boolean; onClick: () => void; index: number }) {
  return <button className={`conversation-row ${selected ? 'selected' : ''} animate-rise`} style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }} onClick={onClick} data-testid={`button-conversation-${conversation.id}`}>
    <Avatar name={conversation.contact.name} initials={conversation.contact.initials} size="lg" /><div className="conversation-main"><div className="conversation-row-top"><strong>{conversation.contact.name}</strong><time>{formatTime(conversation.lastMessageAt)}</time></div><p>{conversation.lastMessagePreview}</p><div className="conversation-meta"><span className="number-label"><span />{conversation.whatsappNumber.name}</span>{conversation.tags?.slice(0, 1).map((tag) => <span className="tag" key={tag}>{tag}</span>)}{conversation.assignedUser && <span className="assigned-mini"><Avatar name={conversation.assignedUser.name} initials={conversation.assignedUser.initials} size="sm" /></span>}</div></div>{conversation.unreadCount > 0 && <b className="unread-badge">{conversation.unreadCount}</b>}{conversation.activeViewer && <span className="viewer-mark" title={`Sendo visto por ${conversation.activeViewerName}`}><UserRound size={11} /></span>}</button>;
}

function ConversationView({ id, session, users }: { id: string; session: Session; users: User[] }) {
  const queryClient = useQueryClient();
  const detailQuery = useGetConversation(id, { query: { enabled: Boolean(id), queryKey: getGetConversationQueryKey(id), refetchInterval: 15_000 } });
  const messagesQuery = useListMessages(id, { query: { enabled: Boolean(id), queryKey: getListMessagesQueryKey(id), refetchInterval: 15_000 } });
  const updateConversation = useUpdateConversation();
  const lockConversation = useLockConversation();
  const sendMessage = useSendMessage();
  const [draft, setDraft] = useState('');
  const [lock, setLock] = useState<any>(null);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const conversation = detailQuery.data as ConversationDetail | undefined;
  const messages = [...((messagesQuery.data ?? conversation?.messages ?? []) as Message[]), ...optimistic];
  const canWrite = Boolean(lock?.lockedBy?.id === session.user.id);
  const doLock = () => { if (!id) return; lockConversation.mutate({ id }, { onSuccess: (data) => setLock(data), onError: () => setLock(null) }); };
  const send = () => {
    const content = draft.trim();
    if (!content || !id || !canWrite) return;
    const temp: Message = { id: `temp-${Date.now()}`, conversationId: id, direction: 'outbound', content, mediaUrl: null, mediaType: null, sentByUser: session.user, status: 'pending', createdAt: new Date().toISOString() };
    setOptimistic((items) => [...items, temp]); setDraft('');
    sendMessage.mutate({ id, data: { content } }, { onSuccess: () => { setOptimistic([]); queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); }, onError: () => setOptimistic((items) => items.filter((item) => item.id !== temp.id)) });
  };
  const setStatus = (next: ConversationStatus) => { if (!id) return; updateConversation.mutate({ id, data: { status: next } }, { onSuccess: (data) => { queryClient.setQueryData(getGetConversationQueryKey(id), data); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); } }); };
  const assign = (userId: string) => { updateConversation.mutate({ id, data: { assignedUserId: userId || null } }, { onSuccess: (data) => { queryClient.setQueryData(getGetConversationQueryKey(id), data); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); } }); };
  useEffect(() => { setLock(null); setOptimistic([]); }, [id]);
  if (!id) return <section className="message-panel panel empty-conversation"><EmptyState title="Escolha uma conversa" message="As mensagens e os detalhes aparecem aqui." /></section>;
  if (detailQuery.isLoading) return <section className="message-panel panel"><LoadingRows count={7} /></section>;
  if (detailQuery.isError) return <section className="message-panel panel"><ErrorState onRetry={() => detailQuery.refetch()} /></section>;
  const currentStatus = conversation?.status ?? 'open';
  return <section className="message-panel panel">
    <div className="message-header"><div className="message-person"><Avatar name={conversation?.contact.name} initials={conversation?.contact.initials} size="lg" /><div><h2>{conversation?.contact.name}</h2><p><span className="online-dot" /> {conversation?.contact.phoneNumber}</p></div></div><div className="message-actions"><div className="lock-status">{canWrite ? <><LockKeyhole size={14} /> Você está respondendo</> : lock ? <><UserRound size={14} /> {lock.lockedBy.name} responde</> : <span>Resposta colaborativa</span>}</div><Button variant={canWrite ? 'secondary' : 'primary'} onClick={doLock} disabled={lockConversation.isPending || canWrite || Boolean(lock && !canWrite)} data-testid="button-lock-conversation">{canWrite ? <Check size={15} /> : <LockKeyhole size={15} />}{canWrite ? 'Em sua posse' : lock ? 'Em atendimento' : 'Responder'}</Button><button className="icon-btn" aria-label="Mais ações" data-testid="button-conversation-actions"><MoreHorizontal size={18} /></button></div></div>
    <div className="message-subheader"><span className={`status-pill ${statusColors[currentStatus]}`}><span />{statusLabels[currentStatus]}</span><span className="subheader-divider" /><span><Phone size={13} /> {conversation?.whatsappNumber.name}</span><span className="subheader-divider" /><select className="assignee-select" value={conversation?.assignedUser?.id ?? ''} onChange={(event) => assign(event.target.value)} aria-label="Atribuir conversa" data-testid="select-conversation-assignee"><option value="">Sem responsável</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><div className="status-actions"><button onClick={() => setStatus(currentStatus === 'closed' ? 'open' : 'closed')} data-testid="button-toggle-status">{currentStatus === 'closed' ? 'Reabrir' : 'Encerrar'} <ArrowRightLeft size={13} /></button><select value={currentStatus} onChange={(event) => setStatus(event.target.value as ConversationStatus)} aria-label="Alterar status" data-testid="select-conversation-status"><option value="open">Aberta</option><option value="in_progress">Em atendimento</option><option value="waiting_customer">Aguardando</option><option value="closed">Encerrada</option></select></div></div>
    <div className="messages-scroller" data-testid="message-thread">{messagesQuery.isLoading ? <LoadingRows count={4} /> : messages.length === 0 ? <EmptyState title="Início da conversa" message="Envie a primeira mensagem para começar." /> : <><div className="date-rule"><span>Hoje</span></div>{messages.map((message) => <MessageBubble message={message} own={message.direction === 'outbound'} key={message.id} />)}</>}</div>
    <div className="composer-area"><div className={`lock-callout ${canWrite ? 'has-lock' : ''}`}><span className="lock-icon"><LockKeyhole size={14} /></span><span>{canWrite ? 'Você tem 8 minutos para responder esta conversa.' : 'Adquira a resposta para escrever nesta conversa.'}</span>{!canWrite && !lock && <button onClick={doLock} data-testid="button-acquire-lock">Adquirir agora</button>}</div><div className="composer"><button className="composer-tool" aria-label="Anexar arquivo" data-testid="button-attach"><Paperclip size={18} /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={canWrite ? 'Escreva uma resposta...' : 'Adquira a resposta para escrever'} disabled={!canWrite} aria-label="Mensagem" data-testid="textarea-message" /><span className="composer-hint">Enter para enviar</span><button className="send-btn" onClick={send} disabled={!canWrite || !draft.trim() || sendMessage.isPending} aria-label="Enviar mensagem" data-testid="button-send-message"><Send size={17} /></button></div></div>
  </section>;
}

function MessageBubble({ message, own }: { message: Message; own: boolean }) {
  return <div className={`message-line ${own ? 'own' : ''}`} data-testid={`message-${message.id}`}><div className="bubble-avatar">{own ? <Avatar name={message.sentByUser?.name} initials={message.sentByUser?.initials} size="sm" /> : <span className="contact-bubble">{initials(message.sentByUser?.name, 'CN')}</span>}</div><div className="bubble-wrap"><span className="bubble-author">{own ? message.sentByUser?.name ?? 'Você' : 'Cliente'}</span><div className="bubble">{message.content}</div><small>{formatTime(message.createdAt)} {own && (message.status === 'pending' ? <Clock3 size={11} /> : <CheckCheck size={12} />)}</small></div></div>;
}

function ContextRail({ conversation, summary, numbers }: { conversation?: Conversation; summary?: any; numbers: WhatsappNumber[] }) {
  return <aside className="context-rail"><div className="context-heading"><div><span className="eyebrow">VISÃO RÁPIDA</span><h2>Contexto</h2></div><button className="icon-btn" aria-label="Fechar contexto" data-testid="button-close-context"><PanelRight size={17} /></button></div>{conversation ? <><div className="contact-card"><div className="contact-card-top"><Avatar name={conversation.contact.name} initials={conversation.contact.initials} size="lg" online /><div><h3>{conversation.contact.name}</h3><p>{conversation.contact.phoneNumber}</p></div><button className="icon-btn" aria-label="Mais detalhes do contato" data-testid="button-contact-details"><MoreHorizontal size={16} /></button></div><div className="contact-info"><span><small>CANAL</small><b>{conversation.whatsappNumber.name}</b></span><span><small>ÚLTIMA ATIVIDADE</small><b>{formatTime(conversation.lastMessageAt)}</b></span></div></div><div className="context-block"><div className="block-title"><span>Etiquetas</span><button aria-label="Adicionar etiqueta" data-testid="button-add-tag"><Plus size={14} /></button></div><div className="tag-cloud">{(conversation.tags?.length ? conversation.tags : ['sem etiqueta']).map((tag) => <span className="tag tag-large" key={tag}><Tag size={12} />{tag}</span>)}</div></div><div className="context-block"><div className="block-title"><span>Responsável</span><button aria-label="Trocar responsável" data-testid="button-change-assignee"><ArrowRightLeft size={14} /></button></div><div className="rail-user"><Avatar name={conversation.assignedUser?.name} initials={conversation.assignedUser?.initials} online={conversation.assignedUser?.online} /><div><b>{conversation.assignedUser?.name ?? 'Sem responsável'}</b><small>{conversation.assignedUser?.online ? 'Online agora' : 'Offline'}</small></div></div></div><div className="context-block"><div className="block-title"><span>Número de origem</span></div><div className="number-rail"><span className="number-symbol"><Phone size={15} /></span><div><b>{conversation.whatsappNumber.name}</b><small>{conversation.whatsappNumber.phoneNumber}</small></div><span className="connected-tiny" /></div></div></> : <EmptyState title="Sem contexto" message="Selecione uma conversa para ver os detalhes." />}<div className="rail-footnote"><ShieldCheck size={15} /><span>Dados protegidos e sincronizados</span></div></aside>;
}

function AuthLoading() { return <div className="auth-screen"><div className="auth-card loading-auth"><BrandMark /><div className="loading-bars"><span /><span /><span /></div><p>Preparando seu espaço de atendimento...</p></div></div>; }

function LoginScreen() {
  const login = useLogin();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); setError(''); login.mutate({ data: { email, password } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() }); setLocation('/'); }, onError: () => setError('Confira seu e-mail e senha para continuar.') }); };
  return <div className="auth-screen"><div className="auth-ornament"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><BrandMark /><span>um inbox, todo o cuidado</span></div><div className="auth-card"><div className="auth-card-head"><BrandMark /><span>CASA NORTE <i>•</i> WORKSPACE</span></div><h1>Seu time, <em>na mesma conversa.</em></h1><p className="auth-lead">Entre para cuidar de cada cliente com clareza, sem perder o fio.</p><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" required data-testid="input-login-email" /></label><label>Senha<div className="password-input"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" required data-testid="input-login-password" /><button type="button" onClick={() => setPassword('')} aria-label="Limpar senha" data-testid="button-clear-password"><X size={14} /></button></div></label>{error && <div className="form-error" data-testid="text-login-error">{error}</div>}<Button type="submit" className="login-button" disabled={login.isPending} data-testid="button-login">{login.isPending ? 'Entrando...' : 'Entrar no workspace'}<ArrowRight size={16} /></Button></form><div className="auth-footer"><ShieldCheck size={14} /> Ambiente privado e protegido</div></div></div>;
}

function NumbersPage() {
  const sessionQuery = useGetSession({ query: { queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const numbersQuery = useListWhatsappNumbers({ query: { queryKey: getListWhatsappNumbersQueryKey(), refetchInterval: 30_000 } });
  const [notice, setNotice] = useState('');
  if (sessionQuery.isLoading) return <AuthLoading />;
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  const numbers = numbersQuery.data ?? [];
  return <Shell session={sessionQuery.data}><div className="page-content management-page"><div className="management-hero"><div><span className="eyebrow">CANAIS DO WORKSPACE</span><h2>Seus números, <em>sempre por perto.</em></h2><p>Centralize as conversas de cada operação em um único lugar.</p></div><Button onClick={() => setNotice('A solicitação de conexão foi registrada.')} data-testid="button-connect-number"><Plus size={16} /> Conectar número</Button></div>{notice && <div className="toast-note" data-testid="text-number-notice"><Check size={15} /> {notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso" data-testid="button-close-notice"><X size={14} /></button></div>}<div className="number-grid">{numbersQuery.isLoading ? <LoadingRows count={3} /> : numbersQuery.isError ? <ErrorState onRetry={() => numbersQuery.refetch()} /> : numbers.length === 0 ? <EmptyState title="Nenhum número conectado" message="Conecte seu primeiro número para começar a atender." /> : numbers.map((number) => <NumberCard number={number} key={number.id} onAccess={() => setNotice(`Acesso de equipe atualizado para ${number.name}.`)} />)}</div><div className="info-banner"><div className="info-symbol"><Link2 size={18} /></div><div><b>Conexão oficial WhatsApp Business</b><p>Seus números são conectados pela API oficial da Meta. Mensagens, permissões e histórico ficam sob controle do workspace.</p></div><button className="text-button" onClick={() => setNotice('O guia de conexão será disponibilizado em breve.')} data-testid="button-learn-connection">Saiba como funciona <ArrowRight size={14} /></button></div></div></Shell>;
}

function NumberCard({ number, onAccess }: { number: WhatsappNumber; onAccess: () => void }) {
  return <article className="number-card animate-rise" data-testid={`card-number-${number.id}`}><div className="number-card-head"><div className="number-brand-icon"><Phone size={20} /></div><span className={`connection-badge ${number.status === 'connected' ? 'is-connected' : 'is-disconnected'}`}><span />{number.status === 'connected' ? 'Conectado' : 'Desconectado'}</span></div><h3>{number.name}</h3><p className="phone-display">{number.phoneNumber}</p><div className="number-stats"><span><b>{number.unreadCount}</b><small>não lidas</small></span><span><b>{number.teamCount}</b><small>pessoas com acesso</small></span></div><div className="number-card-actions"><Button variant="secondary" onClick={onAccess} data-testid={`button-manage-number-${number.id}`}><Users size={15} /> Gerenciar acesso</Button><button className="icon-btn" aria-label="Mais opções do número" data-testid={`button-number-options-${number.id}`}><MoreHorizontal size={17} /></button></div></article>;
}

function TeamPage() {
  const sessionQuery = useGetSession({ query: { queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const usersQuery = useListUsers({ query: { queryKey: getListUsersQueryKey(), refetchInterval: 30_000 } });
  const numbersQuery = useListWhatsappNumbers({ query: { queryKey: getListWhatsappNumbersQueryKey(), staleTime: 30_000 } });
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  if (sessionQuery.isLoading) return <AuthLoading />;
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  const users = (usersQuery.data ?? []).filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(filter.toLowerCase()));
  return <Shell session={sessionQuery.data}><div className="page-content management-page"><div className="management-hero"><div><span className="eyebrow">PESSOAS DO WORKSPACE</span><h2>Uma equipe que <em>se encontra.</em></h2><p>Presença, papéis e acesso — tudo visível para o time todo.</p></div><Button onClick={() => setNotice('O convite está disponível para configuração do administrador.')} data-testid="button-invite-user"><Plus size={16} /> Convidar pessoa</Button></div>{notice && <div className="toast-note"><Check size={15} /> {notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={14} /></button></div>}<div className="team-overview"><div><span className="overview-number">{users.filter((user) => user.online).length}</span><span><b>online agora</b><small>de {users.length} pessoas</small></span></div><div className="presence-bar"><span style={{ width: `${users.length ? (users.filter((user) => user.online).length / users.length) * 100 : 0}%` }} /></div><div className="team-filter"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar na equipe" data-testid="input-search-team" /></div></div><div className="team-table-wrap">{usersQuery.isLoading ? <LoadingRows count={4} /> : usersQuery.isError ? <ErrorState onRetry={() => usersQuery.refetch()} /> : users.length === 0 ? <EmptyState title="Pessoa não encontrada" message="Tente outro nome ou e-mail." /> : <table className="team-table"><thead><tr><th>Pessoa</th><th>Função</th><th>Presença</th><th>Números com acesso</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id} data-testid={`row-user-${user.id}`}><td><div className="table-user"><Avatar name={user.name} initials={user.initials} online={user.online} /><span><b>{user.name}</b><small>{user.email}</small></span></div></td><td><span className={`role-badge role-${user.role}`}>{user.role === 'super_admin' ? 'Administrador' : user.role === 'manager' ? 'Gestor' : 'Atendente'}</span></td><td><span className={`presence-text ${user.online ? 'online' : ''}`}><span />{user.online ? 'Disponível' : 'Ausente'}</span></td><td><div className="access-stack">{(numbersQuery.data ?? []).slice(0, user.role === 'agent' ? 1 : 3).map((number, index) => <span title={number.name} key={number.id} style={{ zIndex: 3 - index }}><Phone size={11} /></span>)}<small>{user.role === 'agent' ? '1 número' : `${numbersQuery.data?.length ?? 0} números`}</small></div></td><td><button className="icon-btn" aria-label={`Abrir ações de ${user.name}`} data-testid={`button-user-actions-${user.id}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>}</div></div></Shell>;
}

function SettingsPage() {
  const sessionQuery = useGetSession({ query: { queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const healthQuery = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30_000 } });
  const verifyParams = { 'hub.mode': 'subscribe', 'hub.verify_token': 'casa-norte-demo', 'hub.challenge': 'atendimento-check' };
  const verifyQuery = useVerifyWhatsappWebhook(verifyParams, { query: { enabled: false, queryKey: getVerifyWhatsappWebhookQueryKey(verifyParams) } });
  const receiveWebhook = useReceiveWhatsappWebhook();
  const [testStatus, setTestStatus] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Casa Norte');
  const [saved, setSaved] = useState(false);
  if (sessionQuery.isLoading) return <AuthLoading />;
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  const runWebhookTest = () => { setTestStatus('testing'); verifyQuery.refetch().then((result) => { if (result.isError) setTestStatus('error'); else { receiveWebhook.mutate({ data: { object: 'whatsapp_business_account', entry: [] } }, { onSuccess: () => setTestStatus('success'), onError: () => setTestStatus('error') }); } }); };
  return <Shell session={sessionQuery.data}><div className="page-content settings-page"><div className="settings-intro"><span className="eyebrow">PREFERÊNCIAS</span><h2>Configurações do <em>workspace.</em></h2><p>Pequenos ajustes para a operação continuar fluindo.</p></div><div className="settings-layout"><div className="settings-main"><section className="settings-section"><div className="section-heading"><div className="section-icon"><SlidersHorizontal size={17} /></div><div><h3>Identidade do workspace</h3><p>Como sua operação aparece para a equipe.</p></div></div><label className="setting-field">Nome do workspace<input value={workspaceName} onChange={(event) => { setWorkspaceName(event.target.value); setSaved(false); }} data-testid="input-workspace-name" /><small>Visível no seletor de workspace e nos convites.</small></label><div className="setting-actions"><Button variant="secondary" onClick={() => setSaved(true)} data-testid="button-save-settings">{saved ? <><Check size={15} /> Salvo</> : 'Salvar alterações'}</Button></div></section><section className="settings-section"><div className="section-heading"><div className="section-icon"><ShieldCheck size={17} /></div><div><h3>Webhook do WhatsApp</h3><p>Verifique a ponte antes de colocar uma nova operação no ar.</p></div><span className={`readiness ${testStatus === 'success' ? 'ready' : ''}`}><span />{testStatus === 'success' ? 'Pronto' : 'Aguardando teste'}</span></div><div className="webhook-url"><div><small>URL DE CALLBACK</small><code>/api/webhooks/whatsapp</code></div><button onClick={() => navigator.clipboard?.writeText('/api/webhooks/whatsapp')} aria-label="Copiar URL do webhook" data-testid="button-copy-webhook"><Copy size={15} /> Copiar</button></div><div className="webhook-checks"><span><Check size={14} /> Verificação Meta</span><span><Check size={14} /> Recebimento de eventos</span><span><Check size={14} /> Atualização em tempo real</span></div><Button variant="secondary" onClick={runWebhookTest} disabled={testStatus === 'testing'} data-testid="button-test-webhook"><Activity size={15} />{testStatus === 'testing' ? 'Verificando conexão...' : 'Testar conexão'}</Button>{testStatus === 'error' && <div className="inline-error" data-testid="text-webhook-error"><WifiOff size={14} /> Não foi possível concluir o teste agora.</div>}{testStatus === 'success' && <div className="inline-success" data-testid="text-webhook-success"><Check size={14} /> Webhook respondeu e recebeu um evento de teste.</div>}</section></div><aside className="settings-side"><div className="health-card"><div className="health-card-head"><span className="live-pulse" /><b>Sistema operacional</b><Wifi size={16} /></div><div className="health-big">{healthQuery.isLoading ? '...' : healthQuery.isError ? '—' : '100'}<small>%</small></div><p>Monitoramento da API em tempo real</p><div className="health-line"><span /><span /><span /><span /><span /><span /><span /></div><small>Última checagem: agora</small></div><div className="help-card"><CircleHelp size={18} /><div><b>Precisa de ajuda?</b><p>Veja os guias de conexão ou fale com o suporte da operação.</p><button className="text-button" onClick={() => setTestStatus('success')} data-testid="button-open-help">Abrir central de ajuda <ArrowRight size={14} /></button></div></div></aside></div></div></Shell>;
}

function NotFound() {
  return <div className="auth-screen"><div className="auth-card not-found"><BrandMark /><span className="eyebrow">404 / ROTA NÃO ENCONTRADA</span><h1>Esse caminho saiu da fila.</h1><p>Volte para a caixa de entrada e continue de onde parou.</p><Link href="/" className="btn btn-primary" data-testid="link-back-inbox"><ArrowLeft size={16} /> Voltar para a entrada</Link></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Inbox} /><Route path="/numbers" component={NumbersPage} /><Route path="/team" component={TeamPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;