// Typewriter effect - reveals text character by character
export function typewriterEffect(element, text, speed = 30) {
  return new Promise(resolve => {
    let i = 0;
    element.textContent = '';
    const interval = setInterval(() => {
      element.textContent += text[i];
      i++;
      if (i >= text.length) { 
        clearInterval(interval); 
        resolve(); 
      }
    }, speed);
  });
}

// Staggered entrance - animates a list of elements with staggered delays
export function staggerEntrance(elements, delayBetween = 100) {
  if (prefersReducedMotion()) return;
  
  elements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    setTimeout(() => {
      el.style.transition = 'opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, i * delayBetween);
  });
}

// Counter animation - animates a number counting up
export function animateCounter(element, target, duration = 1000) {
  if (prefersReducedMotion()) {
    element.textContent = target;
    return;
  }
  
  const start = performance.now();
  const initial = 0;
  
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    
    element.textContent = Math.round(initial + (target - initial) * eased);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

// Confetti burst for booking confirmation
export function createConfetti(container, count = 50) {
  if (prefersReducedMotion()) return;
  
  const colors = ['#7C3AED', '#F97066', '#10B981', '#F59E0B', '#DDD6FE', '#FECACA'];
  const pieces = [];
  
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const duration = 2 + Math.random() * 2;
    const rotation = Math.random() * 720;
    const size = 6 + Math.random() * 6;
    
    piece.style.cssText = `
      left: ${left}%; top: -10px;
      width: ${size}px; height: ${size}px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation: confetti-fall ${duration}s ${delay}s ease-in forwards;
      --drift: ${(Math.random() - 0.5) * 200}px;
      --rotate: ${rotation}deg;
    `;
    
    container.appendChild(piece);
    pieces.push(piece);
  }
  
  // Cleanup after animation
  setTimeout(() => pieces.forEach(p => p.remove()), 5000);
}

// Shimmer loading effect
export function shimmer(element, duration = 2000) {
  element.classList.add('shimmer-active');
  setTimeout(() => element.classList.remove('shimmer-active'), duration);
}

// Smooth scroll to bottom of container
export function scrollToBottom(container) {
  if (prefersReducedMotion()) {
    container.scrollTop = container.scrollHeight;
  } else {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }
}

// Check reduced motion preference
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
