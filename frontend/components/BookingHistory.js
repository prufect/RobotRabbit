/**
 * Booking History tab — shows Upcoming, Past, and Cancelled bookings.
 * Appears when the Bookings tab is selected in the bottom nav.
 */
export function createBookingHistory({ getBookings, cancelBooking, rescheduleBooking }) {
  const el = document.createElement('div');
  el.className = 'booking-history';
  el.id = 'booking-history';

  let currentFilter = 'upcoming';
  let bookings = [];

  const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  const statusConfig = {
    upcoming: { label: 'Upcoming', color: '#059669', bg: 'rgba(16,185,129,0.1)' },
    completed: { label: 'Completed', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
    cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    rescheduled: { label: 'Rescheduled', color: '#d97706', bg: 'rgba(245,158,11,0.1)' },
  };

  function render() {
    const filtered = bookings.filter(b => {
      if (currentFilter === 'upcoming') return b.status === 'upcoming';
      if (currentFilter === 'past') return b.status === 'completed' || b.status === 'rescheduled';
      if (currentFilter === 'cancelled') return b.status === 'cancelled';
      return true;
    });

    el.innerHTML = `
      <div class="bh-header">
        <h2 class="bh-title">My Bookings</h2>
      </div>
      <div class="bh-filters">
        ${['upcoming', 'past', 'cancelled'].map(f => `
          <button class="bh-filter-pill${f === currentFilter ? ' active' : ''}" data-filter="${f}">
            ${f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        `).join('')}
      </div>
      <div class="bh-list">
        ${filtered.length === 0 ? `
          <div class="bh-empty">
            <div style="font-size:2rem;margin-bottom:8px;">📋</div>
            <div>No ${currentFilter} bookings</div>
            <span>Completed bookings will appear here</span>
          </div>
        ` : filtered.map(b => {
          const sc = statusConfig[b.status] ?? statusConfig.upcoming;
          return `
            <div class="bh-card glass" data-booking-id="${b.id}">
              <div class="bh-card-top">
                <div class="bh-card-info">
                  <div class="bh-card-number" style="color:var(--text-muted);font-size:0.72rem;font-weight:600;">${esc(b.booking_number)}</div>
                  <div class="bh-card-name">${esc(b.contractor_name)}</div>
                  ${b.category ? `<div class="bh-card-category">${esc(b.category)}</div>` : ''}
                </div>
                <span class="bh-status-badge" style="background:${sc.bg};color:${sc.color};">${sc.label}</span>
              </div>
              <div class="bh-card-details">
                <div class="bh-card-detail"><span>📅</span> ${esc(b.scheduled_date)}</div>
                <div class="bh-card-detail"><span>🕐</span> ${esc(b.scheduled_time)}</div>
                ${b.price ? `<div class="bh-card-detail"><span>💰</span> $${Number(b.price).toFixed(0)}</div>` : ''}
              </div>
              ${b.status === 'upcoming' ? `
                <div class="bh-card-actions">
                  <button class="bh-action-btn bh-cancel-btn" data-action="cancel" data-id="${b.id}">Cancel</button>
                  <button class="bh-action-btn bh-reschedule-btn" data-action="reschedule" data-id="${b.id}">Reschedule</button>
                </div>
              ` : ''}
              ${b.status === 'cancelled' && b.cancel_reason ? `
                <div class="bh-card-reason">Reason: ${esc(b.cancel_reason)}</div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Filter pill clicks
    el.querySelectorAll('.bh-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        currentFilter = pill.dataset.filter;
        render();
      });
    });

    // Cancel button clicks
    el.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reason = prompt('Reason for cancellation (optional):') ?? '';
        btn.disabled = true;
        btn.textContent = 'Cancelling...';
        try {
          await cancelBooking(btn.dataset.id, reason);
          await refresh();
        } catch (err) {
          alert(err.message || 'Failed to cancel');
          btn.disabled = false;
          btn.textContent = 'Cancel';
        }
      });
    });

    // Reschedule button clicks
    el.querySelectorAll('[data-action="reschedule"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newDate = prompt('New date (e.g., Tomorrow, Jun 10):');
        if (!newDate) return;
        const newTime = prompt('New time (e.g., 2:00 PM):');
        if (!newTime) return;
        btn.disabled = true;
        btn.textContent = 'Rescheduling...';
        try {
          await rescheduleBooking(btn.dataset.id, newDate, newTime, 'User rescheduled');
          await refresh();
        } catch (err) {
          alert(err.message || 'Failed to reschedule');
          btn.disabled = false;
          btn.textContent = 'Reschedule';
        }
      });
    });
  }

  async function refresh() {
    try {
      bookings = (await getBookings()) || [];
    } catch { bookings = []; }
    render();
  }

  // Initial render with empty state
  render();

  return { el, refresh };
}
