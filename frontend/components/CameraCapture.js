export function createCameraCapture(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'camera-capture';
  wrapper.innerHTML = `
    <input type="file" accept="image/*" capture="environment" id="camera-input" class="hidden" aria-label="Take photo or upload image">
    <button class="icon-btn" id="camera-btn" aria-label="Take a photo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
    </button>
  `;
  container.appendChild(wrapper);
  
  const input = wrapper.querySelector('#camera-input');
  const btn = wrapper.querySelector('#camera-btn');
  
  btn.addEventListener('click', () => input.click());
  
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      wrapper.dispatchEvent(new CustomEvent('photo-captured', {
        detail: { file, dataUrl: ev.target.result },
        bubbles: true
      }));
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    input.value = '';
  });
  
  return {
    el: wrapper,
    destroy() { wrapper.remove(); },
    on(event, cb) { wrapper.addEventListener(event, cb); }
  };
}
