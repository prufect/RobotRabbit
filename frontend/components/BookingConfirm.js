import { createConfetti } from '../utils/animations.js';

export function createBookingConfirm(container) {
  const overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'booking-overlay';
  container.appendChild(overlay);
  
  function show(booking) {
    // booking: { contractor: { name, rating, verified }, negotiatedPrice, time, date, agentNote }
    overlay.innerHTML = `
      <div class="booking-card glass-solid">
        <div class="booking-checkmark">✅</div>
        <h2 class="booking-title">You're Booked!</h2>
        <p class="booking-subtitle">Your repair has been scheduled</p>
        
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
        
        <button class="btn-primary" id="booking-done-btn">Done</button>
        <button class="btn-secondary" id="booking-share-btn" style="margin-top:12px;">Share Details</button>
      </div>
    `;
    
    // Show with animation
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
    
    // Fire confetti
    const confettiContainer = document.createElement('div');
    confettiContainer.className = 'confetti-container';
    document.body.appendChild(confettiContainer);
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
