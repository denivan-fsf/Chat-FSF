const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('fsf_access_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function applyBadge(count: number) {
  const badges = document.querySelectorAll<HTMLElement>('.nav-item .nav-count');
  badges.forEach((badge) => {
    const value = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
    badge.dataset.liveReady = '1';
    if (value <= 0) {
      badge.textContent = '';
      badge.hidden = true;
      badge.setAttribute('aria-hidden', 'true');
      return;
    }
    badge.hidden = false;
    badge.removeAttribute('aria-hidden');
    badge.textContent = String(value);
  });
}

function hideStaticBadge() {
  document.querySelectorAll<HTMLElement>('.nav-item .nav-count').forEach((badge) => {
    if (badge.dataset.liveReady !== '1') {
      badge.hidden = true;
      badge.setAttribute('aria-hidden', 'true');
    }
  });
}

async function refreshUnreadCount() {
  hideStaticBadge();
  const token = localStorage.getItem('fsf_access_token');
  if (!token) {
    applyBadge(0);
    return;
  }

  try {
    const response = await fetch(`${API}/api/conversations`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const conversations = await response.json();
    const totalUnread = Array.isArray(conversations)
      ? conversations.reduce((sum, conversation) => sum + Math.max(0, Number(conversation?.unreadCount || 0)), 0)
      : 0;
    applyBadge(totalUnread);
  } catch {
    // Mantém o badge oculto enquanto a contagem real não puder ser obtida.
    applyBadge(0);
  }
}

export function installInboxCounterEnhancement() {
  const style = document.createElement('style');
  style.id = 'fsf-inbox-counter-style';
  style.textContent = '.nav-count:not([data-live-ready="1"]) { display:none !important; }';
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  const observer = new MutationObserver(() => hideStaticBadge());
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'href'] });

  const run = () => void refreshUnreadCount();
  run();
  window.setInterval(run, 10000);
  window.addEventListener('focus', run);
  window.addEventListener('storage', run);
}
