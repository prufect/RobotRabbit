import { createOnboardingSplash } from './components/OnboardingSplash.js';
import { createChatWindow } from './components/ChatWindow.js';
import { createVoiceOrb } from './components/VoiceOrb.js';
import { createVoiceModal } from './components/VoiceModal.js';
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
  finalizeBooking,
  getConversations,
  getCurrentUser,
  signIn,
  signUp,
  verifyEmail,
  resendVerificationEmail,
  signInWithGoogle,
  signOut,
  sendResetPasswordEmail,
  exchangeResetPasswordToken,
  resetPassword,
  isAuthRequiredError,
  isBackendConfigured,
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
    <div class="header-copy" style="flex: 1;">
      <h1 style="font-size:1.1rem; font-weight:700; color:var(--text-primary); margin:0; line-height:1.2;">RobotRabbit</h1>
      <span style="font-size:0.75rem; color:var(--accent-tertiary); font-weight:600; display:flex; align-items:center; gap:4px;">
        <span style="display:inline-block; width:6px; height:6px; background:var(--accent-tertiary); border-radius:50%; box-shadow:0 0 6px var(--accent-tertiary);"></span>
        AI Agent Online
      </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; margin-right: 16px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary);"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
      <input type="text" id="location-input" value="San Francisco, CA" title="Enter City or Zip Code" style="font-size: 0.85rem; padding: 6px 12px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.6); width: 140px; color: var(--text-primary); outline: none;">
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
  
  const chatWindow = createChatWindow(mainContent);
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
  
  // Create Voice Modal
  const voiceModal = createVoiceModal();
  
  // 3. State & Message Handling
  
  let msgIdCounter = 0;
  let currentIssueContext = null;
  let currentUser = null;
  let authModalOverlay = null;
  
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
    const required = Boolean(options.required);
    const overlay = document.createElement('div');
    closeAuthModal();
    overlay.className = `auth-overlay ${required ? 'required' : ''}`;
    authModalOverlay = overlay;
    appContainer.appendChild(overlay);

    let savedEmail = options.email ?? '';

    function close() {
      if (required && !isSignedIn()) return;
      closeAuthModal();
    }

    function render(message = '', isError = false) {
      let title = 'Sign In';
      if (mode === 'sign-up') title = 'Create Account';
      if (mode === 'verify-email') title = 'Verify Email';
      if (mode === 'forgot-password' || mode === 'reset-password') title = 'Reset Password';

      let fieldsHtml = '';
      if (mode === 'verify-email') {
        fieldsHtml = `
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; text-align: center;">
            Enter the 6-digit verification code sent to <strong>${escapeAttribute(savedEmail)}</strong>
          </p>
          <label class="auth-field">
            <span>Verification Code</span>
            <input name="otp" type="text" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required autocomplete="one-time-code" style="text-align: center; font-size: 1.25rem; letter-spacing: 4px; font-weight: 700;">
          </label>
        `;
      } else if (mode === 'forgot-password') {
        fieldsHtml = `
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; text-align: center;">
            Enter your email address to receive a 6-digit password reset code.
          </p>
          <label class="auth-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" value="${escapeAttribute(savedEmail)}" required>
          </label>
        `;
      } else if (mode === 'reset-password') {
        fieldsHtml = `
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; text-align: center;">
            Enter the 6-digit code sent to <strong>${escapeAttribute(savedEmail)}</strong> and your new password.
          </p>
          <label class="auth-field">
            <span>Reset Code</span>
            <input name="code" type="text" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required autocomplete="one-time-code" style="text-align: center; font-size: 1.25rem; letter-spacing: 4px; font-weight: 700;">
          </label>
          <label class="auth-field">
            <span>New Password</span>
            <input name="newPassword" type="password" minlength="8" required>
          </label>
        `;
      } else {
        fieldsHtml = `
          <label class="auth-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" value="${escapeAttribute(savedEmail)}" required>
          </label>
          <label class="auth-field">
            <span style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span>Password</span>
              ${mode === 'sign-in' ? `<a href="#" id="forgot-password-link" style="font-size: 0.85rem; color: var(--accent-primary); text-decoration: underline; font-weight: 600;">Forgot Password?</a>` : ''}
            </span>
            <input name="password" type="password" autocomplete="${mode === 'sign-up' ? 'new-password' : 'current-password'}" minlength="8" required>
          </label>
          ${mode === 'sign-up' ? `
            <label class="auth-field">
              <span>Name</span>
              <input name="name" type="text" autocomplete="name">
            </label>
          ` : ''}
        `;
      }

      let tabsHtml = '';
      if (mode === 'sign-in' || mode === 'sign-up') {
        tabsHtml = `
          <div class="auth-tabs">
            <button class="auth-tab ${mode === 'sign-in' ? 'active' : ''}" type="button" data-mode="sign-in">Sign In</button>
            <button class="auth-tab ${mode === 'sign-up' ? 'active' : ''}" type="button" data-mode="sign-up">Sign Up</button>
          </div>
        `;
      } else {
        const tabLabel = mode === 'verify-email' ? 'Verification' : 'Reset Password';
        tabsHtml = `
          <div class="auth-tabs" style="justify-content: center;">
            <button class="auth-tab active" type="button" style="pointer-events: none;">${tabLabel}</button>
          </div>
        `;
      }

      let googleButtonHtml = '';
      if (mode === 'sign-in' || mode === 'sign-up') {
        googleButtonHtml = `
          <button class="auth-google" type="button" data-provider="google">
            <span class="auth-google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>
          <div class="auth-divider"><span>or</span></div>
        `;
      }

      let footerButtonsHtml = '';
      if (mode === 'verify-email') {
        footerButtonsHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px; align-items: center; width: 100%;">
            <button class="btn-primary" type="submit" style="width: 100%;">Verify Code</button>
            <button id="resend-code-btn" type="button" style="font-size: 0.8rem; border: none; background: none; color: var(--accent-primary); cursor: pointer; text-decoration: underline;">Resend code</button>
            <button id="back-to-signin-btn" type="button" style="font-size: 0.8rem; border: none; background: none; color: var(--text-secondary); cursor: pointer;">Back to Sign In</button>
          </div>
        `;
      } else if (mode === 'forgot-password') {
        footerButtonsHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px; align-items: center; width: 100%;">
            <button class="btn-primary" type="submit" style="width: 100%;">Send Reset Code</button>
            <button id="back-to-signin-btn" type="button" style="font-size: 0.8rem; border: none; background: none; color: var(--text-secondary); cursor: pointer;">Back to Sign In</button>
          </div>
        `;
      } else if (mode === 'reset-password') {
        footerButtonsHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px; align-items: center; width: 100%;">
            <button class="btn-primary" type="submit" style="width: 100%;">Reset Password</button>
            <button id="resend-reset-btn" type="button" style="font-size: 0.8rem; border: none; background: none; color: var(--accent-primary); cursor: pointer; text-decoration: underline;">Resend code</button>
            <button id="back-to-signin-btn" type="button" style="font-size: 0.8rem; border: none; background: none; color: var(--text-secondary); cursor: pointer;">Back to Sign In</button>
          </div>
        `;
      } else {
        footerButtonsHtml = `
          <button class="btn-primary" type="submit" style="width: 100%; margin-top: 12px;">${title}</button>
        `;
      }

      overlay.innerHTML = `
        <form class="auth-card glass-solid">
          <div class="auth-card-header">
            <div>
              <h2>${title}</h2>
              <p>${required ? 'Required for RobotRabbit.' : 'Connect to RobotRabbit.'}</p>
            </div>
            ${required ? '' : '<button class="auth-close" type="button" aria-label="Close">&times;</button>'}
          </div>
          ${googleButtonHtml}
          ${tabsHtml}
          ${fieldsHtml}
          <div class="auth-message ${isError ? 'error' : ''}"></div>
          ${footerButtonsHtml}
        </form>
      `;

      overlay.querySelector('.auth-message').textContent = message;
      overlay.querySelector('.auth-close')?.addEventListener('click', close);

      if (mode === 'sign-in' || mode === 'sign-up') {
        overlay.querySelector('[data-provider="google"]').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.innerHTML = '<span class="auth-google-mark" aria-hidden="true">G</span>Connecting...';

          try {
            await signInWithGoogle({ redirectTo: `${window.location.origin}/` });
          } catch (error) {
            render(error.message || 'Google sign-in failed.', true);
          }
        });

        overlay.querySelectorAll('.auth-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            mode = tab.dataset.mode;
            render();
          });
        });

        overlay.querySelector('#forgot-password-link')?.addEventListener('click', (e) => {
          e.preventDefault();
          mode = 'forgot-password';
          render();
        });
      } else if (mode === 'verify-email') {
        overlay.querySelector('#resend-code-btn').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Sending...';
          try {
            await resendVerificationEmail({
              email: savedEmail,
              redirectTo: `${window.location.origin}/`,
            });
            render('Verification code resent. Check your email.', false);
          } catch (error) {
            button.disabled = false;
            button.textContent = 'Resend Code';
            render(error.message || 'Failed to resend code.', true);
          }
        });

        overlay.querySelector('#back-to-signin-btn').addEventListener('click', () => {
          mode = 'sign-in';
          render();
        });
      } else if (mode === 'forgot-password') {
        overlay.querySelector('#back-to-signin-btn').addEventListener('click', () => {
          mode = 'sign-in';
          render();
        });
      } else if (mode === 'reset-password') {
        overlay.querySelector('#resend-reset-btn').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Sending...';
          try {
            await sendResetPasswordEmail({
              email: savedEmail,
              redirectTo: `${window.location.origin}/`,
            });
            render('Reset code resent. Check your email.', false);
          } catch (error) {
            button.disabled = false;
            button.textContent = 'Resend Code';
            render(error.message || 'Failed to resend reset code.', true);
          }
        });

        overlay.querySelector('#back-to-signin-btn').addEventListener('click', () => {
          mode = 'sign-in';
          render();
        });
      }

      overlay.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        submit.disabled = true;

        if (mode === 'verify-email') {
          submit.textContent = 'Verifying...';
          try {
            const otp = String(formData.get('otp') ?? '').trim();
            await verifyEmail({ email: savedEmail, otp });
            await refreshAuthState();
            close();
            chatWindow.addMessage({ id: generateId(), sender: 'agent', text: 'Signed in. I can now save photos, requests, contractor searches, and notifications in InsForge.' });
          } catch (error) {
            submit.disabled = false;
            submit.textContent = 'Verify Code';
            render(error.message || 'Verification failed. Please check the code.', true);
          }
          return;
        }

        if (mode === 'forgot-password') {
          submit.textContent = 'Sending...';
          try {
            const email = String(formData.get('email') ?? '').trim();
            savedEmail = email;
            await sendResetPasswordEmail({
              email,
              redirectTo: `${window.location.origin}/`,
            });
            mode = 'reset-password';
            render('Reset code sent to your email. Please check and enter it below.', false);
          } catch (error) {
            submit.disabled = false;
            submit.textContent = 'Send Reset Code';
            render(error.message || 'Failed to send reset code.', true);
          }
          return;
        }

        if (mode === 'reset-password') {
          submit.textContent = 'Resetting...';
          try {
            const code = String(formData.get('code') ?? '').trim();
            const newPassword = String(formData.get('newPassword') ?? '');
            
            // Exchange the 6-digit code for reset token
            const exchangeData = await exchangeResetPasswordToken({ email: savedEmail, code });
            const token = exchangeData?.token;
            if (!token) throw new Error('Could not retrieve reset token.');

            // Use the token to reset password
            await resetPassword({ newPassword, otp: token });
            
            mode = 'sign-in';
            render('Password reset successfully! Please sign in with your new password.', false);
          } catch (error) {
            submit.disabled = false;
            submit.textContent = 'Reset Password';
            render(error.message || 'Password reset failed. Please check the code and try again.', true);
          }
          return;
        }

        submit.textContent = mode === 'sign-up' ? 'Creating...' : 'Signing in...';

        try {
          const email = String(formData.get('email') ?? '').trim();
          const password = String(formData.get('password') ?? '');
          const name = String(formData.get('name') ?? '').trim();
          savedEmail = email;

          if (mode === 'sign-up') {
            const data = await signUp({
              email,
              password,
              name,
              redirectTo: `${window.location.origin}/`,
            });
            if (data?.requireEmailVerification || !data?.accessToken) {
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
          submit.disabled = false;
          submit.textContent = mode === 'sign-up' ? 'Create Account' : 'Sign In';
          const errMsg = error.message || '';
          if (mode === 'sign-in' && (errMsg.toLowerCase().includes('confirm') || errMsg.toLowerCase().includes('verify') || errMsg.toLowerCase().includes('verification') || errMsg.toLowerCase().includes('unconfirmed'))) {
            mode = 'verify-email';
            render('Account email is not verified yet. Please enter the verification code sent to your email.', false);
          } else {
            render(errMsg || 'Authentication failed.', true);
          }
        }
      });
    }

    render(options.message ?? '');
  }
  
  async function processUserInput(text, imageUrl = null, imageFile = null) {
    if (!requireSignedIn()) return;

    const id = generateId();
    chatWindow.addMessage({ id, sender: 'user', text, imageUrl });
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
    const activity = createAgentActivity(mainContent);
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
    
    activity.updateStep(step1, { icon: '✅', text: `Identified: ${result.brand} ${result.modelNumber}`, status: 'done' });
    const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
    chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
    chatWindow.scrollToBottom();
    
    currentIssueContext = result;
    await findAndPresentContractors(result.contractorSearchQuery, urgency, activity, step2);
  }
  
  async function handleTextFlow(text, urgency) {
    const activity = createAgentActivity(mainContent);
    const step1 = activity.addStep({ icon: '🧠', text: 'Understanding issue...', status: 'active' });
    chatWindow.scrollToBottom();
    
    const result = await analyzeVoice(text);
    
    activity.updateStep(step1, { icon: '✅', text: `Category: ${result.category}`, status: 'done' });
    const step2 = activity.addStep({ icon: '🔍', text: 'Searching local professionals...', status: 'active' });
    chatWindow.addMessage({ id: generateId(), sender: 'agent', text: result.messageToUser });
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
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: "I found these highly-rated professionals nearby. I'm contacting the top 3 now." 
    });
    
    // Display cards
    const cardsContainer = document.createElement('div');
    cardsContainer.style.margin = '12px 0';
    createContractorCards(contractors.slice(0, 3), cardsContainer);
    chatWindow.addCustomElement(cardsContainer);
    
    // Add Negotiation Button
    const btnContainer = document.createElement('div');
    btnContainer.innerHTML = `<button class="btn-primary fade-in" style="margin-top: 8px;">🤖 Negotiate with top 3</button>`;
    chatWindow.addCustomElement(btnContainer);
    
    let negotiationStarted = false;
    const startNegotiation = async (btn, specificContractor = null) => {
      if (negotiationStarted) return;
      negotiationStarted = true;
      btn.disabled = true;
      btn.innerHTML = 'Negotiating...';
      btn.style.opacity = '0.7';
      const contractorsToNegotiate = specificContractor ? [specificContractor] : contractors;
      await startNegotiationFlow(contractorsToNegotiate, urgency);
    };

    btnContainer.querySelector('button').addEventListener('click', (e) => startNegotiation(e.target));

    cardsContainer.addEventListener('contractor-selected', (e) => {
      showContractorDetailModal(e.detail.contractor, () => {
        const btn = btnContainer.querySelector('button');
        startNegotiation(btn, e.detail.contractor);
      });
    });

    const autoNegotiationButton = btnContainer.querySelector('button');
    startNegotiation(autoNegotiationButton);
  }
  
  async function startNegotiationFlow(contractors, urgency) {
    chatWindow.scrollToBottom();
    
    chatWindow.addMessage({ 
      id: generateId(), 
      sender: 'agent', 
      text: `Negotiation has started with ${Math.min(3, contractors.length)} agents. If you want to see details, go to the Messages.` 
    });
    
    const mcToggle = document.querySelector('.mc-toggle');
    if (mcToggle) {
      mcToggle.style.animation = 'none';
      setTimeout(() => mcToggle.style.animation = 'pulse 1s 3', 50);
    }
    
    const gen = negotiateAndBook(contractors, { urgency });
    let finalBooking = null;
    
    try {
      for await (const state of gen) {
        if (state.step === 'booked') {
          finalBooking = state.booking;
        }
      }
    } catch (error) {
      chatWindow.addMessage({ id: generateId(), sender: 'agent', text: error.message || 'Negotiation failed.' });
      return;
    }
    
    if (finalBooking) {
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
      
      chatWindow.addMessage({ 
        id: generateId(), 
        sender: 'agent', 
        text: `The final price is negotiated in between these three contractors to $${finalBooking.negotiatedPrice} with ${finalBooking.contractor.name}. Do you want to accept the offer?` 
      });
      
      await wait(1000);

      const calendarContainer = document.createElement('div');
      calendarContainer.style.display = 'flex';
      calendarContainer.style.flexWrap = 'wrap';
      calendarContainer.style.gap = '8px';
      calendarContainer.style.marginTop = '12px';

      const slots = ['Today, 2:00 PM', 'Today, 4:00 PM', 'Tomorrow, 10:00 AM', 'Tomorrow, 1:00 PM'];
      
      slots.forEach(slot => {
        const btn = document.createElement('button');
        btn.className = 'btn-primary';
        btn.style.flex = '1 1 calc(50% - 8px)';
        btn.style.background = 'white';
        btn.style.color = 'var(--accent-primary)';
        btn.style.border = '1px solid var(--accent-primary)';
        btn.innerHTML = `📅 ${slot}`;
        
        btn.addEventListener('click', async () => {
          // Disable all buttons
          Array.from(calendarContainer.querySelectorAll('button')).forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
          });
          btn.style.background = 'var(--accent-primary)';
          btn.style.color = 'white';
          btn.innerHTML = 'Booking...';

          finalBooking.date = slot.split(',')[0];
          finalBooking.time = slot.split(',')[1].trim();

          try {
            await finalizeBooking(finalBooking.contractor.id, finalBooking.date, finalBooking.time);
          } catch (error) {
            console.error("Booking finalization failed:", error);
          }

          chatWindow.addMessage({
            id: generateId(),
            sender: 'agent',
            text: `Awesome! I've booked your appointment for ${slot}. A calendar invite has been sent to you and the contractor.`
          });

          bookingConfirm.show(finalBooking);
        });

        calendarContainer.appendChild(btn);
      });

      chatWindow.addCustomElement(calendarContainer);
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

  // Category Selection
  appContainer.addEventListener('category-selected', async (e) => {
    const query = e.detail.query;
    await wait(500);
    processUserInput(query);
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
  voiceContainer.addEventListener('voice-trigger', () => {
    voiceModal.open();
  });

  voiceModal.on('voice-result', (e) => {
    const { transcript } = e.detail;
    if (transcript) {
      processUserInput(transcript);
    }
  });
});
