import { createVoiceService } from '../services/voiceService.js';
import { createAudioVisualizer } from '../services/audioVisualizer.js';

export function createVoiceOrb(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'voice-orb-container';
  
  // Create the small orb
  wrapper.innerHTML = `
    <button class="voice-orb" aria-label="Press to speak" id="voice-orb-btn">
      <svg class="voice-orb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    </button>
  `;
  container.appendChild(wrapper);
  
  const orbBtn = wrapper.querySelector('#voice-orb-btn');
  
  // Create the fullscreen overlay
  const fullscreenOverlay = document.createElement('div');
  fullscreenOverlay.className = 'voice-fullscreen-overlay hidden';
  fullscreenOverlay.innerHTML = `
    <div class="voice-fullscreen-header">
      <button class="voice-back-btn" id="voice-back-btn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <div class="voice-header-title">Voice Chat</div>
      <div style="width:44px;"></div> <!-- Spacer -->
    </div>
    <div class="voice-fullscreen-content">
      <div class="voice-fullscreen-orb" id="big-voice-orb">
        <div class="voice-orb-waves" id="big-voice-waves"></div>
      </div>
      <div class="voice-fullscreen-text">
        "Hello 👋 I Can Help You Answer Questions, Explain Topics, Write Content, Or Just Chat Casually. Ask Me Anything!"
        <div class="voice-fullscreen-status" id="big-voice-status" style="margin-top: 16px;"></div>
        <div id="big-voice-transcript" style="margin-top: 8px; color: var(--text-primary); font-weight: 500;"></div>
      </div>
    </div>
    <div class="voice-fullscreen-controls">
      <button class="voice-keyboard-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M7 15h10"/></svg>
      </button>
      <button class="voice-fullscreen-mic-btn" id="big-mic-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        </svg>
      </button>
      <button class="voice-trash-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `;
  (document.getElementById('app') || document.body).appendChild(fullscreenOverlay);
  
  const bigOrb = fullscreenOverlay.querySelector('#big-voice-orb');
  const wavesEl = fullscreenOverlay.querySelector('#big-voice-waves');
  const statusEl = fullscreenOverlay.querySelector('#big-voice-status');
  const transcriptEl = fullscreenOverlay.querySelector('#big-voice-transcript');
  const backBtn = fullscreenOverlay.querySelector('#voice-back-btn');
  const bigMicBtn = fullscreenOverlay.querySelector('#big-mic-btn');
  
  const closeFullscreen = () => {
    fullscreenOverlay.classList.add('hidden');
    if (isListening) voiceService.stop();
  };
  backBtn.addEventListener('click', closeFullscreen);
  fullscreenOverlay.querySelector('.voice-keyboard-btn').addEventListener('click', closeFullscreen);
  
  // Create 8 waveform bars inside waves container
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:50%; left:${20 + i * 8}%;
      width:6px; background:rgba(255,255,255,0.7); border-radius:3px;
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
      const height = 6 + data[i] * 60; // larger bars
      bar.style.height = `${height}px`;
    });
  });
  
  // Setup voice callbacks
  voiceService.on('start', () => {
    isListening = true;
    bigOrb.classList.add('listening');
    statusEl.textContent = 'Listening...';
    transcriptEl.textContent = '';
    visualizer.start();
  });
  
  voiceService.on('end', () => {
    isListening = false;
    bigOrb.classList.remove('listening');
    statusEl.textContent = '';
    visualizer.stop();
    bars.forEach(b => b.style.height = '6px');
  });
  
  voiceService.on('interim', (text) => {
    transcriptEl.textContent = text;
  });
  
  voiceService.on('result', (text) => {
    transcriptEl.textContent = text;
    bigOrb.classList.remove('listening');
    statusEl.textContent = 'Processing...';
    closeFullscreen();
    wrapper.dispatchEvent(new CustomEvent('voice-result', { detail: { transcript: text }, bubbles: true }));
  });
  
  voiceService.on('error', (err) => {
    statusEl.textContent = err === 'not-allowed' ? 'Microphone access denied' : 'Tap mic to try again';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  });
  
  // Click handlers
  orbBtn.addEventListener('click', () => {
    if (!voiceService.isSupported()) {
      alert('Voice not supported — try typing below');
      return;
    }
    fullscreenOverlay.classList.remove('hidden');
    if (!isListening) voiceService.start();
  });
  
  bigMicBtn.addEventListener('click', () => {
    if (isListening) voiceService.stop();
    else voiceService.start();
  });
  
  return {
    el: wrapper,
    update(state) {
      if (state.isProcessing) {
        orbBtn.classList.add('processing');
      } else {
        orbBtn.classList.remove('processing');
      }
    },
    destroy() {
      visualizer.stop();
      voiceService.abort();
      wrapper.remove();
      fullscreenOverlay.remove();
    },
    on(event, cb) { wrapper.addEventListener(event, cb); }
  };
}
