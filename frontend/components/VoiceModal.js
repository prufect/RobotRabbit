import { createVoiceService } from '../services/voiceService.js';
import { createAudioVisualizer } from '../services/audioVisualizer.js';

export function createVoiceModal() {
  const overlay = document.createElement('div');
  overlay.className = 'voice-modal-overlay';
  
  overlay.innerHTML = `
    <div class="voice-modal-content">
      <button class="voice-modal-close" aria-label="Close Voice">&times;</button>
      
      <div class="voice-modal-header">
        <h2 id="voice-modal-status">Listening...</h2>
        <p id="voice-modal-transcript" class="voice-transcript-large">Speak your request clearly.</p>
      </div>

      <div class="voice-modal-visualizer" id="voice-modal-waves">
        <!-- Waveform bars generated dynamically -->
      </div>
      
      <div class="voice-modal-controls">
        <button class="voice-orb large listening" id="voice-modal-btn">
          <svg class="voice-orb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="1" width="6" height="12" rx="3"></rect>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
      </div>
    </div>
  `;

  const wavesEl = overlay.querySelector('#voice-modal-waves');
  const statusEl = overlay.querySelector('#voice-modal-status');
  const transcriptEl = overlay.querySelector('#voice-modal-transcript');
  const closeBtn = overlay.querySelector('.voice-modal-close');
  const orbBtn = overlay.querySelector('#voice-modal-btn');

  // Create 12 waveform bars for the modal
  for (let i = 0; i < 12; i++) {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:50%; left:${10 + i * 7}%;
      width:6px; background:rgba(124, 58, 237, 0.6); border-radius:3px;
      height:6px; transition:height 0.1s ease; transform-origin:bottom;
    `;
    bar.className = 'wave-bar';
    wavesEl.appendChild(bar);
  }
  const bars = wavesEl.querySelectorAll('.wave-bar');

  const voiceService = createVoiceService();
  const visualizer = createAudioVisualizer();
  let isListening = false;

  // Setup audio visualizer callback
  visualizer.onData((data) => {
    bars.forEach((bar, i) => {
      // Map data to the 12 bars (visualizer usually gives 8, so we wrap/scale)
      const dataIndex = Math.floor((i / 12) * data.length);
      const height = 6 + (data[dataIndex] || 0) * 80; // 6px min, 86px max
      bar.style.height = \`\${height}px\`;
    });
  });

  voiceService.on('start', () => {
    isListening = true;
    orbBtn.classList.add('listening');
    statusEl.textContent = 'Listening...';
    transcriptEl.textContent = 'Speak your request clearly.';
    visualizer.start();
  });

  voiceService.on('end', () => {
    isListening = false;
    orbBtn.classList.remove('listening');
    orbBtn.classList.remove('processing');
    visualizer.stop();
    bars.forEach(b => b.style.height = '6px');
  });

  voiceService.on('interim', (text) => {
    transcriptEl.textContent = text;
  });

  voiceService.on('result', (text) => {
    transcriptEl.textContent = text;
    orbBtn.classList.remove('listening');
    orbBtn.classList.add('processing');
    statusEl.textContent = 'Processing...';
    
    // Dispatch event and auto-close after a short delay
    overlay.dispatchEvent(new CustomEvent('voice-result', { detail: { transcript: text }, bubbles: true }));
    setTimeout(() => close(), 600);
  });

  voiceService.on('error', (err) => {
    statusEl.textContent = err === 'not-allowed' ? 'Microphone access denied' : 'Tap to try again';
    isListening = false;
    orbBtn.classList.remove('listening');
    visualizer.stop();
  });

  function close() {
    visualizer.stop();
    voiceService.abort();
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
    }, 400); // fade out animation
  }

  closeBtn.addEventListener('click', close);

  orbBtn.addEventListener('click', () => {
    if (!voiceService.isSupported()) {
      statusEl.textContent = 'Voice not supported — try typing below';
      return;
    }
    if (isListening) {
      voiceService.stop();
    } else {
      voiceService.start();
    }
  });

  return {
    el: overlay,
    open() {
      document.body.appendChild(overlay);
      // trigger reflow for animation
      overlay.offsetHeight; 
      overlay.classList.add('visible');
      if (voiceService.isSupported()) {
        voiceService.start();
      } else {
        statusEl.textContent = 'Voice not supported';
      }
    },
    close,
    on(event, cb) { overlay.addEventListener(event, cb); }
  };
}
