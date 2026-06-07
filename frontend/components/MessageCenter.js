/**
 * Message Center panel — shows the live agent ↔ service-provider conversations
 * across ALL repair requests. Slide-over from the right, polls while open,
 * with a header toggle button that surfaces an unread-style count.
 *
 * Conversations are deduplicated by contractor — if the same contractor is
 * contacted across multiple repair requests, all messages appear in one thread.
 *
 * Usage:
 *   const mc = createMessageCenter({ getConversations, getConversationMessages });
 *   headerEl.appendChild(mc.button);   // the toggle chip
 */
export function createMessageCenter({ getConversations, getConversationMessages }) {
  // --- Toggle button (lives in the header) ---
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mc-toggle';
  button.title = 'Message Center — agent ↔ contractors';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
    </svg>
    <span>Messages</span>
    <span class="mc-badge" hidden>0</span>
  `;
  const badge = button.querySelector('.mc-badge');

  // --- Slide-over panel (lives on body) ---
  const overlay = document.createElement('div');
  overlay.className = 'mc-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="mc-panel glass-solid">
      <div class="mc-head">
        <button class="mc-back" type="button" aria-label="Back" hidden>←</button>
        <div class="mc-title">
          <strong>Message Center</strong>
          <span class="mc-sub">Agent ↔ Service Providers</span>
        </div>
        <button class="mc-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="mc-body"></div>
    </div>
  `;
  (document.getElementById('app') || document.body).appendChild(overlay);

  const panel = overlay.querySelector('.mc-panel');
  const backBtn = overlay.querySelector('.mc-back');
  const closeBtn = overlay.querySelector('.mc-close');
  const body = overlay.querySelector('.mc-body');

  let convs = [];
  let activeConvId = null;   // conversation ID for thread view
  let activePhone = null;    // fallback key for legacy convs without conversationId
  let pollTimer = null;

  const esc = (s) => (s ?? '').toString().replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const fmt = (s) => esc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

  const statusConfig = {
    active: { label: 'Negotiating', cls: 'mc-status-active', icon: '🟡' },
    pending_approval: { label: 'Quote Ready', cls: 'mc-status-pending', icon: '🟠' },
    booked: { label: 'Booked', cls: 'mc-status-booked', icon: '✅' },
    cancelled: { label: 'Cancelled', cls: 'mc-status-cancelled', icon: '❌' },
  };
  function statusBadge(negotiationStatus) {
    const s = statusConfig[negotiationStatus] ?? statusConfig.active;
    return `<span class="mc-status-badge ${s.cls}">${s.icon} ${s.label}</span>`;
  }

  function convKey(c) {
    return c.conversationId ?? c.phone ?? c.name;
  }

  function renderList() {
    backBtn.hidden = true;
    if (!convs.length) {
      body.innerHTML = `<div class="mc-empty">No contractor messages yet.<br><span>They'll appear here once the agent reaches out.</span></div>`;
      return;
    }
    body.innerHTML = `<div class="mc-list">${convs.map((c) => `
      <button class="mc-conv${(c.unreadCount ?? 0) > 0 ? ' mc-conv-unread' : ''}" data-conv-id="${esc(convKey(c))}">
        <div class="mc-conv-top">
          <span class="mc-name">${esc(c.name || c.phone)}</span>
          ${statusBadge(c.negotiationStatus)}
          <span class="mc-time">${time(c.lastMessageAt)}</span>
        </div>
        <div class="mc-preview">${esc(c.lastMessage || '')}</div>
        <div class="mc-meta-row">
          <span class="mc-meta">${c.messageCount} msg${c.messageCount !== 1 ? 's' : ''}</span>
          ${(c.unreadCount ?? 0) > 0 ? `<span class="mc-unread-dot">${c.unreadCount}</span>` : ''}
        </div>
      </button>`).join('')}</div>`;
    body.querySelectorAll('.mc-conv').forEach((el) =>
      el.addEventListener('click', () => {
        const key = el.dataset.convId;
        const match = convs.find((c) => convKey(c) === key);
        activeConvId = match?.conversationId ?? null;
        activePhone = match?.phone ?? key;
        renderThread();
      })
    );
  }

  function renderThread() {
    const c = convs.find((x) =>
      (activeConvId && x.conversationId === activeConvId) ||
      (!activeConvId && x.phone === activePhone)
    );
    if (!c) return renderList();
    backBtn.hidden = false;

    // Group messages by request_id to show context separators
    let lastRequestId = null;
    const messagesHtml = c.messages.map((m) => {
      let separator = '';
      if (m.requestId && m.requestId !== lastRequestId && lastRequestId !== null) {
        separator = `<div class="mc-request-divider"><span>New repair request · ${date(m.at)}</span></div>`;
      }
      lastRequestId = m.requestId || lastRequestId;

      return `${separator}
        <div class="mc-row ${m.direction}">
          <div class="mc-bubble">
            <span class="mc-kind">${esc(m.kind)}${m.channel ? ' · ' + esc(m.channel) : ''}</span>
            <div class="mc-text">${fmt(m.body)}</div>
            <span class="mc-ts">${time(m.at)}</span>
          </div>
        </div>`;
    }).join('');

    body.innerHTML = `
      <div class="mc-thread-head">
        <strong>${esc(c.name || c.phone)}</strong>
        <span>${esc(c.phone ?? '')}${c.contractorId ? ' · Linked' : ''}</span>
      </div>
      <div class="mc-bubbles">${messagesHtml}</div>`;
    const bubbles = body.querySelector('.mc-bubbles');
    if (bubbles) bubbles.scrollTop = bubbles.scrollHeight;
  }

  function render() {
    if (activeConvId || activePhone) {
      const match = convs.some((c) =>
        (activeConvId && c.conversationId === activeConvId) ||
        (!activeConvId && c.phone === activePhone)
      );
      if (match) return renderThread();
    }
    activeConvId = null;
    activePhone = null;
    renderList();
  }

  function updateBadge() {
    const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    const n = totalUnread > 0 ? totalUnread : convs.length;
    badge.textContent = String(n);
    badge.hidden = n === 0;
    // Use different style for unread vs total count
    badge.classList.toggle('mc-badge-unread', totalUnread > 0);
  }

  async function refresh() {
    try {
      convs = (await getConversations()) || [];
    } catch {
      convs = [];
    }
    updateBadge();
    if (!overlay.hidden) render();
  }

  function startPolling(intervalMs) {
    stopPolling();
    refresh();
    pollTimer = setInterval(refresh, intervalMs);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function open() {
    overlay.hidden = false;
    requestAnimationFrame(() => panel.classList.add('mc-open'));
    startPolling(2500); // snappy while viewing
  }
  function close() {
    panel.classList.remove('mc-open');
    setTimeout(() => { overlay.hidden = true; }, 250);
    startPolling(8000); // keep the badge fresh in the background
  }
  function toggle() { (overlay.hidden ? open : close)(); }

  button.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  backBtn.addEventListener('click', () => { activeConvId = null; activePhone = null; renderList(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Background polling for the badge from the start.
  startPolling(8000);

  return { button, open, close, toggle, refresh };
}
