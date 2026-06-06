import { createChatBubble } from './ChatBubble.js';
import { scrollToBottom } from '../utils/animations.js';

export function createChatWindow(container) {
  const chatEl = document.createElement('div');
  chatEl.className = 'chat-window';
  chatEl.id = 'chat-window';
  container.appendChild(chatEl);
  
  function addMessage(message) {
    // Remove typing indicator if adding a real agent message
    if (message.sender === 'agent' && message.type !== 'typing') {
      const typingEl = chatEl.querySelector('[data-message-id="typing"]');
      if (typingEl) typingEl.remove();
    }
    
    const bubble = createChatBubble(message);
    chatEl.appendChild(bubble.el);
    scrollToBottom(chatEl);
    return bubble;
  }
  
  function removeMessage(id) {
    const el = chatEl.querySelector(`[data-message-id="${id}"]`);
    if (el) el.remove();
  }
  
  function addCustomElement(element) {
    chatEl.appendChild(element);
    scrollToBottom(chatEl);
  }
  
  function clear() {
    chatEl.innerHTML = '';
  }
  
  return {
    el: chatEl,
    addMessage,
    removeMessage,
    addCustomElement,
    clear,
    scrollToBottom: () => scrollToBottom(chatEl),
    destroy() { chatEl.remove(); }
  };
}
