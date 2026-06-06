export function createVoiceService() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  let recognition = null;
  let isListening = false;
  let callbacks = { onResult: null, onInterim: null, onStart: null, onEnd: null, onError: null };
  
  function isSupported() { 
    return !!SpeechRecognition; 
  }
  
  function start() {
    if (!SpeechRecognition) { 
      callbacks.onError?.('Speech recognition not supported'); 
      return; 
    }
    
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = false; // single utterance
      recognition.interimResults = true; // show partial results
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;
      
      recognition.onresult = (event) => {
        const result = event.results[event.resultIndex];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          callbacks.onResult?.(transcript);
        } else {
          callbacks.onInterim?.(transcript);
        }
      };
      
      recognition.onstart = () => { 
        isListening = true; 
        callbacks.onStart?.(); 
      };
      
      recognition.onend = () => { 
        isListening = false; 
        callbacks.onEnd?.(); 
      };
      
      recognition.onerror = (e) => { 
        isListening = false; 
        callbacks.onError?.(e.error); 
      };
      
      recognition.start();
    } catch (e) {
      isListening = false;
      callbacks.onError?.(e.message || 'Error starting recognition');
    }
  }
  
  function stop() { 
    if (recognition && isListening) {
      try { recognition.stop(); } catch(e) {}
    }
  }
  
  function abort() { 
    if (recognition && isListening) {
      try { recognition.abort(); } catch(e) {}
    }
  }
  
  function getIsListening() { 
    return isListening; 
  }
  
  function on(event, cb) { 
    callbacks['on' + event.charAt(0).toUpperCase() + event.slice(1)] = cb; 
  }
  
  return { isSupported, start, stop, abort, getIsListening, on };
}
