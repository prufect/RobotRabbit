export function createAgentActivity(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'agent-activity';
  container.appendChild(wrapper);
  
  const steps = [];
  
  function addStep({ icon, text, status = 'active' }) {
    const step = document.createElement('div');
    step.className = 'activity-step slide-up glass-subtle';
    step.innerHTML = `
      <div class="activity-step-icon ${status}">${icon}</div>
      <div class="activity-step-text">${text}</div>
    `;
    wrapper.appendChild(step);
    steps.push(step);
    return steps.length - 1;
  }
  
  function updateStep(index, { status, text, icon }) {
    const step = steps[index];
    if (!step) return;
    const iconEl = step.querySelector('.activity-step-icon');
    const textEl = step.querySelector('.activity-step-text');
    if (status) {
      iconEl.className = `activity-step-icon ${status}`;
    }
    if (icon) iconEl.textContent = icon;
    if (text) textEl.textContent = text;
  }
  
  function clear() {
    wrapper.innerHTML = '';
    steps.length = 0;
  }
  
  return {
    el: wrapper,
    addStep,
    updateStep,
    clear,
    show() { wrapper.style.display = ''; },
    hide() { wrapper.style.display = 'none'; },
    destroy() { wrapper.remove(); }
  };
}
