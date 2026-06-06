/**
 * ImageScanOverlay — Premium scanning overlay that renders on top of an uploaded image
 * in the chat. Provides visual feedback during AI image analysis.
 *
 * Features:
 * - Animated corner brackets around the image
 * - Horizontal scanning line with glow effect
 * - Detection label (e.g. "Paint · Wall")
 * - Progressive checkmark steps (4 steps, staggered animation)
 * - States: scanning → identified / unclear
 */

const SCAN_STEPS = [
  { text: 'Detecting issue type', icon: '🔍' },
  { text: 'Analyzing damage severity', icon: '🔬' },
  { text: 'Identifying components', icon: '🧩' },
  { text: 'Matching professionals', icon: '🤝' },
];

/**
 * Create a scanning overlay and attach it to an image container.
 *
 * @param {HTMLElement} imageContainer - The container element that holds the uploaded image.
 * @param {object} [options]
 * @param {number} [options.stepDuration=650] - Duration per step in ms.
 * @returns {{ el, startScan, showIdentified, showUnclear, destroy }}
 */
export function createImageScanOverlay(imageContainer, options = {}) {
  const stepDuration = options.stepDuration ?? 650;

  // --- Build the overlay DOM ---
  const overlay = document.createElement('div');
  overlay.className = 'image-scan-overlay';

  // Corner brackets
  overlay.innerHTML = `
    <div class="scan-bracket scan-bracket-tl"></div>
    <div class="scan-bracket scan-bracket-tr"></div>
    <div class="scan-bracket scan-bracket-bl"></div>
    <div class="scan-bracket scan-bracket-br"></div>
    <div class="scan-line"></div>
    <div class="scan-label" style="display:none;"></div>
    <div class="scan-status-text">Analyzing image...</div>
    <div class="scan-steps-container"></div>
  `;

  const scanLine = overlay.querySelector('.scan-line');
  const scanLabel = overlay.querySelector('.scan-label');
  const statusText = overlay.querySelector('.scan-status-text');
  const stepsContainer = overlay.querySelector('.scan-steps-container');

  // Build step elements
  const stepElements = SCAN_STEPS.map((step, i) => {
    const stepEl = document.createElement('div');
    stepEl.className = 'scan-step';
    stepEl.dataset.index = i;
    stepEl.innerHTML = `
      <div class="scan-step-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" class="scan-step-circle" />
          <polyline points="9 12 11.5 14.5 16 10" class="scan-step-tick" />
        </svg>
      </div>
      <span class="scan-step-text">${step.text}</span>
    `;
    stepsContainer.appendChild(stepEl);
    return stepEl;
  });

  // Make the image container relative so overlay positions correctly
  imageContainer.style.position = 'relative';
  imageContainer.style.overflow = 'hidden';
  imageContainer.appendChild(overlay);

  let scanTimeout = null;
  let stepIndex = 0;
  let resolveAnimation = null;

  /**
   * Start the scanning animation. Returns a promise that resolves
   * after all steps have animated (total ~2.5-3s).
   */
  function startScan() {
    overlay.className = 'image-scan-overlay scanning';
    scanLine.style.display = '';
    statusText.textContent = 'Analyzing image...';
    statusText.style.display = '';
    scanLabel.style.display = 'none';
    stepIndex = 0;

    // Reset all steps
    stepElements.forEach(el => {
      el.classList.remove('completed', 'active');
    });

    return new Promise((resolve) => {
      resolveAnimation = resolve;
      animateNextStep();
    });
  }

  function animateNextStep() {
    if (stepIndex >= stepElements.length) {
      // All steps done
      if (resolveAnimation) resolveAnimation();
      return;
    }

    const current = stepElements[stepIndex];
    current.classList.add('active');

    scanTimeout = setTimeout(() => {
      current.classList.remove('active');
      current.classList.add('completed');
      stepIndex++;
      animateNextStep();
    }, stepDuration);
  }

  /**
   * Transition to the "identified" state.
   * @param {object} result - Analysis result with category, brand, etc.
   */
  function showIdentified(result) {
    overlay.className = 'image-scan-overlay identified';
    scanLine.style.display = 'none';
    statusText.style.display = 'none';

    // Show detection label
    const labelParts = [];
    if (result.brand) labelParts.push(result.brand);
    if (result.category) {
      labelParts.push(result.category.charAt(0).toUpperCase() + result.category.slice(1));
    }
    if (labelParts.length > 0) {
      scanLabel.innerHTML = `
        <svg class="scan-label-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
        ${labelParts.join(' · ')}
      `;
      scanLabel.style.display = '';
    }

    // Ensure all steps show as completed
    stepElements.forEach(el => {
      el.classList.remove('active');
      el.classList.add('completed');
    });
  }

  /**
   * Transition to the "unclear" state — AI needs more info.
   * @param {object} result - Analysis result with partial info.
   */
  function showUnclear(result) {
    overlay.className = 'image-scan-overlay unclear';
    scanLine.style.display = 'none';

    statusText.textContent = 'Need more details...';
    statusText.style.display = '';

    // Show partial label if we have any info
    if (result.category && result.category !== 'unknown') {
      scanLabel.innerHTML = `
        <svg class="scan-label-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        ${result.category.charAt(0).toUpperCase() + result.category.slice(1)} · Uncertain
      `;
      scanLabel.style.display = '';
    }

    // Mark completed steps, show last ones as unclear
    stepElements.forEach((el, i) => {
      el.classList.remove('active');
      if (i < 2) {
        el.classList.add('completed');
      } else {
        el.classList.add('unclear');
      }
    });
  }

  /**
   * Clean up and remove the overlay.
   */
  function destroy() {
    if (scanTimeout) clearTimeout(scanTimeout);
    overlay.remove();
  }

  return {
    el: overlay,
    startScan,
    showIdentified,
    showUnclear,
    destroy,
  };
}
