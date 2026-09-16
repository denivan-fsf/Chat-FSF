const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('fsf_access_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function findBadges() {
  return document.querySelectorAll<HTMLElement>('.nav-item[href="/"] .nav-count, .nav-item .nav-count');
}

function hideStaticBadges() {
  findBadges().forEach((badge) => {
    if (badge.dataset.unreadReady !== '1') {
      badge.style.display = 'none';
    }
  });
}

function applyUnread(unread: number) {
  const safeUnread = Math.max(0, Math.floor(Number(unread) || 0));
  findBadges().forEach((badge) => {
    badge.dataset.unreadReady = '1';
    badge.textContent = safeUnread > 99 ? '99+' : String(safeUnread);
    badge.style.display = safeUnread > 0 ? 'inline-flex' : 'none';
    badge.setAttribute('aria-label', `${safeUnread} mensagens não lidas`);
    badge.title = safeUnread === 1 ? '1 mensagem não lida' : `${safeUnread} mensagens não lidas`;
  });
}

async function refreshUnreadCount() {
  hideStaticBadges();
  const token = localStorage.getItem('fsf_access_token');
  if (!token) {
    applyUnread(0);
    return;
  }

  try {
    const response = await fetch(`${API}/api/conversations`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!response.ok) return;

    const conversations = await response.json();
    const unread = Array.isArray(conversations)
      ? conversations.reduce((total, conversation) => total + Math.max(0, Number(conversation?.unreadCount ?? 0)), 0)
      : 0;

    applyUnread(unread);
  } catch {
    // Mantém o último valor confirmado quando a API estiver temporariamente indisponível.
  }
}

export function installUnreadCountEnhancement() {
  const styleId = 'fsf-unread-count-boot-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '.nav-count:not([data-unread-ready="1"]) { display:none !important; }';
    document.head.appendChild(style);
  }

  const observer = new MutationObserver(() => hideStaticBadges());
  observer.observe(document.body, { childList: true, subtree: true });

  const run = () => void refreshUnreadCount();
  run();
  window.setInterval(run, 5000);
  window.addEventListener('focus', run);
  window.addEventListener('storage', run);
}
