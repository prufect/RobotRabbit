/**
 * Bottom navigation bar with 3 tabs: Chat, Bookings, Messages.
 * iOS-style frosted glass tab bar fixed at the bottom of the app.
 */
export function createBottomNav({ onTabChange }) {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav glass-solid';
  nav.id = 'bottom-nav';

  const tabs = [
    { id: 'chat', label: 'Chat', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>` },
    { id: 'bookings', label: 'Bookings', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>` },
    { id: 'messages', label: 'Messages', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>` },
  ];

  let activeTab = 'chat';

  function render() {
    nav.innerHTML = tabs.map(t => `
      <button class="bottom-nav-tab${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}" type="button">
        <span class="bottom-nav-icon">${t.icon}</span>
        <span class="bottom-nav-label">${t.label}</span>
        <span class="bottom-nav-badge" data-badge="${t.id}" hidden></span>
      </button>
    `).join('');

    nav.querySelectorAll('.bottom-nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        if (tabId === activeTab) return;
        activeTab = tabId;
        render();
        onTabChange(tabId);
      });
    });
  }

  function setActiveTab(tabId) {
    if (activeTab === tabId) return;
    activeTab = tabId;
    render();
  }

  function setBadge(tabId, count) {
    const badge = nav.querySelector(`[data-badge="${tabId}"]`);
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = !count || count <= 0;
  }

  render();
  return { el: nav, setActiveTab, setBadge };
}
