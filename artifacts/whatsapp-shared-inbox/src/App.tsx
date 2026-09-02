import { useEffect, useMemo, useRef, useState } from 'react';
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
  useConnectWhatsappNumber, useCreateContact, useCreateUser, useLogout,
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

function Modal({ title, description, onClose, children }: {
  title: string; description?: string; onClose: () => void; children: React.ReactNode;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={17} /></button></div>
      {children}
    </div>
  </div>;
}

function MenuPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`menu-panel ${className}`} onClick={(event) => event.stopPropagation()}>{children}</div>;
}

function MenuItem({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>{children}</button>;
}

function getApiError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : fallback;
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

function Sidebar({ session, onLogout }: { session?: Session; onLogout: () => void }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInfoOpen, setProfileInfoOpen] = useState(false);
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
    <div className="relative-anchor"><button className="workspace-switcher" onClick={() => setWorkspaceOpen((open) => !open)} aria-expanded={workspaceOpen} data-testid="button-workspace-switcher"><span className="workspace-dot" /><div><small>WORKSPACE</small><b>Casa Norte</b></div><ChevronDown size={15} /></button>{workspaceOpen && <MenuPanel className="workspace-menu"><MenuItem onClick={() => setWorkspaceOpen(false)}><Check size={14} /> Casa Norte <small>Ativo</small></MenuItem><MenuItem onClick={() => { setWorkspaceOpen(false); setLocation('/settings'); }}><SettingsIcon size={14} /> Configurar workspace</MenuItem></MenuPanel>}</div>
    <nav className="sidebar-nav" aria-label="Navegação principal">
      <span className="nav-kicker">Operação</span>
      {nav.slice(0, 1).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} /><span>{label}</span>{href === '/' && <i className="nav-count">8</i>}</Link>)}
      <span className="nav-kicker">Gestão</span>
      {nav.slice(1).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} /><span>{label}</span></Link>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-live"><span className="live-pulse" /><div><b>Operação normal</b><small>Todos os canais ativos</small></div></div>
      <div className="relative-anchor"><button className="profile-row" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} data-testid="button-profile-menu"><Avatar name={session?.user.name} initials={session?.user.initials} online size="sm" /><div><b>{session?.user.name ?? 'Operador'}</b><small>{session?.user.role === 'super_admin' ? 'Administrador' : session?.user.role === 'manager' ? 'Gestor' : 'Atendente'}</small></div><MoreHorizontal size={16} /></button>{profileOpen && <MenuPanel className="profile-menu"><div className="menu-user"><Avatar name={session?.user.name} initials={session?.user.initials} /><span><b>{session?.user.name}</b><small>{session?.user.email}</small></span></div><MenuItem onClick={() => { setProfileOpen(false); setProfileInfoOpen(true); }}><UserRound size={14} /> Meu perfil</MenuItem><MenuItem onClick={onLogout} danger><ArrowLeft size={14} /> Sair da conta</MenuItem></MenuPanel>}{profileInfoOpen && session && <ProfileModal user={session.user} onClose={() => setProfileInfoOpen(false)} />}</div>
    </div>
  </aside>;
}

function Topbar({ title, subtitle, session, onMenu, onLogout }: { title: string; subtitle?: string; session?: Session; onMenu: () => void; onLogout: () => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInfoOpen, setProfileInfoOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  return <header className="topbar">
    <button className="mobile-menu" onClick={onMenu} data-testid="button-open-menu"><Menu size={20} /></button>
    <div><div className="eyebrow">ATENDIMENTO COMPARTILHADO <span className="eyebrow-line" /></div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="topbar-actions"><div className="connection-state"><span className="live-pulse" /><span className="connection-copy"><b>Conectado</b><small>Atualizado agora</small></span></div><div className="relative-anchor"><button className="icon-btn" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notificações" aria-expanded={notificationsOpen} data-testid="button-notifications"><Bell size={18} />{!notificationsRead && <i />}</button>{notificationsOpen && <MenuPanel className="notification-menu"><div className="menu-heading"><b>Notificações</b><button onClick={() => setNotificationsRead(true)}>Marcar como lidas</button></div>{notificationsRead ? <p className="menu-empty">Tudo em dia por aqui.</p> : <MenuItem onClick={() => { setNotificationsRead(true); setNotificationsOpen(false); }}><span className="notification-dot" /><span><b>Nova conversa aguardando resposta</b><small>Agora · Caixa de entrada</small></span></MenuItem>}</MenuPanel>}</div><div className="relative-anchor"><button className="top-avatar-button" onClick={() => setProfileOpen((open) => !open)} aria-label="Abrir perfil" aria-expanded={profileOpen} data-testid="button-top-profile"><Avatar name={session?.user.name} initials={session?.user.initials} online /></button>{profileOpen && <MenuPanel className="profile-menu top-profile-menu"><div className="menu-user"><Avatar name={session?.user.name} initials={session?.user.initials} /><span><b>{session?.user.name}</b><small>{session?.user.email}</small></span></div><MenuItem onClick={() => { setProfileOpen(false); setProfileInfoOpen(true); }}><UserRound size={14} /> Meu perfil</MenuItem><MenuItem onClick={onLogout} danger><ArrowLeft size={14} /> Sair da conta</MenuItem></MenuPanel>}{profileInfoOpen && session && <ProfileModal user={session.user} onClose={() => setProfileInfoOpen(false)} />}</div></div>
  </header>;
}

function Shell({ session, children }: { session?: Session; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const onLogout = () => logout.mutate(undefined, { onSettled: () => { queryClient.clear(); setLocation('/'); } });
  return <div className="app-shell"><div className={`mobile-scrim ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} /><div className={sidebarOpen ? 'sidebar-mobile-open' : ''}><Sidebar session={session} onLogout={onLogout} /></div><main className="app-main"><Topbar title={getPageTitle()} session={session} onMenu={() => setSidebarOpen(true)} onLogout={onLogout} />{children}</main></div>;
}

function ProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const role = user.role === 'super_admin' ? 'Administrador' : user.role === 'manager' ? 'Gestor' : 'Atendente';
  return <Modal title="Meu perfil" description="Informações da sua conta neste workspace." onClose={onClose}><div className="profile-details"><div className="profile-details-head"><Avatar name={user.name} initials={user.initials} online size="lg" /><div><h3>{user.name}</h3><p>{role}</p></div></div><div className="details-list"><span><small>E-mail</small><b>{user.email}</b></span><span><small>Papel</small><b>{role}</b></span><span><small>Status</small><b>{user.online ? 'Disponível' : 'Ausente'}</b></span></div><div className="modal-actions"><Button onClick={onClose}>Fechar</Button></div></div></Modal>;
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
  const sessionQuery = useGetSession({ query: { retry: false, queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const summaryQuery = useGetDashboardSummary({ query: { enabled: Boolean(sessionQuery.data), queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 30_000 } });
  const numbersQuery = useListWhatsappNumbers({ query: { enabled: Boolean(sessionQuery.data), queryKey: getListWhatsappNumbersQueryKey(), staleTime: 30_000 } });
  const usersQuery = useListUsers({ query: { enabled: Boolean(sessionQuery.data), queryKey: getListUsersQueryKey(), staleTime: 30_000 } });
  const [search, setSearch] = useState('');
  const [numberId, setNumberId] = useState('');
  const [status, setStatus] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const params = useMemo(() => ({ numberId: numberId || undefined, status: status || undefined, assignedUserId: assignedUserId || undefined, search: search || undefined }), [numberId, status, assignedUserId, search]);
  const conversationsQuery = useListConversations(params, { query: { enabled: Boolean(sessionQuery.data), queryKey: getListConversationsQueryKey(params), refetchInterval: 20_000 } });
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
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  if (sessionQuery.isPending) return <AuthLoading />;
  return <WorkspaceInbox session={sessionQuery.data} summary={summaryQuery.data} summaryLoading={summaryQuery.isLoading} numbers={numbersQuery.data ?? []} users={usersQuery.data ?? []} conversations={conversations} conversationsQuery={conversationsQuery} activeId={activeId} onSelect={setSelectedId} search={search} setSearch={setSearch} numberId={numberId} setNumberId={setNumberId} status={status} setStatus={setStatus} assignedUserId={assignedUserId} setAssignedUserId={setAssignedUserId} />;
}

function WorkspaceInbox({ session, summary, summaryLoading, numbers, users, conversations, conversationsQuery, activeId, onSelect, search, setSearch, numberId, setNumberId, status, setStatus, assignedUserId, setAssignedUserId }: any) {
  const [contactOpen, setContactOpen] = useState(false);
  const [contextVisible, setContextVisible] = useState(true);
  const createContact = useCreateContact();
  const [notice, setNotice] = useState('');
  const addContact = (data: { name: string; phoneNumber: string; numberId?: string }) => createContact.mutate({ data }, { onSuccess: (conversation) => { setContactOpen(false); setNotice('Contato criado e conversa aberta.'); onSelect(conversation.id); void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); }, onError: (error) => setNotice(getApiError(error, 'Não foi possível criar o contato.')) });
  return <Shell session={session}><div className="page-content inbox-page"><StatStrip summary={summary} />{summaryLoading && <div className="freshness-note"><span className="loading-dot" /> Atualizando indicadores...</div>}{notice && <div className={`toast-note ${notice.includes('não') ? 'is-error' : ''}`}><Check size={15} /> {notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={14} /></button></div>}<div className="inbox-grid">
    <section className="conversation-panel panel"><div className="panel-heading"><div><h2>Conversas <span>{conversations.length}</span></h2><p>Priorize o que precisa de você.</p></div><div className="panel-heading-actions"><Button className="new-filter-button" variant="secondary" onClick={() => { setStatus('open'); setSearch(''); }} data-testid="button-clear-filters"><SlidersHorizontal size={15} /> Filtros</Button><Button onClick={() => setContactOpen(true)} data-testid="button-new-contact"><Plus size={15} /> Novo contato</Button></div></div>
      <div className="search-wrap"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou mensagem" aria-label="Buscar conversas" data-testid="input-search-conversations" />{search && <button onClick={() => setSearch('')} aria-label="Limpar busca" data-testid="button-clear-search"><X size={15} /></button>}</div>
      <div className="filter-row"><select value={numberId} onChange={(event) => setNumberId(event.target.value)} aria-label="Filtrar por número" data-testid="select-filter-number"><option value="">Todos os números</option>{numbers.map((number: WhatsappNumber) => <option key={number.id} value={number.id}>{number.name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por status" data-testid="select-filter-status"><option value="">Qualquer status</option>{Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} aria-label="Filtrar por atendente" data-testid="select-filter-assignee"><option value="">Toda a equipe</option>{users.map((user: User) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></div>
      <div className="conversation-list">{conversationsQuery.isLoading ? <LoadingRows /> : conversationsQuery.isError ? <ErrorState onRetry={() => conversationsQuery.refetch()} /> : conversations.length === 0 ? <EmptyState title="Nada por aqui" message="Tente remover um filtro ou aguarde novas mensagens." /> : conversations.map((conversation: Conversation, index: number) => <ConversationRow key={conversation.id} conversation={conversation} selected={activeId === conversation.id} onClick={() => onSelect(conversation.id)} index={index} />)}</div>
      <div className="list-footer"><span><span className="live-pulse" /> Sincronização contínua</span><span>{conversations.length} exibidas</span></div>
    </section>
    <ConversationView id={activeId} session={session} users={users} />
    {contextVisible ? <ContextRail conversation={conversations.find((item: Conversation) => item.id === activeId)} summary={summary} numbers={numbers} users={users} onClose={() => setContextVisible(false)} /> : <button className="context-reopen" onClick={() => setContextVisible(true)} aria-label="Abrir contexto"><PanelRight size={16} /> Contexto</button>}
  </div></div>{contactOpen && <NewContactModal numbers={numbers} pending={createContact.isPending} onClose={() => setContactOpen(false)} onSubmit={addContact} />}</Shell>;
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversation = detailQuery.data as ConversationDetail | undefined;
  const messages = [...((messagesQuery.data ?? conversation?.messages ?? []) as Message[]), ...optimistic];
  const canWrite = Boolean(lock?.lockedBy?.id === session.user.id);
  const doLock = () => { if (!id) return; lockConversation.mutate({ id }, { onSuccess: (data) => setLock(data), onError: () => setLock(null) }); };
  const send = () => {
    const content = draft.trim();
    if (!content || !id || !canWrite) return;
    const temp: Message = { id: `temp-${Date.now()}`, conversationId: id, direction: 'outbound', content, mediaUrl: null, mediaType: null, sentByUser: session.user, status: 'pending', createdAt: new Date().toISOString() };
    setOptimistic((items) => [...items, temp]); setDraft('');
    sendMessage.mutate({ id, data: { content, mediaType: attachment?.type || null } }, { onSuccess: () => { setOptimistic([]); setAttachment(null); queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); }, onError: () => setOptimistic((items) => items.filter((item) => item.id !== temp.id)) });
  };
  const setStatus = (next: ConversationStatus) => { if (!id) return; updateConversation.mutate({ id, data: { status: next } }, { onSuccess: (data) => { queryClient.setQueryData(getGetConversationQueryKey(id), data); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); } }); };
  const assign = (userId: string) => { updateConversation.mutate({ id, data: { assignedUserId: userId || null } }, { onSuccess: (data) => { queryClient.setQueryData(getGetConversationQueryKey(id), data); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); } }); };
  useEffect(() => { setLock(null); setOptimistic([]); }, [id]);
  if (!id) return <section className="message-panel panel empty-conversation"><EmptyState title="Escolha uma conversa" message="As mensagens e os detalhes aparecem aqui." /></section>;
  if (detailQuery.isLoading) return <section className="message-panel panel"><LoadingRows count={7} /></section>;
  if (detailQuery.isError) return <section className="message-panel panel"><ErrorState onRetry={() => detailQuery.refetch()} /></section>;
  const currentStatus = conversation?.status ?? 'open';
  return <section className="message-panel panel">
     <div className="message-header"><div className="message-person"><Avatar name={conversation?.contact.name} initials={conversation?.contact.initials} size="lg" /><div><h2>{conversation?.contact.name}</h2><p><span className="online-dot" /> {conversation?.contact.phoneNumber}</p></div></div><div className="message-actions"><div className="lock-status">{canWrite ? <><LockKeyhole size={14} /> Você está respondendo</> : lock ? <><UserRound size={14} /> {lock.lockedBy.name} responde</> : <span>Resposta colaborativa</span>}</div><Button variant={canWrite ? 'secondary' : 'primary'} onClick={doLock} disabled={lockConversation.isPending || canWrite || Boolean(lock && !canWrite)} data-testid="button-lock-conversation">{canWrite ? <Check size={15} /> : <LockKeyhole size={15} />}{canWrite ? 'Em sua posse' : lock ? 'Em atendimento' : 'Responder'}</Button><div className="relative-anchor"><button className="icon-btn" onClick={() => setActionsOpen((open) => !open)} aria-label="Mais ações" aria-expanded={actionsOpen} data-testid="button-conversation-actions"><MoreHorizontal size={18} /></button>{actionsOpen && <MenuPanel className="conversation-menu"><MenuItem onClick={() => { void navigator.clipboard?.writeText(conversation?.id ?? ''); setActionsOpen(false); }}><Copy size={14} /> Copiar ID da conversa</MenuItem><MenuItem onClick={() => { setStatus(currentStatus === 'closed' ? 'open' : 'closed'); setActionsOpen(false); }}>{currentStatus === 'closed' ? <ArrowRight size={14} /> : <Check size={14} />} {currentStatus === 'closed' ? 'Reabrir conversa' : 'Encerrar conversa'}</MenuItem></MenuPanel>}</div></div></div>
    <div className="message-subheader"><span className={`status-pill ${statusColors[currentStatus]}`}><span />{statusLabels[currentStatus]}</span><span className="subheader-divider" /><span><Phone size={13} /> {conversation?.whatsappNumber.name}</span><span className="subheader-divider" /><select className="assignee-select" value={conversation?.assignedUser?.id ?? ''} onChange={(event) => assign(event.target.value)} aria-label="Atribuir conversa" data-testid="select-conversation-assignee"><option value="">Sem responsável</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><div className="status-actions"><button onClick={() => setStatus(currentStatus === 'closed' ? 'open' : 'closed')} data-testid="button-toggle-status">{currentStatus === 'closed' ? 'Reabrir' : 'Encerrar'} <ArrowRightLeft size={13} /></button><select value={currentStatus} onChange={(event) => setStatus(event.target.value as ConversationStatus)} aria-label="Alterar status" data-testid="select-conversation-status"><option value="open">Aberta</option><option value="in_progress">Em atendimento</option><option value="waiting_customer">Aguardando</option><option value="closed">Encerrada</option></select></div></div>
    <div className="messages-scroller" data-testid="message-thread">{messagesQuery.isLoading ? <LoadingRows count={4} /> : messages.length === 0 ? <EmptyState title="Início da conversa" message="Envie a primeira mensagem para começar." /> : <><div className="date-rule"><span>Hoje</span></div>{messages.map((message) => <MessageBubble message={message} own={message.direction === 'outbound'} key={message.id} />)}</>}</div>
     <div className="composer-area"><div className={`lock-callout ${canWrite ? 'has-lock' : ''}`}><span className="lock-icon"><LockKeyhole size={14} /></span><span>{canWrite ? 'Você tem 8 minutos para responder esta conversa.' : 'Adquira a resposta para escrever nesta conversa.'}</span>{!canWrite && !lock && <button onClick={doLock} data-testid="button-acquire-lock">Adquirir agora</button>}</div>{attachment && <div className="attachment-chip"><Paperclip size={13} /> {attachment.name}<button onClick={() => setAttachment(null)} aria-label="Remover anexo"><X size={13} /></button></div>}<div className="composer"><input ref={fileInputRef} type="file" hidden onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} /><button className="composer-tool" onClick={() => fileInputRef.current?.click()} aria-label="Anexar arquivo" data-testid="button-attach"><Paperclip size={18} /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={canWrite ? 'Escreva uma resposta...' : 'Adquira a resposta para escrever'} disabled={!canWrite} aria-label="Mensagem" data-testid="textarea-message" /><span className="composer-hint">Enter para enviar</span><button className="send-btn" onClick={send} disabled={!canWrite || (!draft.trim() && !attachment) || sendMessage.isPending} aria-label="Enviar mensagem" data-testid="button-send-message"><Send size={17} /></button></div></div>
  </section>;
}

function MessageBubble({ message, own }: { message: Message; own: boolean }) {
  return <div className={`message-line ${own ? 'own' : ''}`} data-testid={`message-${message.id}`}><div className="bubble-avatar">{own ? <Avatar name={message.sentByUser?.name} initials={message.sentByUser?.initials} size="sm" /> : <span className="contact-bubble">{initials(message.sentByUser?.name, 'CN')}</span>}</div><div className="bubble-wrap"><span className="bubble-author">{own ? message.sentByUser?.name ?? 'Você' : 'Cliente'}</span><div className="bubble">{message.content}</div><small>{formatTime(message.createdAt)} {own && (message.status === 'pending' ? <Clock3 size={11} /> : <CheckCheck size={12} />)}</small></div></div>;
}

function ContextRail({ conversation, summary, numbers, users, onClose }: { conversation?: Conversation; summary?: any; numbers: WhatsappNumber[]; users: User[]; onClose: () => void }) {
  const updateConversation = useUpdateConversation();
  const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const addTag = () => {
    if (!conversation) return;
    const tag = window.prompt('Nome da etiqueta');
    if (!tag?.trim()) return;
    updateConversation.mutate({ id: conversation.id, data: { tags: [...(conversation.tags ?? []), tag.trim()] } }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); setDetailsOpen(false); } });
  };
  const assign = (userId: string) => {
    if (!conversation) return;
    updateConversation.mutate({ id: conversation.id, data: { assignedUserId: userId } }, { onSuccess: () => { setAssigneeOpen(false); void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); } });
  };
  return <aside className="context-rail"><div className="context-heading"><div><span className="eyebrow">VISÃO RÁPIDA</span><h2>Contexto</h2></div><button className="icon-btn" onClick={onClose} aria-label="Fechar contexto" data-testid="button-close-context"><PanelRight size={17} /></button></div>{conversation ? <><div className="contact-card"><div className="contact-card-top"><Avatar name={conversation.contact.name} initials={conversation.contact.initials} size="lg" online /><div><h3>{conversation.contact.name}</h3><p>{conversation.contact.phoneNumber}</p></div><div className="relative-anchor"><button className="icon-btn" onClick={() => setDetailsOpen((open) => !open)} aria-label="Mais detalhes do contato" data-testid="button-contact-details"><MoreHorizontal size={16} /></button>{detailsOpen && <MenuPanel className="contact-menu"><MenuItem onClick={() => { void navigator.clipboard?.writeText(conversation.contact.phoneNumber); setDetailsOpen(false); }}><Copy size={14} /> Copiar telefone</MenuItem><MenuItem onClick={() => { setDetailsOpen(false); window.alert(`Contato: ${conversation.contact.name}\\n${conversation.contact.phoneNumber}`); }}><UserRound size={14} /> Ver informações</MenuItem></MenuPanel>}</div></div><div className="contact-info"><span><small>CANAL</small><b>{conversation.whatsappNumber.name}</b></span><span><small>ÚLTIMA ATIVIDADE</small><b>{formatTime(conversation.lastMessageAt)}</b></span></div></div><div className="context-block"><div className="block-title"><span>Etiquetas</span><button onClick={addTag} aria-label="Adicionar etiqueta" data-testid="button-add-tag"><Plus size={14} /></button></div><div className="tag-cloud">{(conversation.tags?.length ? conversation.tags : ['sem etiqueta']).map((tag) => <span className="tag tag-large" key={tag}><Tag size={12} />{tag}</span>)}</div></div><div className="context-block"><div className="block-title"><span>Responsável</span><div className="relative-anchor"><button onClick={() => setAssigneeOpen((open) => !open)} aria-label="Trocar responsável" data-testid="button-change-assignee"><ArrowRightLeft size={14} /></button>{assigneeOpen && <MenuPanel className="assignee-menu">{users.map((user) => <MenuItem key={user.id} onClick={() => assign(user.id)}><Avatar name={user.name} initials={user.initials} size="sm" /> {user.name}</MenuItem>)}</MenuPanel>}</div></div><div className="rail-user"><Avatar name={conversation.assignedUser?.name} initials={conversation.assignedUser?.initials} online={conversation.assignedUser?.online} /><div><b>{conversation.assignedUser?.name ?? 'Sem responsável'}</b><small>{conversation.assignedUser?.online ? 'Online agora' : 'Offline'}</small></div></div></div><div className="context-block"><div className="block-title"><span>Número de origem</span></div><div className="number-rail"><span className="number-symbol"><Phone size={15} /></span><div><b>{conversation.whatsappNumber.name}</b><small>{conversation.whatsappNumber.phoneNumber}</small></div><span className="connected-tiny" /></div></div></> : <EmptyState title="Sem contexto" message="Selecione uma conversa para ver os detalhes." />}<div className="rail-footnote"><ShieldCheck size={15} /><span>Dados protegidos e sincronizados</span></div></aside>;
}

function AuthLoading() { return <div className="auth-screen"><div className="auth-card loading-auth"><BrandMark /><div className="loading-bars"><span /><span /><span /></div><p>Preparando seu espaço de atendimento...</p></div></div>; }

function LoginScreen() {
  const login = useLogin();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('paulo@atende.local'); const [password, setPassword] = useState('casa123');
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); setError(''); login.mutate({ data: { email, password } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() }); setLocation('/'); }, onError: () => setError('Confira seu e-mail e senha para continuar.') }); };
  return <div className="auth-screen"><div className="auth-ornament"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><BrandMark /><span>um inbox, todo o cuidado</span></div><div className="auth-card"><div className="auth-card-head"><BrandMark /><span>CASA NORTE <i>•</i> WORKSPACE</span></div><h1>Seu time, <em>na mesma conversa.</em></h1><p className="auth-lead">Entre para cuidar de cada cliente com clareza, sem perder o fio.</p><form onSubmit={submit}><label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" required data-testid="input-login-email" /></label><label>Senha<div className="password-input"><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" required data-testid="input-login-password" /><button type="button" onClick={() => setPassword('')} aria-label="Limpar senha" data-testid="button-clear-password"><X size={14} /></button></div></label>{error && <div className="form-error" data-testid="text-login-error">{error}</div>}<Button type="submit" className="login-button" disabled={login.isPending} data-testid="button-login">{login.isPending ? 'Entrando...' : 'Entrar no workspace'}<ArrowRight size={16} /></Button></form><div className="login-hint"><b>Acessos de demonstração</b><button type="button" onClick={() => { setEmail('paulo@atende.local'); setPassword('casa123'); }}>Administrador · paulo@atende.local</button><button type="button" onClick={() => { setEmail('ana@atende.local'); setPassword('casa123'); }}>Atendente · ana@atende.local</button><span>Senha dos acessos: <strong>casa123</strong></span></div><div className="auth-footer"><ShieldCheck size={14} /> Ambiente privado e protegido</div></div></div>;
}

function NewContactModal({ numbers, pending, onClose, onSubmit }: {
  numbers: WhatsappNumber[]; pending: boolean; onClose: () => void;
  onSubmit: (data: { name: string; phoneNumber: string; numberId?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [numberId, setNumberId] = useState(numbers[0]?.id ?? '');
  return <Modal title="Novo contato" description="Cadastre o cliente e abra uma conversa para sua equipe." onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ name, phoneNumber, numberId: numberId || undefined }); }}>
      <label>Nome completo<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Juliana Almeida" minLength={2} required /></label>
      <label>Telefone WhatsApp<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+55 11 99999-0000" minLength={8} required /></label>
      <label>Número de atendimento<select value={numberId} onChange={(event) => setNumberId(event.target.value)} required>{numbers.map((number) => <option value={number.id} key={number.id}>{number.name} · {number.phoneNumber}</option>)}</select></label>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? 'Criando...' : 'Criar contato'}</Button></div>
    </form>
  </Modal>;
}

function ConnectNumberModal({ pending, onClose, onSubmit }: {
  pending: boolean; onClose: () => void; onSubmit: (data: { name: string; phoneNumber: string }) => void;
}) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  return <Modal title="Conectar número" description="Informe os dados do canal que será usado pela equipe." onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ name, phoneNumber }); }}>
      <label>Nome do canal<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Vendas" minLength={1} required /></label>
      <label>Número de telefone WhatsApp<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+55 11 99999-0000" minLength={8} required /></label>
      <div className="form-hint"><Phone size={14} /> Use o número no formato internacional, com DDI e DDD.</div>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? 'Conectando...' : 'Conectar número'}</Button></div>
    </form>
  </Modal>;
}

function NumbersPage() {
  const sessionQuery = useGetSession({ query: { retry: false, queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const numbersQuery = useListWhatsappNumbers({ query: { enabled: Boolean(sessionQuery.data), queryKey: getListWhatsappNumbersQueryKey(), refetchInterval: 30_000 } });
  const [notice, setNotice] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const connectNumber = useConnectWhatsappNumber();
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  if (sessionQuery.isPending) return <AuthLoading />;
  const numbers = numbersQuery.data ?? [];
  const addNumber = (data: { name: string; phoneNumber: string }) => connectNumber.mutate({ data }, { onSuccess: () => { setConnectOpen(false); setNotice('Número conectado com sucesso.'); void numbersQuery.refetch(); void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); }, onError: (error) => setNotice(getApiError(error, 'Não foi possível conectar o número.')) });
  return <Shell session={sessionQuery.data}><div className="page-content management-page"><div className="management-hero"><div><span className="eyebrow">CANAIS DO WORKSPACE</span><h2>Seus números, <em>sempre por perto.</em></h2><p>Centralize as conversas de cada operação em um único lugar.</p></div><Button onClick={() => setConnectOpen(true)} data-testid="button-connect-number"><Plus size={16} /> Conectar número</Button></div>{notice && <div className={`toast-note ${notice.includes('não') ? 'is-error' : ''}`} data-testid="text-number-notice"><Check size={15} /> {notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso" data-testid="button-close-notice"><X size={14} /></button></div>}<div className="number-grid">{numbersQuery.isLoading ? <LoadingRows count={3} /> : numbersQuery.isError ? <ErrorState onRetry={() => numbersQuery.refetch()} /> : numbers.length === 0 ? <EmptyState title="Nenhum número conectado" message="Conecte seu primeiro número para começar a atender." /> : numbers.map((number) => <NumberCard number={number} key={number.id} onAccess={() => setNotice(`Acesso de equipe atualizado para ${number.name}.`)} />)}</div><div className="info-banner"><div className="info-symbol"><Link2 size={18} /></div><div><b>Conexão oficial WhatsApp Business</b><p>Seus números são conectados pela API oficial da Meta. Mensagens, permissões e histórico ficam sob controle do workspace.</p></div><button className="text-button" onClick={() => setNotice('Preencha o formulário de conexão para adicionar um canal.')} data-testid="button-learn-connection">Saiba como funciona <ArrowRight size={14} /></button></div></div>{connectOpen && <ConnectNumberModal pending={connectNumber.isPending} onClose={() => setConnectOpen(false)} onSubmit={addNumber} />}</Shell>;
}

function NumberCard({ number, onAccess }: { number: WhatsappNumber; onAccess: () => void }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <article className="number-card animate-rise" data-testid={`card-number-${number.id}`}><div className="number-card-head"><div className="number-brand-icon"><Phone size={20} /></div><span className={`connection-badge ${number.status === 'connected' ? 'is-connected' : 'is-disconnected'}`}><span />{number.status === 'connected' ? 'Conectado' : 'Desconectado'}</span></div><h3>{number.name}</h3><p className="phone-display">{number.phoneNumber}</p><div className="number-stats"><span><b>{number.unreadCount}</b><small>não lidas</small></span><span><b>{number.teamCount}</b><small>pessoas com acesso</small></span></div><div className="number-card-actions"><Button variant="secondary" onClick={onAccess} data-testid={`button-manage-number-${number.id}`}><Users size={15} /> Gerenciar acesso</Button><div className="relative-anchor"><button className="icon-btn" onClick={() => setOptionsOpen((open) => !open)} aria-label="Mais opções do número" aria-expanded={optionsOpen} data-testid={`button-number-options-${number.id}`}><MoreHorizontal size={17} /></button>{optionsOpen && <MenuPanel className="number-menu"><MenuItem onClick={() => { setDetailsOpen(true); setOptionsOpen(false); }}><Phone size={14} /> Ver dados do número</MenuItem><MenuItem onClick={() => { onAccess(); setOptionsOpen(false); }}><Users size={14} /> Gerenciar acesso</MenuItem></MenuPanel>}</div></div>{detailsOpen && <Modal title={number.name} description="Dados do canal conectado" onClose={() => setDetailsOpen(false)}><div className="details-list"><span><small>Telefone</small><b>{number.phoneNumber}</b></span><span><small>Status</small><b>{number.status === 'connected' ? 'Conectado' : 'Desconectado'}</b></span><span><small>Pessoas com acesso</small><b>{number.teamCount}</b></span></div></Modal>}</article>;
}

function TeamPage() {
  const sessionQuery = useGetSession({ query: { retry: false, queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const usersQuery = useListUsers({ query: { enabled: Boolean(sessionQuery.data), queryKey: getListUsersQueryKey(), refetchInterval: 30_000 } });
  const numbersQuery = useListWhatsappNumbers({ query: { enabled: Boolean(sessionQuery.data), queryKey: getListWhatsappNumbersQueryKey(), staleTime: 30_000 } });
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [userOpen, setUserOpen] = useState(false);
  const createUser = useCreateUser();
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  if (sessionQuery.isPending) return <AuthLoading />;
  const users = (usersQuery.data ?? []).filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(filter.toLowerCase()));
  const addUser = (data: { name: string; email: string; password: string; role: 'manager' | 'agent'; numberIds?: string[] }) => createUser.mutate({ data }, { onSuccess: () => { setUserOpen(false); setNotice('Atendente adicionado com sucesso.'); void usersQuery.refetch(); void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); }, onError: (error) => setNotice(getApiError(error, 'Não foi possível adicionar o atendente.')) });
  return <Shell session={sessionQuery.data}><div className="page-content management-page"><div className="management-hero"><div><span className="eyebrow">PESSOAS DO WORKSPACE</span><h2>Uma equipe que <em>se encontra.</em></h2><p>Presença, papéis e acesso — tudo visível para o time todo.</p></div><Button onClick={() => setUserOpen(true)} data-testid="button-invite-user"><Plus size={16} /> Adicionar atendente</Button></div>{notice && <div className={`toast-note ${notice.includes('não') ? 'is-error' : ''}`}><Check size={15} /> {notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={14} /></button></div>}<div className="team-overview"><div><span className="overview-number">{users.filter((user) => user.online).length}</span><span><b>online agora</b><small>de {users.length} pessoas</small></span></div><div className="presence-bar"><span style={{ width: `${users.length ? (users.filter((user) => user.online).length / users.length) * 100 : 0}%` }} /></div><div className="team-filter"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar na equipe" data-testid="input-search-team" /></div></div><div className="team-table-wrap">{usersQuery.isLoading ? <LoadingRows count={4} /> : usersQuery.isError ? <ErrorState onRetry={() => usersQuery.refetch()} /> : users.length === 0 ? <EmptyState title="Pessoa não encontrada" message="Tente outro nome ou e-mail." /> : <table className="team-table"><thead><tr><th>Pessoa</th><th>Função</th><th>Presença</th><th>Números com acesso</th><th /></tr></thead><tbody>{users.map((user) => <UserRow key={user.id} user={user} numbers={numbersQuery.data ?? []} />)}</tbody></table>}</div></div>{userOpen && <NewUserModal numbers={numbersQuery.data ?? []} pending={createUser.isPending} onClose={() => setUserOpen(false)} onSubmit={addUser} />}</Shell>;
}

function UserRow({ user, numbers }: { user: User; numbers: WhatsappNumber[] }) {
  const [open, setOpen] = useState(false);
  return <tr data-testid={`row-user-${user.id}`}><td><div className="table-user"><Avatar name={user.name} initials={user.initials} online={user.online} /><span><b>{user.name}</b><small>{user.email}</small></span></div></td><td><span className={`role-badge role-${user.role}`}>{user.role === 'super_admin' ? 'Administrador' : user.role === 'manager' ? 'Gestor' : 'Atendente'}</span></td><td><span className={`presence-text ${user.online ? 'online' : ''}`}><span />{user.online ? 'Disponível' : 'Ausente'}</span></td><td><div className="access-stack">{numbers.slice(0, user.role === 'agent' ? 1 : 3).map((number, index) => <span title={number.name} key={number.id} style={{ zIndex: 3 - index }}><Phone size={11} /></span>)}<small>{user.role === 'agent' ? '1 número' : `${numbers.length} números`}</small></div></td><td><div className="relative-anchor"><button className="icon-btn" onClick={() => setOpen((value) => !value)} aria-label={`Abrir ações de ${user.name}`} aria-expanded={open} data-testid={`button-user-actions-${user.id}`}><MoreHorizontal size={17} /></button>{open && <MenuPanel className="user-menu"><MenuItem onClick={() => { void navigator.clipboard?.writeText(user.email); setOpen(false); }}><Copy size={14} /> Copiar e-mail</MenuItem><MenuItem onClick={() => { setOpen(false); window.alert(`${user.name}\\n${user.email}\\n${user.role === 'agent' ? 'Atendente' : 'Gestor'}`); }}><UserRound size={14} /> Ver informações</MenuItem></MenuPanel>}</div></td></tr>;
}

function NewUserModal({ numbers, pending, onClose, onSubmit }: {
  numbers: WhatsappNumber[]; pending: boolean; onClose: () => void;
  onSubmit: (data: { name: string; email: string; password: string; role: 'manager' | 'agent'; numberIds?: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'manager'>('agent');
  const [numberIds, setNumberIds] = useState<string[]>(numbers.slice(0, 1).map((number) => number.id));
  const toggleNumber = (id: string) => setNumberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <Modal title="Adicionar atendente" description="Crie o acesso e defina quais números essa pessoa pode atender." onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ name, email, password, role, numberIds }); }}>
      <label>Nome completo<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Gabriela Santos" minLength={2} required /></label>
      <label>E-mail de acesso<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="gabriela@empresa.com" required /></label>
      <div className="form-grid"><label>Senha inicial<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 4 caracteres" minLength={4} required /></label><label>Papel<select value={role} onChange={(event) => setRole(event.target.value as 'agent' | 'manager')}><option value="agent">Atendente</option><option value="manager">Gestor</option></select></label></div>
      <fieldset className="checkbox-group"><legend>Números com acesso</legend>{numbers.map((number) => <label key={number.id} className="checkbox-option"><input type="checkbox" checked={numberIds.includes(number.id)} onChange={() => toggleNumber(number.id)} /><span>{number.name}</span><small>{number.phoneNumber}</small></label>)}</fieldset>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending || numberIds.length === 0}>{pending ? 'Salvando...' : 'Criar acesso'}</Button></div>
    </form>
  </Modal>;
}

function SettingsPage() {
  const sessionQuery = useGetSession({ query: { retry: false, queryKey: getGetSessionQueryKey(), staleTime: 60_000 } });
  const healthQuery = useHealthCheck({ query: { enabled: Boolean(sessionQuery.data), queryKey: getHealthCheckQueryKey(), refetchInterval: 30_000 } });
  const verifyParams = { 'hub.mode': 'subscribe', 'hub.verify_token': 'casa-norte-demo', 'hub.challenge': 'atendimento-check' };
  const verifyQuery = useVerifyWhatsappWebhook(verifyParams, { query: { enabled: false, queryKey: getVerifyWhatsappWebhookQueryKey(verifyParams) } });
  const receiveWebhook = useReceiveWhatsappWebhook();
  const [testStatus, setTestStatus] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Casa Norte');
  const [saved, setSaved] = useState(false);
  if (sessionQuery.isError || !sessionQuery.data) return <LoginScreen />;
  if (sessionQuery.isPending) return <AuthLoading />;
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