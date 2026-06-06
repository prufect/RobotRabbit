const logoUrl = new URL('../assets/logo.png', import.meta.url).href;

export function createOnboardingSplash(container) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay fade-in';
  overlay.innerHTML = `
    <div class="splash-card glass-solid">
      <img class="splash-logo" src="${logoUrl}" alt="RobotRabbit">
      <h1 class="splash-title">RobotRabbit</h1>
      <p class="splash-tagline">Snap. Speak. Fixed.</p>
      <div class="splash-steps">
        <div class="splash-step">
          <div class="splash-step-icon">📸</div>
          <span>Snap a photo</span>
        </div>
        <div class="splash-step">
          <div class="splash-step-icon">🤖</div>
          <span>AI negotiates</span>
        </div>
        <div class="splash-step">
          <div class="splash-step-icon">✅</div>
          <span>You're booked</span>
        </div>
      </div>
      <p class="splash-hint" style="font-size:0.85rem;color:var(--text-muted);margin-bottom:20px;">Try saying: "My kitchen sink is leaking"</p>
      <button class="btn-primary" id="btn-get-started">Get Started</button>
    </div>
  `;
  container.appendChild(overlay);
  
  const btn = overlay.querySelector('#btn-get-started');
  btn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); }, 400);
    overlay.dispatchEvent(new CustomEvent('get-started', { bubbles: true }));
  });
  
  return {
    el: overlay,
    destroy() { overlay.remove(); }
  };
}
