const logoUrl = new URL('../assets/logo.png', import.meta.url).href;

export function createOnboardingSplash(container) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay fade-in';
  overlay.innerHTML = `
    <div class="splash-card glass-solid" style="max-width: 500px; padding: 40px 24px;">
      <img class="splash-logo" src="${logoUrl}" alt="RobotRabbit" style="width: 80px; height: 80px; margin-bottom: 16px;">
      <h1 class="splash-title" style="font-size: 1.8rem;">RobotRabbit</h1>
      <p class="splash-tagline" style="margin-bottom: 24px;">What do you need help with?</p>
      
      <div class="splash-categories" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px;">
        <button class="category-btn" data-query="I need a plumber" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.05); border-radius: 16px; cursor: pointer; transition: all 0.2s;">
          <span style="font-size: 24px; margin-bottom: 8px;">🚰</span>
          <span style="font-weight: 500; color: var(--text-primary);">Plumber</span>
        </button>
        <button class="category-btn" data-query="I need a carpenter" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.05); border-radius: 16px; cursor: pointer; transition: all 0.2s;">
          <span style="font-size: 24px; margin-bottom: 8px;">🪚</span>
          <span style="font-weight: 500; color: var(--text-primary);">Carpenter</span>
        </button>
        <button class="category-btn" data-query="I need an electrician" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.05); border-radius: 16px; cursor: pointer; transition: all 0.2s;">
          <span style="font-size: 24px; margin-bottom: 8px;">⚡️</span>
          <span style="font-weight: 500; color: var(--text-primary);">Electrician</span>
        </button>
        <button class="category-btn" data-query="I need HVAC repair" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.05); border-radius: 16px; cursor: pointer; transition: all 0.2s;">
          <span style="font-size: 24px; margin-bottom: 8px;">❄️</span>
          <span style="font-weight: 500; color: var(--text-primary);">HVAC</span>
        </button>
      </div>

      <button class="btn-primary" id="btn-get-started" style="width: 100%;">Just want to chat</button>
    </div>
  `;
  container.appendChild(overlay);
  
  const btn = overlay.querySelector('#btn-get-started');
  btn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); }, 400);
    overlay.dispatchEvent(new CustomEvent('get-started', { bubbles: true }));
  });
  
  const categoryBtns = overlay.querySelectorAll('.category-btn');
  categoryBtns.forEach(cbtn => {
    cbtn.addEventListener('click', () => {
      const query = cbtn.dataset.query;
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.remove(); }, 400);
      overlay.dispatchEvent(new CustomEvent('category-selected', { detail: { query }, bubbles: true }));
    });
  });

  return {
    el: overlay,
    destroy() { overlay.remove(); }
  };
}
