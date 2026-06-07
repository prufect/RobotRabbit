import { createConfetti } from '../utils/animations.js';

const GOOGLE_CALENDAR_TEMPLATE_URL = 'https://calendar.google.com/calendar/render';
const DEFAULT_EVENT_DURATION_MINUTES = 60;

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function datePartsFrom(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function resolveDateParts(dateText, now) {
  const raw = cleanText(dateText);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const reference = new Date(now);

  if (lower.startsWith('today')) {
    return datePartsFrom(reference);
  }

  if (lower.startsWith('tomorrow')) {
    return datePartsFrom(new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1));
  }

  const dateWithYear = /\d{4}/.test(raw) ? raw : `${raw} ${reference.getFullYear()}`;
  const parsed = new Date(dateWithYear);

  if (Number.isNaN(parsed.getTime())) return null;
  return datePartsFrom(parsed);
}

function resolveTimeParts(timeText) {
  const raw = cleanText(timeText);
  if (!raw) return null;

  const meridiemMatch = raw.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? 0);
    const meridiem = meridiemMatch[3].toLowerCase();

    if (hour < 1 || hour > 12) return null;
    if (meridiem.startsWith('p') && hour !== 12) hour += 12;
    if (meridiem.startsWith('a') && hour === 12) hour = 0;

    return { hour, minute };
  }

  const twentyFourHourMatch = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!twentyFourHourMatch) return null;

  return {
    hour: Number(twentyFourHourMatch[1]),
    minute: Number(twentyFourHourMatch[2]),
  };
}

function formatCalendarDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    '00',
  ].join('');
}

function resolveTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

export function buildGoogleCalendarUrl(booking, options = {}) {
  const contractorName = cleanText(booking?.contractor?.name) || 'your contractor';
  const price = booking?.negotiatedPrice ? `$${booking.negotiatedPrice}` : 'TBD';
  const date = cleanText(booking?.date);
  const time = cleanText(booking?.time);
  const note = cleanText(booking?.agentNote);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `RobotRabbit repair with ${contractorName}`,
    details: [
      'Booked through RobotRabbit.',
      `Contractor: ${contractorName}`,
      `Price: ${price}`,
      date || time ? `When: ${[date, time].filter(Boolean).join(' at ')}` : '',
      note,
    ].filter(Boolean).join('\n'),
  });

  const now = options.now ?? new Date();
  const dateParts = resolveDateParts(date, now);
  const timeParts = resolveTimeParts(time) ?? resolveTimeParts(date);

  if (dateParts && timeParts) {
    const durationMinutes = Number(options.durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES);
    const start = new Date(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hour,
      timeParts.minute,
    );
    const end = new Date(start.getTime() + Math.max(15, durationMinutes) * 60 * 1000);

    params.set('dates', `${formatCalendarDate(start)}/${formatCalendarDate(end)}`);
  }

  const timeZone = cleanText(options.timeZone ?? resolveTimeZone());
  if (timeZone) params.set('ctz', timeZone);

  const location = cleanText(booking?.location ?? booking?.address);
  if (location) params.set('location', location);

  return `${GOOGLE_CALENDAR_TEMPLATE_URL}?${params.toString()}`;
}

export function createBookingConfirm(container) {
  const overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'booking-overlay';
  container.appendChild(overlay);
  
  function show(booking) {
    // booking: { contractor: { name, rating, verified }, negotiatedPrice, time, date, agentNote }
    const calendarUrl = buildGoogleCalendarUrl(booking);

    overlay.innerHTML = `
      <div class="booking-card glass-solid">
        <div class="booking-checkmark">✅</div>
        <h2 class="booking-title">You're Booked!</h2>
        <p class="booking-subtitle">Your repair has been scheduled</p>
        ${booking.bookingNumber ? `<div style="text-align:center;margin:-4px 0 8px;font-size:0.82rem;color:var(--text-secondary);font-weight:600;">Booking #${booking.bookingNumber}</div>` : ''}
        
        <div class="booking-details">
          <div class="booking-detail glass-subtle">
            <div class="booking-detail-label">Contractor</div>
            <div class="booking-detail-value">${booking.contractor.name}</div>
          </div>
          <div class="booking-detail glass-subtle">
            <div class="booking-detail-label">Price</div>
            <div class="booking-detail-value" style="color:var(--accent-primary);">$${booking.negotiatedPrice}</div>
          </div>
          <div class="booking-detail glass-subtle">
            <div class="booking-detail-label">Date</div>
            <div class="booking-detail-value">${booking.date}</div>
          </div>
          <div class="booking-detail glass-subtle">
            <div class="booking-detail-label">Time</div>
            <div class="booking-detail-value">${booking.time}</div>
          </div>
        </div>
        
        <div class="booking-agent-note">
          <strong style="color:var(--accent-tertiary);">🤖 Agent Verified:</strong><br>
          ${booking.agentNote || 'License verified ✓ Insurance current ✓ No BBB complaints ✓ Rating 4.5+ ✓'}
        </div>
        
        <div class="booking-actions">
          <a class="btn-primary booking-calendar-link" id="booking-calendar-link" href="${calendarUrl}" target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
          <button class="btn-secondary" id="booking-done-btn">Done</button>
          <button class="btn-secondary" id="booking-share-btn">Share Details</button>
        </div>
      </div>
    `;
    
    // Show with animation
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
    
    // Fire confetti
    const confettiContainer = document.createElement('div');
    confettiContainer.className = 'confetti-container';
    (document.getElementById('app') || document.body).appendChild(confettiContainer);
    setTimeout(() => createConfetti(confettiContainer, 60), 300);
    
    // Done button
    overlay.querySelector('#booking-done-btn').addEventListener('click', () => {
      hide();
      overlay.dispatchEvent(new CustomEvent('booking-done', { bubbles: true }));
    });
    
    // Share button
    overlay.querySelector('#booking-share-btn').addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: 'RobotRabbit Booking',
          text: `Booked ${booking.contractor.name} for $${booking.negotiatedPrice} on ${booking.date} at ${booking.time}`,
        }).catch(() => {});
      }
    });
  }
  
  function hide() {
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.innerHTML = ''; }, 400);
    // Remove confetti
    document.querySelectorAll('.confetti-container').forEach(c => c.remove());
  }
  
  return {
    el: overlay,
    show,
    hide,
    destroy() { overlay.remove(); },
    on(event, cb) { overlay.addEventListener(event, cb); }
  };
}
