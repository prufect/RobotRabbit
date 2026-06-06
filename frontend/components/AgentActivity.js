/**
 * Agent Activity — renders as a collapsible "thinking" block inside the chat,
 * similar to how Gemini/Claude show their reasoning process.
 *
 * Instead of appending to mainContent, it now creates a chat-inline element
 * that can be added to the chat window via addCustomElement().
 */
export function createAgentActivity(chatWindow) {
  const wrapper = document.createElement('div');
  wrapper.className = 'thinking-block slide-up';

  const header = document.createElement('button');
  header.className = 'thinking-header';
  header.type = 'button';
  header.innerHTML = `
    <span class="thinking-indicator">
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </span>
    <span class="thinking-label">Working on it...</span>
    <svg class="thinking-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
  `;
  wrapper.appendChild(header);

  const body = document.createElement('div');
  body.className = 'thinking-body';
  wrapper.appendChild(body);

  // Toggle collapse
  let collapsed = false;
  header.addEventListener('click', () => {
    collapsed = !collapsed;
    wrapper.classList.toggle('collapsed', collapsed);
  });

  // Add to chat window as a custom element
  if (chatWindow && chatWindow.addCustomElement) {
    chatWindow.addCustomElement(wrapper);
  }

  const steps = [];

  function updateHeaderLabel() {
    const label = header.querySelector('.thinking-label');
    const indicator = header.querySelector('.thinking-indicator');
    const hasActive = steps.some(s => {
      const icon = s.querySelector('.thinking-step-icon');
      return icon && icon.classList.contains('active');
    });
    if (hasActive) {
      label.textContent = 'Working on it...';
      indicator.classList.remove('done');
    } else {
      label.textContent = `Completed ${steps.length} step${steps.length !== 1 ? 's' : ''}`;
      indicator.classList.add('done');
    }
  }

  function addStep({ icon, text, status = 'active' }) {
    const step = document.createElement('div');
    step.className = 'thinking-step';
    step.innerHTML = `
      <div class="thinking-step-icon ${status}">${icon}</div>
      <div class="thinking-step-text ${status === 'active' ? 'shimmer-active' : ''}">${text}</div>
    `;
    body.appendChild(step);
    steps.push(step);
    updateHeaderLabel();

    // Auto-scroll
    if (chatWindow && chatWindow.scrollToBottom) {
      chatWindow.scrollToBottom();
    }

    return steps.length - 1;
  }

  function updateStep(index, { status, text, icon }) {
    const step = steps[index];
    if (!step) return;
    const iconEl = step.querySelector('.thinking-step-icon');
    const textEl = step.querySelector('.thinking-step-text');
    if (status) {
      iconEl.className = `thinking-step-icon ${status}`;
      if (status === 'done') {
        textEl.classList.remove('shimmer-active');
      }
    }
    if (icon) iconEl.textContent = icon;
    if (text) textEl.textContent = text;
    updateHeaderLabel();
  }

  function clear() {
    body.innerHTML = '';
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
