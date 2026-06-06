const logoUrl = new URL('../assets/logo.png', import.meta.url).href;

export function createChatBubble(message) {
  // message: { id, sender: 'user'|'agent', text, imageUrl?, type?: 'text'|'typing'|'activity'|'contractor-cards'|'booking' }
  const row = document.createElement('div');
  row.className = `chat-bubble-row ${message.sender}`;
  row.dataset.messageId = message.id;
  
  if (message.type === 'typing') {
    row.innerHTML = `
      <div class="chat-bubble-avatar">
        <img src="${logoUrl}" alt="">
      </div>
      <div class="chat-bubble agent glass">
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    `;
    return { el: row };
  }
  
  const avatarHtml = message.sender === 'agent' 
    ? `<div class="chat-bubble-avatar"><img src="${logoUrl}" alt=""></div>`
    : '';
  
  const imageHtml = message.imageUrl 
    ? `<img src="${message.imageUrl}" alt="Uploaded photo" style="max-width:100%;border-radius:12px;margin-bottom:8px;">` 
    : '';
  
  const bubbleClass = message.sender === 'user' ? 'chat-bubble user' : 'chat-bubble agent glass';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  row.innerHTML = `
    ${avatarHtml}
    <div class="${bubbleClass}">
      ${imageHtml}
      <p style="margin:0;">${message.text}</p>
      <span class="timestamp">${time}</span>
    </div>
  `;
  
  return { el: row };
}
