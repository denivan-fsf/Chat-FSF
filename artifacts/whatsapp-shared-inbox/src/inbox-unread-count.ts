const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function refreshUnreadCount() {
  const badge = document.querySelector('.nav-item[href="/"] .nav-count') as HTMLElement | null;
  if (!badge) return;

  try {
    const token = localStorage.getItem('fsf_access_token');
    const response = await fetch(`${API}/api/conversations`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return;

    const conversations = await response.json();
    const unread = Array.isArray(conversations)
      ? conversations.reduce((total, conversation) => total + Number(conversation?.unreadCount ?? 0), 0)
      : 0;

    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    badge.setAttribute('aria-label', `${unread} mensagens não lidas`);
    badge.title = unread === 1 ? '1 mensagem não lida' : `${unread} mensagens não lidas`;
  } catch {
    // Mantém o último valor quando a API estiver temporariamente indisponível.
  }
}

export function installUnreadCountEnhancement() {
  const start = () => {
    void refreshUnreadCount();
    window.setInterval(() => void refreshUnreadCount(), 5000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
