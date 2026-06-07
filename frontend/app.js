import { createOnboardingSplash } from './components/OnboardingSplash.js';
import { createChatWindow } from './components/ChatWindow.js';
import { createVoiceOrb } from './components/VoiceOrb.js';
import { createCameraCapture } from './components/CameraCapture.js';
import { createUrgencyToggle } from './components/UrgencyToggle.js';
import { createAgentActivity } from './components/AgentActivity.js';
import { createContractorCards } from './components/ContractorCard.js';
import { showContractorDetailModal } from './components/ContractorDetailModal.js';
import { createBookingConfirm } from './components/BookingConfirm.js';
import { createMessageCenter } from './components/MessageCenter.js';
import { createImageScanOverlay } from './components/ImageScanOverlay.js';

import {
  analyzeImage,
  analyzeVoice,
  searchContractors,
  negotiateAndBook,
  finalizeBooking,
  negotiateQuote,
  getConversations,
  getConversationMessages,
  getCurrentUser,
  signIn,
  signUp,
  verifyEmail,
  resendVerificationEmail,
  signInWithGoogle,
  signOut,
  isAuthRequiredError,
  isBackendConfigured,
  loadRecentSession,
  saveMessage,
} from './services/insforgeApi.js';

const logoUrl = new URL('./assets/logo.png', import.meta.url).href;

// Fallback delay utility
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function createBookingApprovalFromBooking(booking) {
  const contractorName = booking?.contractor?.name ?? 'The contractor';
  const price = Number.isFinite(Number(booking?.negotiatedPrice))
    ? `$${Number(booking.negotiatedPrice)}`
    : 'the quoted price';
  const date = booking?.date ?? 'the requested day';
  const time = booking?.time ?? 'the requested time';

  return {
    step: 'approval',
    contractorId: booking?.contractor?.id ?? null,
    quoteId: null,
    quote: {
      contractor_id: booking?.contractor?.id ?? null,
      contractor_name: contractorName,
      price: booking?.negotiatedPrice ?? null,
      availability: [date, time].filter(Boolean).join(', '),
      raw_message: `${contractorName} can do ${date} at ${time} for ${price}.`,
      approval_status: 'pending',
    },
    booking,
    message: `${contractorName} can do ${date} at ${time} for ${price}. Should we book?`,
  };
}

function createQuoteApprovalPrompt(proposal, handlers = {}) {
  const booking = proposal?.booking ?? {};
  const contractorName = booking.contractor?.name ?? 'the contractor';
  const price = Number.isFinite(Number(booking.negotiatedPrice))
    ? `$${Number(booking.negotiatedPrice)}`
    : 'Price TBD';
  const date = booking.date ?? 'Date TBD';
  const time = booking.time ?? 'Time TBD';
  const card = document.createElement('div');
  card.className = 'quote-approval-card glass fade-in';
  card.innerHTML = `
    <div class="quote-approval-eyebrow">Contractor reply</div>
    <p class="quote-approval-text"></p>
    <div class="quote-approval-details" aria-label="Quote details">
      <div class="quote-approval-detail">
        <span class="quote-approval-detail-label">Price</span>
        <strong data-role="quote-price"></strong>
      </div>
      <div class="quote-approval-detail">
        <span class="quote-approval-detail-label">Date</span>
        <strong data-role="quote-date"></strong>
      </div>
      <div class="quote-approval-detail">
        <span class="quote-approval-detail-label">Time</span>
        <strong data-role="quote-time"></strong>
      </div>
    </div>
    <button class="btn-primary quote-approval-book" type="button" data-action="book-quote">
      Book ${escapeAttribute(contractorName)}
    </button>
    <div class="quote-approval-secondary-actions">
      <button class="quote-approval-secondary" type="button" data-action="negotiate-quote">
        Ask for better price
      </button>
      <button class="quote-approval-secondary" type="button" data-action="contact-more-contractors">
        Contact more pros
      </button>
    </div>
  `;

  card.querySelector('.quote-approval-text').textContent = proposal?.message ?? 'The contractor replied. Should we book?';
  card.querySelector('[data-role="quote-price"]').textContent = price;
  card.querySelector('[data-role="quote-date"]').textContent = date;
  card.querySelector('[data-role="quote-time"]').textContent = time;
  card.querySelector('[data-action="book-quote"]').addEventListener('click', (event) => {
    handlers.onBook?.(event.currentTarget);
  });
  card.querySelector('[data-action="negotiate-quote"]').addEventListener('click', (event) => {
    handlers.onNegotiate?.(event.currentTarget);
  });
  card.querySelector('[data-action="contact-more-contractors"]').addEventListener('click', (event) => {
    handlers.onContactMore?.(event.currentTarget);
  });

  return card;
}

document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  
  // 1. Build the App Shell
  
  // Header
  const header = document.createElement('header');
  header.className = 'app-header glass';
  header.innerHTML = `
    <img src="${logoUrl}" alt="RobotRabbit" class="header-logo">
    <div class="header-copy">
      <h1 class="header-title">RobotRabbit</h1>
    </div>
    <div class="auth-status" id="auth-status"></div>
  `;
  appContainer.appendChild(header);
  const authStatus = header.querySelector('#auth-status');

  // Message Center — live agent ↔ contractor conversations.
  const messageCenter = createMessageCenter({ getConversations, getConversationMessages });
  header.insertBefore(messageCenter.button, authStatus);
  
  // Main Content Area
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  appContainer.appendChild(mainContent);
  
  // Bottom Bar (Input area)
  const bottomBarWrapper = document.createElement('div');
  bottomBarWrapper.style.cssText = 'padding: 0 16px; position: sticky; bottom: 0; z-index: 50;';
  appContainer.appendChild(bottomBarWrapper);
  
  const bottomBar = document.createElement('div');
  bottomBar.className = 'bottom-bar glass-solid';
  bottomBarWrapper.appendChild(bottomBar);
  
  // Dragbar for toggling
  const dragbarContainer = document.createElement('div');
  dragbarContainer.className = 'dragbar-container';
  dragbarContainer.innerHTML = `<div class="dragbar-pill"></div>`;
  bottomBar.appendChild(dragbarContainer);

  const bottomBarContent = document.createElement('div');
  bottomBarContent.className = 'bottom-bar-content';
  bottomBar.appendChild(bottomBarContent);

  dragbarContainer.addEventListener('click', () => {
    bottomBar.classList.toggle('collapsed');
  });

  // 2. Initialize Components
  
  // Dashboard Section
  const dashboard = document.createElement('div');
  dashboard.className = 'home-dashboard fade-in';
  
  const greeting = document.createElement('div');
  greeting.className = 'greeting-section';
  greeting.innerHTML = `

    <h2 class="greeting-hero">Good Morning<br>What Needs Fixing Today?</h2>
    <div class="location-bar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
      <input type="text" id="location-input" value="San Francisco, CA" title="Enter City or Zip Code" class="location-input">
    </div>
  `;
  dashboard.appendChild(greeting);


  
  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions-grid';
  const actions = [
    { title: 'Find a<br>Plumber', icon: '🔧', query: 'I need a plumber' },
    { title: 'Find an<br>Electrician', icon: '⚡', query: 'I need an electrician' },
    { title: 'Find a<br>Carpenter', icon: '🪚', query: 'I need a carpenter' },
    { title: 'Emergency<br>Repair', icon: '🚨', query: 'I have an emergency repair needed' }
  ];
  actions.forEach(act => {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="action-icon-wrapper">${act.icon}</div>
      <div class="action-card-title">${act.title}</div>
      <div class="action-card-arrow">→</div>
    `;
    card.addEventListener('click', () => processUserInput(act.query));
    quickActions.appendChild(card);
  });
  dashboard.appendChild(quickActions);
  
  const chatHistory = document.createElement('div');
  chatHistory.className = 'chat-history-section';
  chatHistory.innerHTML = `
    <div class="chat-history-header">
      <div class="chat-history-title">Chat History</div>
      <div class="chat-history-see-all">See All</div>
    </div>
    <div class="chat-filters">
      <div class="chat-filter-pill active">All</div>
      <div class="chat-filter-pill">Plumbing</div>
      <div class="chat-filter-pill">Electrical</div>
      <div class="chat-filter-pill">HVAC</div>
    </div>
  `;
  dashboard.appendChild(chatHistory);

  mainContent.appendChild(dashboard);

  const chatWindow = createChatWindow(mainContent);
  chatWindow.el.style.display = 'none';
  const originalAddMessage = chatWindow.addMessage;
  chatWindow.addMessage = function(msg) {
    const bubble = originalAddMessage(msg);
    if (msg.sender === 'agent' && lastInputMode === 'voice' && msg.text && msg.type !== 'typing') {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(msg.text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }
    return bubble;
  };
  const urgencyToggle = createUrgencyToggle(bottomBarContent);
  const bookingConfirm = createBookingConfirm(appContainer);
  
  // Setup Input Row in Bottom Bar
  const inputRow = document.createElement('div');
  inputRow.className = 'input-row';
  
  const cameraContainer = document.createElement('div');
  const cameraCapture = createCameraCapture(cameraContainer);
  
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'text-input';
  textInput.placeholder = 'Describe the issue...';
  
  const voiceContainer = document.createElement('div');
  const voiceOrb = createVoiceOrb(voiceContainer);
  
  const sendBtn = document.createElement('button');
  sendBtn.className = 'icon-btn';
  sendBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
  `;
  sendBtn.style.display = 'none';
  
  inputRow.appendChild(cameraContainer);
  inputRow.appendChild(textInput);
  inputRow.appendChild(sendBtn);
  inputRow.appendChild(voiceContainer);
  bottomBarContent.appendChild(inputRow);
  
  // Create Onboarding Splash
  createOnboardingSplash(appContainer);
  
  // 3. State & Message Handling
  
  let msgIdCounter = 0;
  let currentIssueContext = null;
  let currentUser = null;
  let authModalOverlay = null;
  let lastInputMode = 'text';
  let activeContractorSelection = null;
  
  // Clarification state — tracks when the AI needs more info about an uploaded image
  let pendingClarification = null;
  // { imageUrl, imageFile, urgency, previousAnalysis, scanOverlay, attemptCount }
  
  function generateId() {
    return `msg-${++msgIdCounter}`;
  }
  
  async function addAgentTyping() {
    chatWindow.addMessage({ id: 'typing', sender: 'agent', type: 'typing' });
    chatWindow.scrollToBottom();
    await wait(800 + Math.random() * 1000);
  }

  function isSignedIn() {
    return Boolean(currentUser?.id);
  }

  function isLoginRequired() {
    return isBackendConfigured() && !isSignedIn();
  }

  function closeAuthModal() {
    authModalOverlay?.remove();
    authModalOverlay = null;
  }

  function requireSignedIn() {
    if (!isLoginRequired()) return true;
    openAuthModal('sign-in', {
      required: true,
      message: 'Sign in to continue.',
    });
    return false;
  }

  function renderAuthState() {
    authStatus.innerHTML = '';

    if (!isBackendConfigured()) {
      const badge = document.createElement('span');
      badge.className = 'auth-pill muted';
      badge.textContent = 'Mock mode';
      authStatus.appendChild(badge);
      return;
    }

    const button = document.createElement('button');
    button.className = `auth-pill ${currentUser ? '' : 'primary'}`;
    button.type = 'button';
    button.textContent = currentUser ? 'Sign out' : 'Sign in';
    button.addEventListener('click', async () => {
      if (!currentUser) {
        openAuthModal('sign-in', {
          required: true,
          message: 'Sign in to continue.',
        });
        return;
      }

      try {
        await signOut();
        currentUser = null;
        renderAuthState();
        openAuthModal('sign-in', {
          required: true,
          message: 'Signed out. Sign in to continue.',
        });
      } catch (error) {
        chatWindow.addMessage({ id: generateId(), sender: 'agent', text: error.message || 'Sign out failed.' });
      }
    });
    authStatus.appendChild(button);
  }

  async function loadPersistedMessages() {
    try {
      const session = await loadRecentSession();
      if (session && session.messages && session.messages.length > 0) {
        chatWindow.clear();
        session.messages.forEach(msg => {
          if (msg.role === 'system') return;
          chatWindow.addMessage({
            id: msg.id,
            sender: msg.role === 'user' ? 'user' : 'agent',
            text: msg.content,
            imageUrl: msg.metadata?.imageUrl || null
          });
        });
        
        if (dashboard && dashboard.parentNode) {
          dashboard.style.display = 'none';
        }
        chatWindow.el.style.display = 'flex';
        
        chatWindow.scrollToBottom();
      } else if (session === null) {
        chatWindow.clear();
      }
    } catch (e) {
      console.error("Failed to load past session:", e);
    }
  }

  async function refreshAuthState({ requireLogin = false } = {}) {
    try {
      const session = await getCurrentUser();
      currentUser = session.user;
    } catch {
      currentUser = null;
    }
    renderAuthState();
    if (currentUser) {
      closeAuthModal();
      await loadPersistedMessages();
      return;
    }
    if (requireLogin && isBackendConfigured()) {
      openAuthModal('sign-in', {
        required: true,
        message: 'Sign in to continue.',
      });
    }
  }

  function openAuthModal(initialMode = 'sign-in', options = {}) {
    if (!isBackendConfigured()) return;

    let mode = initialMode;
    let verificationEmail = options.email ?? '';
    const required = Boolean(options.required);
    const overlay = document.createElement('div');
    closeAuthModal();
    overlay.className = `auth-overlay ${required ? 'required' : ''}`;
    authModalOverlay = overlay;
    appContainer.appendChild(overlay);

    function close() {
      if (required && !isSignedIn()) return;
      closeAuthModal();
    }

    function render(message = options.message ?? '', isError = false) {
      const isVerificationMode = mode === 'verify-email';
      const title = isVerificationMode ? 'Verify Email' : mode === 'sign-up' ? 'Create Account' : 'Sign In';
      const subtitle = isVerificationMode
        ? 'Enter the 6-digit code from your email.'
        : required ? 'Required for RobotRabbit.' : 'Connect to RobotRabbit.';
      const controls = isVerificationMode ? `
          <label class="auth-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" value="${escapeAttribute(verificationEmail)}" required>
          </label>
          <label class="auth-field">
            <span>Verification code</span>
            <input name="otp" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
          </label>
          <div class="auth-message ${isError ? 'error' : ''}"></div>
          <button class="btn-primary" type="submit">Verify Email</button>
          <button class="auth-link-button" type="button" data-action="resend-code">Resend code</button>
          <button class="auth-link-button muted" type="button" data-mode="sign-in">Back to sign in</button>
        ` : `
          <button class="auth-google" type="button" data-provider="google">
            <span class="auth-google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>
          <div class="auth-divider"><span>or</span></div>
          <div class="auth-tabs">
            <button class="auth-tab ${mode === 'sign-in' ? 'active' : ''}" type="button" data-mode="sign-in">Sign In</button>
            <button class="auth-tab ${mode === 'sign-up' ? 'active' : ''}" type="button" data-mode="sign-up">Sign Up</button>
          </div>
          <label class="auth-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required>
          </label>
          <label class="auth-field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="${mode === 'sign-up' ? 'new-password' : 'current-password'}" ${mode === 'sign-up' ? 'minlength="6"' : ''} required>
          </label>
          ${mode === 'sign-up' ? `
            <label class="auth-field">
              <span>Name</span>
              <input name="name" type="text" autocomplete="name">
            </label>
          ` : ''}
          <div class="auth-message ${isError ? 'error' : ''}"></div>
          <button class="btn-primary" type="submit">${title}</button>
        `;
      overlay.innerHTML = `
        <form class="auth-card glass-solid">
          <div class="auth-card-header">
            <div>
              <h2>${title}</h2>
              <p>${subtitle}</p>
            </div>
            ${required ? '' : '<button class="auth-close" type="button" aria-label="Close">&times;</button>'}
          </div>
          ${controls}
        </form>
      `;

      overlay.querySelector('.auth-message').textContent = message;
      overlay.querySelector('.auth-close')?.addEventListener('click', close);
      overlay.querySelector('[data-provider="google"]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.innerHTML = '<span class="auth-google-mark" aria-hidden="true">G</span>Connecting...';

        try {
          await signInWithGoogle({ redirectTo: `${window.location.origin}/` });
        } catch (error) {
          render(error.message || 'Google sign-in failed.', true);
        }
      });
      overlay.querySelectorAll('[data-mode]').forEach(control => {
        control.addEventListener('click', () => {
          mode = control.dataset.mode;
          render();
        });
      });
      overlay.querySelector('[data-action="resend-code"]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const form = button.closest('form');
        const email = String(new FormData(form).get('email') ?? '').trim();

        if (!email) {
          render('Enter your email so I know where to resend the code.', true);
          return;
        }

        verificationEmail = email;
        button.disabled = true;
        button.textContent = 'Sending...';

        try {
          await resendVerificationEmail({
            email,
            redirectTo: `${window.location.origin}/`,
          });
          render('A new code is on its way.', false);
        } catch (error) {
          render(error.message || 'Could not resend the verification code.', true);
        }
      });
      overlay.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        submit.disabled = true;
        submit.textContent = mode === 'sign-up' ? 'Creating...' : mode === 'verify-email' ? 'Verifying...' : 'Signing in...';

        try {
          const email = String(formData.get('email') ?? '').trim();
          const password = String(formData.get('password') ?? '');
          const name = String(formData.get('name') ?? '').trim();

          if (mode === 'verify-email') {
            const otp = String(formData.get('otp') ?? '').trim();
            const data = await verifyEmail({ email, otp });
            currentUser = data?.user ?? currentUser;
            await refreshAuthState();
            if (!currentUser && data?.user) {
              currentUser = data.user;
              renderAuthState();
            }
            close();
            chatWindow.addMessage({ id: generateId(), sender: 'agent', text: 'Email verified and signed in. I can now save your RobotRabbit requests in InsForge.' });
            return;
          }

          if (mode === 'sign-up') {
            const data = await signUp({
              email,
              password,
              name,
              redirectTo: `${window.location.origin}/`,
            });
            if (data?.requireEmailVerification) {
              verificationEmail = email;
              mode = 'verify-email';
              render('Enter the 6-digit code we sent to your email.', false);
              return;
            }
          } else {
            await signIn({ email, password });
          }

          await refreshAuthState();
          close();
          chatWindow.addMessage({ id: generateId(), sender: 'agent', text: 'Signed in. I can now save photos, requests, contractor searches, and notifications in InsForge.' });
        } catch (error) {
          render(error.message || 'Authentication failed.', true);
        }
      });
    }

    render();
  }
  
  async function processUserInput(text, imageUrl = null, imageFile = null, isVoice = false) {
    if (!requireSignedIn()) return;

    // Hide the dashboard when a chat starts
    if (dashboard && dashboard.parentNode && dashboard.style.display !== 'none') {
      dashboard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      dashboard.style.opacity = '0';
      dashboard.style.transform = 'translateY(-10px)';
      setTimeout(() => { dashboard.style.display = 'none'; }, 300);
    }
    
    chatWindow.el.style.display = 'flex';

    lastInputMode = isVoice ? 'voice' : 'text';
    const id = generateId();
    const userBubble = chatWindow.addMessage({ id, sender: 'user', text, imageUrl });
    saveMessage('user', text, imageUrl ? 'image' : 'text', imageUrl).catch(console.error);
    textInput.value = '';
    textInput.blur();
    toggleSendVoiceBtn(false);
    
    const urgency = urgencyToggle.getLevel();
    
    // Check if user is responding to a clarification question
    if (pendingClarification && !imageUrl) {
      await addAgentTyping();
      handleClarificationResponse(text);
      return;
    }
    
    await addAgentTyping();
    
    if (imageUrl) {
      handleImageFlow(imageUrl, urgency, imageFile, userBubble);
    } else {
      handleTextFlow(text, urgency);
    }
  }
  
  // --- Core Application Flows ---
  
  async function handleImageFlow(imageUrl, urgency, imageFile, userBubble) {
    // Attach the scanning overlay to the uploaded image in the chat
    let scanOverlay = null;
    const imageContainer = userBubble?.imageContainer;
    
    if (imageContainer) {
      scanOverlay = createImageScanOverlay(imageContainer);
    }
    
    // Start scan animation and API call in parallel
    const scanAnimationPromise = scanOverlay ? scanOverlay.startScan() : wait(2500);
    
    let result;
    let analysisError = null;
    
    const analysisPromise = analyzeImage(imageUrl, urgency, imageFile).catch(error => {
      analysisError = error;
      return null;
    });
    
    // Wait for BOTH animation and API to complete
    const [, analysisResult] = await Promise.all([scanAnimationPromise, analysisPromise]);
    result = analysisResult;
    
    // Handle API error
    if (analysisError || !result) {
      if (scanOverlay) scanOverlay.showUnclear({ category: 'unknown' });
      const message = analysisError?.message || 'I could not analyze this photo. Please try again.';
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: message });
      if (isAuthRequiredError(analysisError)) openAuthModal('sign-in');
      return;
    }
    
    const confidenceScore = result.confidenceScore ?? (result.isIdentified ? 100 : 50);
    
    // Confidence < 100: ask for clarification
    if (confidenceScore < 100 || !result.isIdentified) {
      if (scanOverlay) scanOverlay.showUnclear(result);
      
      // Store clarification state for follow-up
      pendingClarification = {
        imageUrl,
        imageFile,
        urgency,
        previousAnalysis: result,
        scanOverlay,
        attemptCount: 1,
      };
      
      // Show the clarifying question or a generic one
      const question = result.clarifyingQuestion 
        || result.messageToUser 
        || "I'm having trouble identifying the issue in this photo. Could you describe what needs fixing?";
      
      const confidenceText = confidenceScore > 0 
        ? ` (Confidence: ${confidenceScore}%)` 
        : '';
      
      chatWindow.addMessage({ 
        id: generateId(), 
        sender: 'agent', 
        text: question + confidenceText
      });
      saveMessage('assistant', question, 'clarification').catch(console.error);
      chatWindow.scrollToBottom();
      return;
    }
    
    // Confidence is 100% — proceed with identification
    if (scanOverlay) scanOverlay.showIdentified(result);
    
    // Clear any pending clarification
    pendingClarification = null;
    
    const identifiedLabel = result.brand && result.modelNumber
      ? `${result.brand} ${result.modelNumber}`
      : result.brand
        ? result.brand
        : result.category
          ? `${result.category.charAt(0).toUpperCase() + result.category.slice(1)} issue`
          : 'Issue identified';
    
    const activity = createAgentActivity(chatWindow);
    activity.addStep({ icon: '✅', text: `Identified: ${identifiedLabel}`, status: 'done' });
    const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
    chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
    saveMessage('assistant', result.messageToUser, 'analysis').catch(console.error);
    chatWindow.scrollToBottom();
    
    currentIssueContext = result;
    await findAndPresentContractors(result.contractorSearchQuery, urgency, activity, step2);
  }
  
  /**
   * Handle user response to a clarification question.
   * Re-analyze the image with additional user context.
   */
  async function handleClarificationResponse(userText) {
    if (!pendingClarification) return;
    
    const { imageUrl, imageFile, urgency, scanOverlay, attemptCount } = pendingClarification;
    const MAX_CLARIFICATION_ATTEMPTS = 3;
    
    // Show we're re-analyzing
    const activity = createAgentActivity(chatWindow);
    const step1 = activity.addStep({ icon: '🔄', text: 'Re-analyzing with your input...', status: 'active' });
    chatWindow.scrollToBottom();
    
    let result;
    try {
      result = await analyzeImage(imageUrl, urgency, imageFile, userText);
    } catch (error) {
      activity.updateStep(step1, { icon: '!', status: 'pending' });
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: error.message || 'Re-analysis failed. Please try uploading a new photo.' });
      pendingClarification = null;
      return;
    }
    
    const confidenceScore = result.confidenceScore ?? (result.isIdentified ? 100 : 50);
    
    if (confidenceScore < 100 || !result.isIdentified) {
      activity.updateStep(step1, { icon: '❓', status: 'pending' });
      
      // Check if we've exceeded max attempts
      if (attemptCount >= MAX_CLARIFICATION_ATTEMPTS) {
        pendingClarification = null;
        
        // If we have some category info, use it anyway
        if (result.category && result.category !== 'unknown') {
          const fallbackMsg = `Based on what you've told me, this seems like a ${result.category} issue. Let me find professionals for you.`;
          chatWindow.addMessage({ id: generateId(), sender: 'agent', text: fallbackMsg });
          saveMessage('assistant', fallbackMsg, 'analysis').catch(console.error);
          
          currentIssueContext = result;
          const searchQuery = result.contractorSearchQuery || `${result.category} repair contractor`;
          const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
          await findAndPresentContractors(searchQuery, urgency, activity, step2);
        } else {
          chatWindow.addMessage({ id: generateId(), sender: 'agent', text: "I'm sorry, I still can't identify the issue. Could you try uploading a clearer photo or use the text/voice input to describe what needs fixing?" });
        }
        return;
      }
      
      // Update state for next attempt
      pendingClarification = {
        ...pendingClarification,
        previousAnalysis: result,
        attemptCount: attemptCount + 1,
      };
      
      const question = result.clarifyingQuestion 
        || result.messageToUser 
        || "I still need a bit more information. Can you tell me more about what's wrong?";
      
      chatWindow.addMessage({ 
        id: generateId(), 
        sender: 'agent', 
        text: `${question} (Confidence: ${confidenceScore}%, attempt ${attemptCount + 1}/${MAX_CLARIFICATION_ATTEMPTS})`
      });
      saveMessage('assistant', question, 'clarification').catch(console.error);
      chatWindow.scrollToBottom();
      return;
    }
    
    // Confidence is 100% — identified!
    activity.updateStep(step1, { icon: '✅', text: 'Issue confirmed!', status: 'done' });
    pendingClarification = null;
    
    // Update scan overlay if still available
    if (scanOverlay) {
      try { scanOverlay.showIdentified(result); } catch (_) { /* overlay may have been removed */ }
    }
    
    const identifiedLabel = result.brand && result.modelNumber
      ? `${result.brand} ${result.modelNumber}`
      : result.brand
        ? result.brand
        : result.category
          ? `${result.category.charAt(0).toUpperCase() + result.category.slice(1)} issue`
          : 'Issue identified';
    
    activity.addStep({ icon: '✅', text: `Identified: ${identifiedLabel}`, status: 'done' });
    const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
    chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
    saveMessage('assistant', result.messageToUser, 'analysis').catch(console.error);
    chatWindow.scrollToBottom();
    
    currentIssueContext = result;
    await findAndPresentContractors(result.contractorSearchQuery, urgency, activity, step2);
  }
  
  async function handleTextFlow(text, urgency) {
    const activity = createAgentActivity(chatWindow);
    const step1 = activity.addStep({ icon: '🧠', text: 'Understanding issue...', status: 'active' });
    chatWindow.scrollToBottom();
    
    const result = await analyzeVoice(text, urgency);
    
    activity.updateStep(step1, { icon: '✅', text: `Category: ${result.category}`, status: 'done' });
    const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
    chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
    saveMessage('assistant', result.messageToUser, 'analysis').catch(console.error);
    chatWindow.scrollToBottom();
    
    currentIssueContext = result;
    await findAndPresentContractors(result.contractorSearchQuery, urgency, activity, step2);
  }
  
  async function findAndPresentContractors(query, urgency, activity, searchStep) {
    let contractors;
    try {
      const locationInput = document.getElementById('location-input');
      const location = locationInput ? locationInput.value : 'San Francisco, CA';
      contractors = await searchContractors(query, location);
    } catch (error) {
      activity.updateStep(searchStep, { icon: '!', status: 'pending' });
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: error.message || 'Contractor search failed.' });
      return;
    }

    activity.updateStep(searchStep, { icon: '✅', text: `Found ${contractors.length} qualified pros`, status: 'done' });
    
    await wait(800);
    const textMsg = 'I found these highly-rated professionals nearby. Tap any contractor to negotiate. You can contact more than one and I will compare replies before booking.';
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: textMsg 
    });
    saveMessage('assistant', textMsg).catch(console.error);
    
    // Display cards
    const cardsContainer = document.createElement('div');
    cardsContainer.style.margin = '12px 0';
    createContractorCards(contractors.slice(0, 3), cardsContainer);
    chatWindow.addCustomElement(cardsContainer);
    
    // Track which contractors have been negotiated (per-contractor, NOT a single boolean)
    const negotiatedContractors = new Set();
    activeContractorSelection = { cardsContainer, contractors, negotiatedContractors };
    
    function markCardAsNegotiating(contractorId, contractorName) {
      const allCards = cardsContainer.querySelectorAll('.contractor-card');
      allCards.forEach((cardEl) => {
        // Find the card for this contractor by matching name text
        const nameEl = cardEl.querySelector('.contractor-name');
        if (nameEl && nameEl.textContent === contractorName) {
          cardEl.classList.add('negotiating');
          // Add badge if not already there
          if (!cardEl.querySelector('.negotiating-badge')) {
            const badge = document.createElement('div');
            badge.className = 'negotiating-badge';
            badge.innerHTML = '🤝 Negotiating';
            cardEl.appendChild(badge);
          }
        }
      });
    }

    cardsContainer.addEventListener('contractor-selected', (e) => {
      const contractor = e.detail.contractor;
      const contractorKey = contractor.id ?? contractor.name;
      const alreadyNegotiating = negotiatedContractors.has(contractorKey);

      showContractorDetailModal(contractor, () => {
        // Start negotiation for this contractor
        if (negotiatedContractors.has(contractorKey)) return; // already started
        negotiatedContractors.add(contractorKey);
        markCardAsNegotiating(contractorKey, contractor.name);

        // Show negotiation started message in chat immediately
        const negStartMsg = `🤝 Starting negotiation with ${contractor.name}...`;
        chatWindow.addMessage({ id: generateId(), sender: 'agent', text: negStartMsg });
        saveMessage('assistant', negStartMsg).catch(console.error);
        chatWindow.scrollToBottom();

        // Fire the negotiation flow (does NOT block other negotiations)
        startNegotiationFlow([contractor], urgency);
      }, alreadyNegotiating);
    });
  }
  
  async function startNegotiationFlow(contractors, urgency) {
    const activity = createAgentActivity(chatWindow);
    chatWindow.scrollToBottom();
    
    const contractorName = contractors[0]?.name ?? 'the selected contractor';
    const negMsg = `Negotiation has started with ${contractorName}. Replies will show in Messages.`;
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: negMsg 
    });
    saveMessage('assistant', negMsg).catch(console.error);
    
    // Immediately refresh the Message Center so new conversations appear
    messageCenter.refresh();
    
    const mcToggle = document.querySelector('.mc-toggle');
    if (mcToggle) {
      mcToggle.style.animation = 'none';
      setTimeout(() => mcToggle.style.animation = 'pulse 1s 3', 50);
    }
    const gen = negotiateAndBook(contractors, { urgency });
    let currentStepIdx = null;

    const bookApprovedQuote = async (proposal, button) => {
      if (button.dataset.busy === 'true') return;
      const booking = proposal?.booking;
      const contractorId = proposal?.contractorId ?? booking?.contractor?.id;
      if (!booking || !contractorId) {
        chatWindow.addMessage({ id: generateId(), sender: 'agent', text: 'I could not find the contractor quote to book.' });
        return;
      }

      const previousLabel = button.textContent;
      button.dataset.busy = 'true';
      button.disabled = true;
      button.textContent = 'Booking...';

      const contractorName = booking.contractor?.name ?? 'the contractor';
      const userBookMsg = `Book ${contractorName}.`;
      chatWindow.addMessage({ id: generateId(), sender: 'user', text: userBookMsg });
      saveMessage('user', userBookMsg).catch(console.error);

      try {
        await finalizeBooking(contractorId, booking.date, booking.time, proposal.quoteId);
        button.textContent = 'Booked';

        const quotedPrice = Number.isFinite(Number(booking.negotiatedPrice))
          ? `$${Number(booking.negotiatedPrice)}`
          : 'the quoted price';
        const finalPriceMsg = `Done. ${contractorName} is booked for ${booking.date} at ${booking.time} for ${quotedPrice}.`;
        chatWindow.addMessage({
          id: generateId(),
          sender: 'agent',
          text: finalPriceMsg
        });
        saveMessage('assistant', finalPriceMsg, 'booking').catch(console.error);
        messageCenter.refresh();

        await wait(400);
        bookingConfirm.show(booking);
      } catch (error) {
        button.dataset.busy = 'false';
        button.disabled = false;
        button.textContent = previousLabel;
        chatWindow.addMessage({
          id: generateId(),
          sender: 'agent',
          text: error.message || 'I could not finalize that booking yet.'
        });
      }
    };

    const negotiateApprovedQuote = async (proposal, button) => {
      if (button.dataset.busy === 'true') return;
      const booking = proposal?.booking;
      const contractor = booking?.contractor;
      if (!booking || !contractor) {
        chatWindow.addMessage({ id: generateId(), sender: 'agent', text: 'I could not find the contractor quote to negotiate.' });
        return;
      }

      const previousLabel = button.textContent;
      const currentPrice = Number(booking.negotiatedPrice);
      const targetPrice = Number.isFinite(currentPrice)
        ? Math.max(75, Math.round(currentPrice * 0.9))
        : null;
      button.dataset.busy = 'true';
      button.disabled = true;
      button.textContent = 'Asking...';

      const askMsg = targetPrice
        ? `Ask ${contractor.name} if they can do $${targetPrice}.`
        : `Ask ${contractor.name} if they can do any better.`;
      chatWindow.addMessage({ id: generateId(), sender: 'user', text: askMsg });
      saveMessage('user', askMsg).catch(console.error);

      try {
        await negotiateQuote(contractor, proposal.quote, { targetPrice });
        const sentMsg = targetPrice
          ? `I asked ${contractor.name} whether they can improve to $${targetPrice}. I will keep watching for their reply.`
          : `I asked ${contractor.name} whether they can improve the quote. I will keep watching for their reply.`;
        chatWindow.addMessage({ id: generateId(), sender: 'agent', text: sentMsg });
        saveMessage('assistant', sentMsg, 'notification').catch(console.error);
        button.textContent = 'Asked';
        messageCenter.refresh();
      } catch (error) {
        button.dataset.busy = 'false';
        button.disabled = false;
        button.textContent = previousLabel;
        chatWindow.addMessage({
          id: generateId(),
          sender: 'agent',
          text: error.message || 'I could not send that counteroffer yet.'
        });
      }
    };

    const contactMoreContractors = (button) => {
      if (button.dataset.busy === 'true') return;
      button.dataset.busy = 'true';
      button.textContent = 'See contractor list';

      const message = activeContractorSelection?.cardsContainer
        ? 'Tap another contractor card above and I will contact them too. I will compare replies before you book.'
        : 'Search or tap another contractor and I will compare replies before you book.';
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: message });
      saveMessage('assistant', message, 'notification').catch(console.error);

      const cardsContainer = activeContractorSelection?.cardsContainer;
      if (cardsContainer) {
        cardsContainer.classList.add('contact-more-highlight');
        cardsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => cardsContainer.classList.remove('contact-more-highlight'), 1600);
      }
    };

    const renderApprovalPrompt = (proposal) => {
      const prompt = createQuoteApprovalPrompt(proposal, {
        onBook: (button) => bookApprovedQuote(proposal, button),
        onNegotiate: (button) => negotiateApprovedQuote(proposal, button),
        onContactMore: (button) => contactMoreContractors(button),
      });
      chatWindow.addCustomElement(prompt);
      saveMessage('assistant', proposal.message, 'approval').catch(console.error);
      chatWindow.scrollToBottom();
    };
    
    try {
      for await (const state of gen) {
        if (currentStepIdx !== null) {
          activity.updateStep(currentStepIdx, { icon: '✅', status: 'done' });
        }

        if (state.step === 'approval') {
          currentStepIdx = null;
          renderApprovalPrompt(state);
          continue;
        }

        if (state.step === 'booked') {
          currentStepIdx = null;
          renderApprovalPrompt(createBookingApprovalFromBooking(state.booking));
          continue;
        }

        let icon = '💬';
        if (state.step === 'contacting-individual') icon = '📞';
        if (state.step === 'responses') icon = '📱';
        if (state.step === 'negotiating') icon = '🤝';
        if (state.step === 'countering') icon = '💸';
        if (state.step === 'comparing') icon = '📊';
        if (state.step === 'waiting') icon = '⏳';

        currentStepIdx = activity.addStep({ icon, text: state.message, status: 'active' });
        chatWindow.scrollToBottom();
      }
    } catch (error) {
      if (currentStepIdx !== null) activity.updateStep(currentStepIdx, { icon: '!', status: 'pending' });
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: error.message || 'Negotiation failed.' });
      return;
    }
    
    // Refresh Message Center after negotiation completes
    messageCenter.refresh();
  }
  
  // 4. Event Listeners
  
  // Initial Greeting
  appContainer.addEventListener('get-started', async () => {
    await wait(500);
    await addAgentTyping();
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: 'Hi! I\'m RobotRabbit 🐰. I can help fix anything in your home. Describe the issue, or snap a photo of what\'s broken.' 
    });
  });

  refreshAuthState({ requireLogin: true });
  
  // Handle text input toggling send button
  function toggleSendVoiceBtn(hasText) {
    if (hasText) {
      voiceContainer.style.display = 'none';
      sendBtn.style.display = 'flex';
    } else {
      voiceContainer.style.display = 'block';
      sendBtn.style.display = 'none';
    }
  }
  
  textInput.addEventListener('input', (e) => {
    toggleSendVoiceBtn(e.target.value.trim().length > 0);
  });
  
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && textInput.value.trim()) {
      processUserInput(textInput.value.trim());
    }
  });
  
  sendBtn.addEventListener('click', () => {
    if (textInput.value.trim()) {
      processUserInput(textInput.value.trim());
    }
  });
  
  // Handle Camera Capture
  cameraContainer.addEventListener('photo-captured', (e) => {
    const { dataUrl, file } = e.detail;
    processUserInput('I took a photo of the issue.', dataUrl, file);
  });
  
  // Handle Voice Input
  voiceContainer.addEventListener('voice-result', (e) => {
    const { transcript } = e.detail;
    if (transcript) {
      processUserInput(transcript, null, null, true);
    }
  });
});
