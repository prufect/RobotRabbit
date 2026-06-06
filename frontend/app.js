import { createOnboardingSplash } from './components/OnboardingSplash.js';
import { createChatWindow } from './components/ChatWindow.js';
import { createVoiceOrb } from './components/VoiceOrb.js';
import { createCameraCapture } from './components/CameraCapture.js';
import { createUrgencyToggle } from './components/UrgencyToggle.js';
import { createAgentActivity } from './components/AgentActivity.js';
import { createContractorCards } from './components/ContractorCard.js';
import { showContractorDetailModal } from './components/ContractorDetailModal.js';
import { createBookingConfirm } from './components/BookingConfirm.js';
import { createPriceIntel } from './components/PriceIntel.js';
import { createMessageCenter } from './components/MessageCenter.js';

import {
  analyzeImage,
  analyzeVoice,
  searchContractors,
  negotiateAndBook,
  getConversations,
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
      <span class="header-status">
        <span class="status-dot"></span>
        AI Agent Online
      </span>
    </div>
    <div class="auth-status" id="auth-status"></div>
  `;
  appContainer.appendChild(header);
  const authStatus = header.querySelector('#auth-status');

  // Message Center — live agent ↔ contractor conversations.
  const messageCenter = createMessageCenter({ getConversations });
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
    <div class="greeting-top">
      <div class="greeting-text">
        <span class="greeting-name">Hello Alex</span>
        <span class="greeting-welcome">Welcome Back</span>
      </div>
      <button class="messages-btn" id="dashboard-messages-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        Messages
      </button>
    </div>
    <h2 class="greeting-hero">Good Morning<br>What Needs Fixing Today?</h2>
    <div class="location-bar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
      <input type="text" id="location-input" value="San Francisco, CA" title="Enter City or Zip Code" class="location-input">
    </div>
  `;
  dashboard.appendChild(greeting);

  // Wire dashboard Messages button to open the message center
  greeting.querySelector('#dashboard-messages-btn').addEventListener('click', () => {
    const mcToggle = header.querySelector('.mc-toggle');
    if (mcToggle) mcToggle.click();
  });
  
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
    button.textContent = currentUser?.email ?? 'Sign in';
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
    if (dashboard && dashboard.parentNode) {
      dashboard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      dashboard.style.opacity = '0';
      dashboard.style.transform = 'translateY(-10px)';
      setTimeout(() => { dashboard.style.display = 'none'; }, 300);
    }

    lastInputMode = isVoice ? 'voice' : 'text';
    const id = generateId();
    chatWindow.addMessage({ id, sender: 'user', text, imageUrl });
    saveMessage('user', text, imageUrl ? 'image' : 'text', imageUrl).catch(console.error);
    textInput.value = '';
    textInput.blur();
    toggleSendVoiceBtn(false);
    
    await addAgentTyping();
    
    const urgency = urgencyToggle.getLevel();
    
    if (imageUrl) {
      handleImageFlow(imageUrl, urgency, imageFile);
    } else {
      handleTextFlow(text, urgency);
    }
  }
  
  // --- Core Application Flows ---
  
  async function handleImageFlow(imageUrl, urgency, imageFile) {
    const activity = createAgentActivity(chatWindow);
    const step1 = activity.addStep({ icon: '👁️', text: 'Analyzing image...', status: 'active' });
    chatWindow.scrollToBottom();
    
    let result;
    try {
      result = await analyzeImage(imageUrl, urgency, imageFile);
    } catch (error) {
      activity.updateStep(step1, { icon: '!', status: 'pending' });
      const message = error.message || 'I could not send this photo to the backend.';
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: message });
      if (isAuthRequiredError(error)) openAuthModal('sign-in');
      return;
    }
    
    if (!result.isIdentified) {
      activity.updateStep(step1, { icon: '❓', status: 'pending' });
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
      return;
    }
    
    const identifiedLabel = result.brand && result.modelNumber
      ? `${result.brand} ${result.modelNumber}`
      : result.brand
        ? result.brand
        : result.category
          ? `${result.category.charAt(0).toUpperCase() + result.category.slice(1)} issue`
          : 'Issue identified';
    activity.updateStep(step1, { icon: '✅', text: `Identified: ${identifiedLabel}`, status: 'done' });
    const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
    chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
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
    const textMsg = 'I found these highly-rated professionals nearby. Should I negotiate rates and check their availability for you?';
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: textMsg 
    });
    saveMessage('assistant', textMsg).catch(console.error);
    
    // Display contractor cards with individual negotiate buttons
    const top3 = contractors.slice(0, 3);
    const cardsContainer = document.createElement('div');
    cardsContainer.style.margin = '12px 0';
    createContractorCards(top3, cardsContainer);
    chatWindow.addCustomElement(cardsContainer);

    // Add "Negotiate with all 3" button below the cards
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px;';
    btnContainer.innerHTML = `<button class="btn-primary fade-in" id="negotiate-all-btn" style="width: 100%;">🤖 Negotiate with top ${top3.length}</button>`;
    chatWindow.addCustomElement(btnContainer);
    chatWindow.scrollToBottom();
    
    let negotiationStarted = false;

    const startNegotiation = async (contractorsToNegotiate) => {
      if (negotiationStarted) return;
      negotiationStarted = true;

      // Disable all negotiate buttons
      const allBtn = btnContainer.querySelector('#negotiate-all-btn');
      if (allBtn) {
        allBtn.disabled = true;
        allBtn.innerHTML = 'Negotiating...';
        allBtn.style.opacity = '0.7';
      }

      await startNegotiationFlow(contractorsToNegotiate, urgency);
    };

    // "Negotiate with all" button click
    btnContainer.querySelector('#negotiate-all-btn').addEventListener('click', () => {
      startNegotiation(top3);
    });

    // Clicking a card opens detail modal with "Start Negotiating" for that contractor
    cardsContainer.addEventListener('contractor-selected', (e) => {
      if (negotiationStarted) return;
      showContractorDetailModal(e.detail.contractor, () => {
        startNegotiation([e.detail.contractor]);
      });
    });
  }
  
  async function startNegotiationFlow(contractors, urgency) {
    const contractorNames = contractors.slice(0, 3).map(c => c.name).join(', ');
    const negMsg = `Starting negotiation with ${Math.min(3, contractors.length)} contractor${contractors.length > 1 ? 's' : ''}: ${contractorNames}. Follow the live progress in Messages.`;
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: negMsg 
    });
    saveMessage('assistant', negMsg).catch(console.error);
    
    const activity = createAgentActivity(chatWindow);
    chatWindow.scrollToBottom();
    
    const mcToggle = document.querySelector('.mc-toggle');
    if (mcToggle) {
      mcToggle.style.animation = 'none';
      setTimeout(() => mcToggle.style.animation = 'pulse 1s 3', 50);
    }
    const gen = negotiateAndBook(contractors, { urgency });
    let currentStepIdx = null;
    let finalBooking = null;
    
    try {
      for await (const state of gen) {
        if (currentStepIdx !== null) {
          activity.updateStep(currentStepIdx, { icon: '✅', status: 'done' });
        }

        let icon = '💬';
        if (state.step === 'contacting-individual') icon = '📞';
        if (state.step === 'responses') icon = '📱';
        if (state.step === 'negotiating') icon = '🤝';
        if (state.step === 'comparing') icon = '📊';

        if (state.step !== 'booked') {
          currentStepIdx = activity.addStep({ icon, text: state.message, status: 'active' });
        } else {
          finalBooking = state.booking;
        }
        chatWindow.scrollToBottom();
      }
    } catch (error) {
      if (currentStepIdx !== null) activity.updateStep(currentStepIdx, { icon: '!', status: 'pending' });
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: error.message || 'Negotiation failed.' });
      return;
    }
    
    if (finalBooking) {
      if (currentStepIdx !== null) {
        activity.updateStep(currentStepIdx, { icon: '✅', status: 'done' });
      }
      await wait(1000);
      
      // Calculate area averages to show Price Intel
      const basePrice = finalBooking.contractor.originalPrice;
      const areaLow = Math.floor(basePrice * 0.9);
      const areaHigh = Math.floor(basePrice * 1.3);
      const areaAvg = Math.floor(basePrice * 1.15);
      
      const priceIntelContainer = document.createElement('div');
      createPriceIntel(priceIntelContainer, {
        areaLow, areaHigh, areaAvg, negotiatedPrice: finalBooking.negotiatedPrice
      });
      chatWindow.addCustomElement(priceIntelContainer);
      
      const finalPriceMsg = `Great news! I successfully negotiated with ${finalBooking.contractor.name} and secured a price of $${finalBooking.negotiatedPrice}. They can be there on ${finalBooking.date} at ${finalBooking.time}. I've already verified their license and insurance. Would you like to confirm the booking?`;
      chatWindow.addMessage({ 
        id: generateId(), 
        sender: 'agent', 
        text: finalPriceMsg 
      });
      saveMessage('assistant', finalPriceMsg).catch(console.error);
      
      await wait(1000);
      bookingConfirm.show(finalBooking);
    }
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
