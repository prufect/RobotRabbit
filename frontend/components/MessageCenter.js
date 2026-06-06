/**
 * Message Center panel — shows the live agent <-> service-provider conversations
 * for the active repair request. Slide-over from the right, polls while open,
 * with a header toggle button that surfaces an unread-style count.
 *
 * Usage:
 *   const mc = createMessageCenter({ getConversations });
 *   headerEl.appendChild(mc.button);   // the toggle chip
 */
export function createMessageCenter({ getConversations }) {
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
  let activePhone = null;
  let pollTimer = null;

  const esc = (s) => (s ?? '').toString().replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const fmt = (s) => esc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  function renderList() {
    backBtn.hidden = true;
    if (!convs.length) {
      body.innerHTML = `<div class="mc-empty">No contractor messages yet.<br><span>They'll appear here once the agent reaches out.</span></div>`;
      return;
    }
    body.innerHTML = `<div class="mc-list">${convs.map((c) => `
      <button class="mc-conv" data-phone="${esc(c.phone)}">
        <div class="mc-conv-top">
          <span class="mc-name">${esc(c.name || c.phone)}</span>
          <span class="mc-time">${time(c.lastMessageAt)}</span>
        </div>
        <div class="mc-preview">${esc(c.lastMessage || '')}</div>
        <div class="mc-meta">${esc(c.phone)} · ${c.messageCount} msg</div>
      </button>`).join('')}</div>`;
    body.querySelectorAll('.mc-conv').forEach((el) =>
      el.addEventListener('click', () => { activePhone = el.dataset.phone; renderThread(); })
    );
  }

  function renderThread() {
    const c = convs.find((x) => x.phone === activePhone);
    if (!c) return renderList();
    backBtn.hidden = false;
    body.innerHTML = `
      <div class="mc-thread-head">
        <strong>${esc(c.name || c.phone)}</strong>
        <span>${esc(c.phone)}</span>
      </div>
      <div class="mc-bubbles">${c.messages.map((m) => `
        <div class="mc-row ${m.direction}">
          <div class="mc-bubble">
            <span class="mc-kind">${esc(m.kind)} · ${esc(m.channel)}</span>
            <div class="mc-text">${fmt(m.body)}</div>
            <span class="mc-ts">${time(m.at)}</span>
          </div>
        </div>`).join('')}</div>`;
    const bubbles = body.querySelector('.mc-bubbles');
    if (bubbles) bubbles.scrollTop = bubbles.scrollHeight;
  }

  function render() {
    if (activePhone && convs.some((c) => c.phone === activePhone)) renderThread();
    else { activePhone = null; renderList(); }
  }

  function updateBadge() {
    const n = convs.length;
    badge.textContent = String(n);
    badge.hidden = n === 0;
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
  backBtn.addEventListener('click', () => { activePhone = null; renderList(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Background polling for the badge from the start.
  startPolling(8000);

  return { button, open, close, toggle, refresh };
}
