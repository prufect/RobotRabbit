export function createUrgencyToggle(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'urgency-toggle';
  
  const levels = [
    { id: 'routine', label: '🕐 Routine', value: 'low' },
    { id: 'soon', label: '⚡ Soon', value: 'medium' },
    { id: 'emergency', label: '🔴 Emergency', value: 'high' }
  ];
  
  let currentLevel = 'medium';
  
  levels.forEach(level => {
    const btn = document.createElement('button');
    btn.className = `urgency-option ${level.id} ${level.value === currentLevel ? 'active' : ''}`;
    btn.textContent = level.label;
    btn.dataset.value = level.value;
    btn.addEventListener('click', () => {
      currentLevel = level.value;
      wrapper.querySelectorAll('.urgency-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wrapper.dispatchEvent(new CustomEvent('urgency-change', {
        detail: { level: currentLevel },
        bubbles: true
      }));
    });
    wrapper.appendChild(btn);
  });
  
  container.appendChild(wrapper);
  
  return {
    el: wrapper,
    getLevel() { return currentLevel; },
    update({ level }) {
      currentLevel = level;
      wrapper.querySelectorAll('.urgency-option').forEach(b => {
        b.classList.toggle('active', b.dataset.value === level);
      });
    },
    destroy() { wrapper.remove(); },
    on(event, cb) { wrapper.addEventListener(event, cb); }
  };
}
