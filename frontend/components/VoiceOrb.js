import { createVoiceService } from '../services/voiceService.js';
import { createAudioVisualizer } from '../services/audioVisualizer.js';

export function createVoiceOrb(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'voice-orb-container';
  
  // Create the orb with SVG microphone icon
  wrapper.innerHTML = `
    <button class="voice-orb" aria-label="Press to speak" id="voice-orb-btn">
      <svg class="voice-orb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="1" width="6" height="12" rx="3"></rect>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
      <div class="voice-orb-waves" id="voice-waves"></div>
    </button>
    <div class="voice-status" id="voice-status" style="text-align:center;margin-top:12px;font-size:0.85rem;color:var(--text-secondary);min-height:24px;"></div>
    <div class="voice-transcript" id="voice-transcript" style="text-align:center;font-size:0.9rem;color:var(--text-primary);min-height:20px;font-weight:500;"></div>
  `;
  container.appendChild(wrapper);
  
  const orbBtn = wrapper.querySelector('#voice-orb-btn');
  const wavesEl = wrapper.querySelector('#voice-waves');
  const statusEl = wrapper.querySelector('#voice-status');
  const transcriptEl = wrapper.querySelector('#voice-transcript');
  
  // Create 8 waveform bars inside waves container
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:50%; left:${12 + i * 10}%;
      width:4px; background:rgba(255,255,255,0.6); border-radius:2px;
      height:4px; transition:height 0.1s ease; transform-origin:bottom;
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
      const height = 4 + data[i] * 36; // 4px min, 40px max
      bar.style.height = `${height}px`;
    });
  });
  
  // Setup voice callbacks
  voiceService.on('start', () => {
    isListening = true;
    orbBtn.classList.add('listening');
    statusEl.textContent = 'Listening...';
    transcriptEl.textContent = '';
    visualizer.start();
  });
  
  voiceService.on('end', () => {
    isListening = false;
    orbBtn.classList.remove('listening');
    orbBtn.classList.remove('processing');
    statusEl.textContent = '';
    visualizer.stop();
    bars.forEach(b => b.style.height = '4px');
  });
  
  voiceService.on('interim', (text) => {
    transcriptEl.textContent = text;
  });
  
  voiceService.on('result', (text) => {
    transcriptEl.textContent = text;
    orbBtn.classList.remove('listening');
    orbBtn.classList.add('processing');
    statusEl.textContent = 'Processing...';
    wrapper.dispatchEvent(new CustomEvent('voice-result', { detail: { transcript: text }, bubbles: true }));
  });
  
  voiceService.on('error', (err) => {
    statusEl.textContent = err === 'not-allowed' ? 'Microphone access denied' : 'Tap to try again';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  });
  
  // Click handler
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
    el: wrapper,
    update(state) {
      if (state.isProcessing) {
        orbBtn.classList.add('processing');
        statusEl.textContent = 'Processing...';
      } else {
        orbBtn.classList.remove('processing');
      }
    },
    destroy() {
      visualizer.stop();
      voiceService.abort();
      wrapper.remove();
    },
    on(event, cb) { wrapper.addEventListener(event, cb); }
  };
}
