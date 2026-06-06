export function createAudioVisualizer() {
  let audioContext = null;
  let analyser = null;
  let microphone = null;
  let stream = null;
  let animationId = null;
  let dataArray = null;
  let onDataCallback = null;
  
  async function start() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      audioContext = new AudioContext();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // small for waveform bars
      analyser.smoothingTimeConstant = 0.8;
      
      microphone.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      tick();
    } catch (err) {
      console.warn('Audio visualizer failed:', err);
    }
  }
  
  function tick() {
    if (!analyser) return;
    analyser.getByteFrequencyData(dataArray);
    // Normalize to 0-1 range and take first 8 values for bars
    const bars = Array.from(dataArray.slice(0, 8)).map(v => v / 255);
    if (onDataCallback) {
      onDataCallback(bars);
    }
    animationId = requestAnimationFrame(tick);
  }
  
  function stop() {
    if (animationId) cancelAnimationFrame(animationId);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
    analyser = null; 
    audioContext = null; 
    microphone = null; 
    stream = null;
  }
  
  function onData(cb) { 
    onDataCallback = cb; 
  }
  
  return { start, stop, onData };
}
