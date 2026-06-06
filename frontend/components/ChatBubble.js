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
    return { el: row, imageContainer: null };
  }
  
  const avatarHtml = message.sender === 'agent' 
    ? `<div class="chat-bubble-avatar"><img src="${logoUrl}" alt=""></div>`
    : '';
  
  // Wrap uploaded images in a scan-target container for the overlay
  const imageHtml = message.imageUrl 
    ? `<div class="image-scan-target" data-scan-target="true">
        <img src="${message.imageUrl}" alt="Uploaded photo" style="max-width:100%;border-radius:12px;display:block;">
      </div>` 
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
  
  // Return reference to the image container for overlay attachment
  const imageContainer = row.querySelector('.image-scan-target');
  return { el: row, imageContainer };
}
