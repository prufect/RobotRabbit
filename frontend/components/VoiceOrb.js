export function createVoiceOrb(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'voice-orb-simple-container';
  
  wrapper.innerHTML = `
    <button class="voice-orb" aria-label="Press to speak" id="voice-orb-btn" style="width: 44px; height: 44px; box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3);">
      <svg class="voice-orb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;">
        <rect x="9" y="1" width="6" height="12" rx="3"></rect>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    </button>
  `;
  container.appendChild(wrapper);
  
  const orbBtn = wrapper.querySelector('#voice-orb-btn');
  
  orbBtn.addEventListener('click', () => {
    wrapper.dispatchEvent(new CustomEvent('voice-trigger', { bubbles: true }));
  });
  
  return {
    el: wrapper,
    update() {},
    destroy() { wrapper.remove(); },
    on(event, cb) { wrapper.addEventListener(event, cb); }
  };
}
