const logoUrl = new URL('../assets/logo.png', import.meta.url).href;

export function createOnboardingSplash(container) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay fade-in';
  
  // Create a large clipped orb at the top
  const topOrb = document.createElement('div');
  topOrb.className = 'splash-top-orb';
  overlay.appendChild(topOrb);
  
  // Create content wrapper
  const content = document.createElement('div');
  content.className = 'splash-content';
  content.innerHTML = `
    <h1 class="splash-title">
      Fix Anything, <span style="color: #8C6AA8;">Find</span><br>
      <span style="color: #2F2F2F;">The Right Pro.</span>
    </h1>
    <p class="splash-tagline">
      Describe Your Issue or Snap a Photo. Let AI Instantly<br>
      Find & Book Trusted Local Professionals
    </p>
    
    <button class="btn-primary get-started-btn" id="btn-get-started">Get Started</button>
  `;
  overlay.appendChild(content);
  
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
