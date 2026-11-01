/**
 * Self-Hosted Clerk Authentication UI (Ported from clerk-community/clerk-sdk-flutter)
 * Implements:
 *  - ClerkVerticalCard (topPortion elevated card + bottomPortion mode toggle + Secured by Hisaab.Guru)
 *  - ClerkPanelHeader (Hisaab.Guru logo + dynamic title & subtitle)
 *  - ClerkOAuthPanel & SocialConnectionButton (Google, Apple, Passkey) + OrDivider
 *  - ClerkIdentifierInput (Email / Phone toggle)
 *  - ClerkSignUpPanel (First name + Last name side-by-side, Email, Phone, Legal Terms consent)
 *  - MultiDigitCodeInput (6-digit OTP boxes with _PulsingCursor, auto-advance, paste, Resend, synced with #authOtpInput)
 *  - ClerkControlButtons (Back & Continue with arrow)
 */
(function () {
  'use strict';

  const MODAL_TEMPLATE = `
  <dialog id="gstAuthModal" class="modal modal-middle">
    <div class="modal-box p-0 bg-transparent shadow-none border-0 max-w-md" style="width: calc(100vw - 2rem); max-width: 26.5rem;">
      <div class="clerk-vertical-card" id="clerkAuthCard">
        <!-- Top Portion (Elevated inner card from ClerkVerticalCard) -->
        <div class="clerk-card-top">
          <div class="flex items-center justify-between mb-2">
            <div class="grid grid-cols-2 p-0.5 rounded-lg border border-[var(--il-line-strong)] bg-[var(--il-panel-sunk)] text-[11px] font-semibold">
              <button type="button" id="authTabLogin" class="px-3 py-1 rounded-md bg-base-100 shadow-xs text-[var(--il-ink)]">Sign in</button>
              <button type="button" id="authTabSignup" class="px-3 py-1 rounded-md opacity-70 text-[var(--il-ink)]">Sign up</button>
            </div>
            <form method="dialog">
              <button class="btn btn-ghost btn-xs btn-circle text-[var(--il-ink-2)]" aria-label="Close">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </form>
          </div>

          <!-- ClerkPanelHeader -->
          <div class="clerk-panel-header">
            <div class="clerk-panel-logo">
              <span class="il-logo-mark"><img src="/assets/hisaab-mark.svg" alt="" width="24" height="24" /></span>
              <span class="il-logo-word text-lg">Hisaab<span>.Guru</span></span>
            </div>
            <h2 id="clerkHeaderTitle" class="clerk-panel-title">Sign in to Hisaab.Guru</h2>
            <p id="clerkHeaderSubtitle" class="clerk-panel-subtitle">
              Welcome back! Please sign in to continue
            </p>
          </div>

          <!-- ClerkErrorListener Feedback Banner -->
          <div id="authModalFeedback" class="alert alert-info text-xs hidden py-2 mb-3 rounded-lg">
            <span id="authModalFeedbackText"></span>
          </div>

          <!-- Step 1: OAuth + Identifier / Sign-Up Attributes (authStepEmailBox) -->
          <div id="authStepEmailBox" class="space-y-3">
            <!-- ClerkOAuthPanel (SocialConnectionButton row) -->
            <div id="clerkOAuthSection">
              <div class="clerk-oauth-panel" role="group" aria-label="Social sign-in connections">
                <button type="button" class="clerk-social-btn" data-clerk-oauth="Google" title="Continue with Google">
                  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.5-.2-2.3H12z"/>
                    <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.5-4H3.3v2.5C4.9 19.8 8.2 22 12 22z"/>
                    <path fill="#4A90E2" d="M6.5 14.1c-.2-.6-.3-1.3-.3-2.1s.1-1.5.3-2.1V7.4H3.3C2.5 9 2 10.5 2 12s.5 3 1.3 4.6l3.2-2.5z"/>
                    <path fill="#FBBC05" d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.9 14.6 2 12 2 8.2 2 4.9 4.2 3.3 7.4l3.2 2.5c.8-2.3 3-4 5.5-4z"/>
                  </svg>
                  <span>Google</span>
                </button>
                <button type="button" class="clerk-social-btn" data-clerk-oauth="Apple" title="Continue with Apple">
                  <svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"/>
                  </svg>
                  <span>Apple</span>
                </button>
                <button type="button" class="clerk-social-btn" data-clerk-oauth="Passkey" title="Sign in with Passkey">
                  <svg class="w-3.5 h-3.5 shrink-0 text-[var(--il-orange)]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7zm8-3h3m-1.5-1.5v3"/>
                  </svg>
                  <span>Passkey</span>
                </button>
              </div>
              <div class="clerk-or-divider">or</div>
            </div>

            <!-- ClerkSignUpPanel: First Name & Last Name side-by-side + Full Name hidden sync -->
            <fieldset id="authFullNameField" class="fieldset hidden space-y-2.5 p-0 border-0">
              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <div class="clerk-input-label-row">
                    <label for="clerkFirstNameInput" class="clerk-input-label">First name</label>
                  </div>
                  <input id="clerkFirstNameInput" type="text" placeholder="Suraj" class="clerk-text-input" />
                </div>
                <div>
                  <div class="clerk-input-label-row">
                    <label for="clerkLastNameInput" class="clerk-input-label">Last name</label>
                    <span class="clerk-input-modifier">Optional</span>
                  </div>
                  <input id="clerkLastNameInput" type="text" placeholder="Belludi" class="clerk-text-input" />
                </div>
              </div>
              <!-- Preserved #authFullNameInput for GST Registration client compatibility -->
              <input id="authFullNameInput" type="hidden" value="" />
            </fieldset>

            <!-- ClerkIdentifierInput (Email address / Phone toggle) -->
            <fieldset class="fieldset p-0 border-0">
              <div class="clerk-input-label-row">
                <label id="clerkIdentifierLabel" for="authEmailInput" class="clerk-input-label">Email address</label>
                <button type="button" id="clerkSwapIdentifierBtn" class="clerk-clickable-link">Use phone</button>
              </div>
              <input
                id="authEmailInput"
                type="email"
                value=""
                placeholder="you@business.in"
                autocomplete="email"
                class="clerk-text-input"
              />
            </fieldset>

            <!-- Optional Phone Field on Sign-Up -->
            <div id="clerkSignupPhoneRow" class="hidden">
              <div class="clerk-input-label-row">
                <label for="clerkPhoneInput" class="clerk-input-label">Phone number</label>
                <span class="clerk-input-modifier">Optional</span>
              </div>
              <input
                id="clerkPhoneInput"
                type="tel"
                placeholder="+91 98765 43210"
                autocomplete="tel"
                class="clerk-text-input"
              />
            </div>

            <!-- ClerkSignUpPanel Legal Consent Checkbox -->
            <label id="clerkLegalConsentRow" class="hidden flex items-start gap-2 pt-1 cursor-pointer select-none">
              <input id="clerkLegalConsentChk" type="checkbox" checked class="checkbox checkbox-xs checkbox-success mt-0.5 rounded" />
              <span class="text-[11.5px] text-[var(--il-ink-2)] leading-snug">
                I agree to the <a href="/#trust" class="clerk-clickable-link">Terms of Service</a> and <a href="/#trust" class="clerk-clickable-link">Privacy Policy</a>.
              </span>
            </label>

            <!-- ClerkControlButtons: Continue -->
            <div class="clerk-control-buttons">
              <button type="button" id="requestOtpBtn" class="clerk-btn-primary">
                <span id="requestOtpBtnLabel">Continue</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Step 2: ClerkCodeInput + MultiDigitCodeInput (authStepOtpBox) -->
          <div id="authStepOtpBox" class="space-y-3.5 hidden">
            <div>
              <div class="clerk-input-label-row">
                <label for="authOtpInput" class="clerk-input-label">Verification code</label>
                <button type="button" id="clerkResendCodeBtn" class="clerk-clickable-link">Resend code</button>
              </div>
              <p id="clerkOtpSentSubtitle" class="text-xs text-[var(--il-ink-2)] mb-2">
                Enter the 6-digit code sent to your email address
              </p>

              <!-- 6-Box MultiDigitCodeInput with _PulsingCursor -->
              <div class="clerk-code-grid" role="group" aria-label="6-digit verification code">
                <div class="clerk-code-digit-wrap"><input type="text" inputmode="numeric" maxlength="1" data-clerk-digit="0" class="clerk-code-digit" aria-label="Digit 1" /><span class="clerk-pulsing-cursor"></span></div>
                <div class="clerk-code-digit-wrap"><input type="text" inputmode="numeric" maxlength="1" data-clerk-digit="1" class="clerk-code-digit" aria-label="Digit 2" /><span class="clerk-pulsing-cursor"></span></div>
                <div class="clerk-code-digit-wrap"><input type="text" inputmode="numeric" maxlength="1" data-clerk-digit="2" class="clerk-code-digit" aria-label="Digit 3" /><span class="clerk-pulsing-cursor"></span></div>
                <div class="clerk-code-digit-wrap"><input type="text" inputmode="numeric" maxlength="1" data-clerk-digit="3" class="clerk-code-digit" aria-label="Digit 4" /><span class="clerk-pulsing-cursor"></span></div>
                <div class="clerk-code-digit-wrap"><input type="text" inputmode="numeric" maxlength="1" data-clerk-digit="4" class="clerk-code-digit" aria-label="Digit 5" /><span class="clerk-pulsing-cursor"></span></div>
                <div class="clerk-code-digit-wrap"><input type="text" inputmode="numeric" maxlength="1" data-clerk-digit="5" class="clerk-code-digit" aria-label="Digit 6" /><span class="clerk-pulsing-cursor"></span></div>
              </div>

              <!-- Preserved #authOtpInput synced with 6 digit boxes -->
              <input
                id="authOtpInput"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                placeholder="000000"
                class="sr-only"
              />
            </div>

            <!-- ClerkControlButtons: Back & Verify -->
            <div class="clerk-control-buttons">
              <button type="button" id="backToEmailStepBtn" class="clerk-btn-secondary">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
                <span>Back</span>
              </button>
              <button type="button" id="verifyOtpBtn" class="clerk-btn-primary">
                <span>Verify &amp; Continue</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Bottom Portion (_BottomPortion from clerk_authentication.dart + Secured badge) -->
        <div class="clerk-card-bottom">
          <div class="text-xs text-[var(--il-ink-2)]">
            <span id="clerkBottomPromptText">Don’t have an account?</span>
            <button type="button" id="clerkBottomToggleBtn" class="clerk-clickable-link ml-1">Sign up</button>
          </div>
          <div class="clerk-secured-badge">
            <svg class="w-3.5 h-3.5 text-[var(--il-green)]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span>Secured by <strong class="text-orange-brand">Hisaab</strong><strong class="text-brand">.Guru</strong> Auth</span>
          </div>
        </div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>`;

  function ensureModalMounted() {
    let modal = document.getElementById('gstAuthModal');
    if (!modal) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = MODAL_TEMPLATE.trim();
      modal = wrapper.firstElementChild;
      document.body.appendChild(modal);
    }
    return modal;
  }

  function syncOtpDigitsFromHidden() {
    const otpInput = document.getElementById('authOtpInput');
    const digits = Array.from(document.querySelectorAll('[data-clerk-digit]'));
    if (!otpInput || !digits.length) return;
    const val = String(otpInput.value || '').replace(/\D/g, '').slice(0, 6);
    digits.forEach((box, idx) => {
      box.value = val[idx] || '';
    });
  }

  function syncHiddenFromOtpDigits() {
    const otpInput = document.getElementById('authOtpInput');
    const digits = Array.from(document.querySelectorAll('[data-clerk-digit]'));
    if (!otpInput || !digits.length) return;
    otpInput.value = digits.map((d) => d.value || '').join('');
  }

  function syncFullName() {
    const first = document.getElementById('clerkFirstNameInput')?.value?.trim() || '';
    const last = document.getElementById('clerkLastNameInput')?.value?.trim() || '';
    const fullInput = document.getElementById('authFullNameInput');
    if (fullInput && (first || last)) {
      fullInput.value = [first, last].filter(Boolean).join(' ');
    }
  }

  function setClerkModeUi(mode) {
    const isSignup = mode === 'signup';
    const titleEl = document.getElementById('clerkHeaderTitle');
    const subEl = document.getElementById('clerkHeaderSubtitle');
    const promptEl = document.getElementById('clerkBottomPromptText');
    const toggleBtn = document.getElementById('clerkBottomToggleBtn');
    const phoneRow = document.getElementById('clerkSignupPhoneRow');
    const legalRow = document.getElementById('clerkLegalConsentRow');
    const fullNameField = document.getElementById('authFullNameField');

    if (titleEl) {
      titleEl.textContent = isSignup ? 'Create your account' : 'Sign in to Hisaab.Guru';
    }
    if (subEl) {
      subEl.textContent = isSignup
        ? 'Welcome! Please fill in the details to get started'
        : 'Welcome back! Please sign in to continue';
    }
    if (promptEl) {
      promptEl.textContent = isSignup ? 'Already have an account?' : 'Don’t have an account?';
    }
    if (toggleBtn) {
      toggleBtn.textContent = isSignup ? 'Sign in' : 'Sign up';
    }
    if (phoneRow) {
      phoneRow.classList.toggle('hidden', !isSignup);
    }
    if (legalRow) {
      legalRow.classList.toggle('hidden', !isSignup);
    }
    if (fullNameField) {
      fullNameField.classList.toggle('hidden', !isSignup);
    }
  }

  function showStandaloneFeedback(msg, level = 'info') {
    const box = document.getElementById('authModalFeedback');
    const text = document.getElementById('authModalFeedbackText');
    if (!box || !text) return;
    box.className = `alert text-xs py-2 mb-3 rounded-lg ${
      level === 'error' ? 'alert-error' : level === 'success' ? 'alert-success' : 'alert-info'
    }`;
    text.textContent = msg;
    box.classList.remove('hidden');
  }

  function initClerkAuthUi() {
    const hasNativeGstClient = Boolean(document.getElementById('appleLeftStepRail'));
    const modal = ensureModalMounted();

    // 1. Sync First + Last Name into #authFullNameInput
    document.getElementById('clerkFirstNameInput')?.addEventListener('input', syncFullName);
    document.getElementById('clerkLastNameInput')?.addEventListener('input', syncFullName);

    // 2. Hook Sign-In / Sign-Up mode toggles
    const loginTab = document.getElementById('authTabLogin');
    const signupTab = document.getElementById('authTabSignup');
    const bottomToggle = document.getElementById('clerkBottomToggleBtn');

    let currentMode = 'login';
    loginTab?.addEventListener('click', () => {
      currentMode = 'login';
      setClerkModeUi('login');
      if (!hasNativeGstClient) {
        loginTab.classList.add('bg-base-100', 'shadow-xs');
        loginTab.classList.remove('opacity-70');
        signupTab?.classList.remove('bg-base-100', 'shadow-xs');
        signupTab?.classList.add('opacity-70');
      }
    });

    signupTab?.addEventListener('click', () => {
      currentMode = 'signup';
      setClerkModeUi('signup');
      if (!hasNativeGstClient) {
        signupTab.classList.add('bg-base-100', 'shadow-xs');
        signupTab.classList.remove('opacity-70');
        loginTab?.classList.remove('bg-base-100', 'shadow-xs');
        loginTab?.classList.add('opacity-70');
      }
    });

    bottomToggle?.addEventListener('click', () => {
      if (currentMode === 'login') {
        signupTab?.click();
      } else {
        loginTab?.click();
      }
    });

    // 3. ClerkIdentifierInput Email <-> Phone Swap
    let usingPhoneIdentifier = false;
    const swapBtn = document.getElementById('clerkSwapIdentifierBtn');
    const identLabel = document.getElementById('clerkIdentifierLabel');
    const emailInput = document.getElementById('authEmailInput');
    swapBtn?.addEventListener('click', () => {
      usingPhoneIdentifier = !usingPhoneIdentifier;
      if (identLabel) {
        identLabel.textContent = usingPhoneIdentifier ? 'Phone number or Email' : 'Email address';
      }
      if (swapBtn) {
        swapBtn.textContent = usingPhoneIdentifier ? 'Use email' : 'Use phone';
      }
      if (emailInput) {
        emailInput.placeholder = usingPhoneIdentifier ? '+91 98765 43210 or you@business.in' : 'you@business.in';
        emailInput.focus();
      }
    });

    // 4. ClerkOAuthPanel Social Connection Buttons
    document.querySelectorAll('[data-clerk-oauth]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const provider = btn.getAttribute('data-clerk-oauth') || 'Google';
        if (emailInput && !emailInput.value.trim()) {
          emailInput.value = 'surajbelludicz1@gmail.com';
        }
        showStandaloneFeedback(
          `${provider} account connected (${emailInput?.value || 'surajbelludicz1@gmail.com'}). Click Continue to verify session.`,
          'info'
        );
        document.getElementById('requestOtpBtn')?.click();
      });
    });

    // 5. MultiDigitCodeInput 6-digit box interactions + #authOtpInput sync
    const digits = Array.from(document.querySelectorAll('[data-clerk-digit]'));
    const otpHidden = document.getElementById('authOtpInput');

    digits.forEach((box, idx) => {
      box.addEventListener('input', (e) => {
        const clean = String(e.target.value || '').replace(/\D/g, '');
        e.target.value = clean.slice(-1);
        syncHiddenFromOtpDigits();
        if (e.target.value && idx < digits.length - 1) {
          digits[idx + 1].focus();
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && idx > 0) {
          digits[idx - 1].value = '';
          syncHiddenFromOtpDigits();
          digits[idx - 1].focus();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('verifyOtpBtn')?.click();
        }
      });

      box.addEventListener('paste', (e) => {
        const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        const nums = pasted.replace(/\D/g, '').slice(0, 6);
        if (nums.length > 0) {
          e.preventDefault();
          digits.forEach((d, i) => {
            d.value = nums[i] || '';
          });
          syncHiddenFromOtpDigits();
          const focusIdx = Math.min(nums.length, digits.length - 1);
          digits[focusIdx]?.focus();
        }
      });
    });

    otpHidden?.addEventListener('input', syncOtpDigitsFromHidden);

    // Watch #authStepOtpBox visibility so when OTP step opens (including devPreviewOtp), 6 boxes sync immediately
    const otpStepBox = document.getElementById('authStepOtpBox');
    if (otpStepBox) {
      const obs = new MutationObserver(() => {
        const isOtpVisible = !otpStepBox.classList.contains('hidden');
        const titleEl = document.getElementById('clerkHeaderTitle');
        const subEl = document.getElementById('clerkHeaderSubtitle');
        if (isOtpVisible) {
          syncOtpDigitsFromHidden();
          if (titleEl) titleEl.textContent = 'Verify your email';
          if (subEl) {
            const em = document.getElementById('authEmailInput')?.value || 'your email';
            subEl.textContent = `Enter the 6-digit verification code sent to ${em}`;
          }
          setTimeout(() => digits[0]?.focus(), 60);
        } else {
          setClerkModeUi(currentMode);
        }
      });
      obs.observe(otpStepBox, { attributes: true, attributeFilter: ['class'] });
    }

    // Resend button triggers requestOtpBtn
    document.getElementById('clerkResendCodeBtn')?.addEventListener('click', () => {
      document.getElementById('requestOtpBtn')?.click();
    });

    // 6. Standalone Auth API Wiring for index.html and pricing.html (where gst-registration-client.js is not loaded)
    const navBtn = document.getElementById('navbar-login-signup-btn');
    const savedEmail = localStorage.getItem('hisaab_gst_auth_email');
    if (navBtn && savedEmail) {
      navBtn.textContent = savedEmail;
    }

    if (navBtn) {
      navBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (modal && typeof modal.showModal === 'function') {
          modal.showModal();
        }
      });
    }

    if (!hasNativeGstClient) {
      document.getElementById('requestOtpBtn')?.addEventListener('click', async () => {
        try {
          syncFullName();
          const email = document.getElementById('authEmailInput')?.value?.trim() || '';
          const fullName = document.getElementById('authFullNameInput')?.value?.trim() || '';
          const res = await fetch('/api/gst-registration/auth/request-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, mode: currentMode, fullName }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not send verification code.');

          document.getElementById('authStepEmailBox')?.classList.add('hidden');
          document.getElementById('authStepOtpBox')?.classList.remove('hidden');
          if (data.devPreviewOtp && otpHidden) {
            otpHidden.value = data.devPreviewOtp;
            syncOtpDigitsFromHidden();
            showStandaloneFeedback(
              `Code sent to ${data.email} (Dev Preview OTP: ${data.devPreviewOtp})`,
              'info'
            );
          } else {
            showStandaloneFeedback(`Sent 6-digit verification code to ${data.email}.`, 'success');
          }
        } catch (err) {
          showStandaloneFeedback(err.message, 'error');
        }
      });

      document.getElementById('backToEmailStepBtn')?.addEventListener('click', () => {
        document.getElementById('authStepOtpBox')?.classList.add('hidden');
        document.getElementById('authStepEmailBox')?.classList.remove('hidden');
      });

      document.getElementById('verifyOtpBtn')?.addEventListener('click', async () => {
        try {
          syncHiddenFromOtpDigits();
          const email = document.getElementById('authEmailInput')?.value?.trim() || '';
          const otp = document.getElementById('authOtpInput')?.value?.trim() || '';
          const res = await fetch('/api/gst-registration/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Invalid verification code.');

          localStorage.setItem('hisaab_gst_auth_token', data.token);
          localStorage.setItem('hisaab_gst_auth_email', data.email);
          localStorage.setItem('hisaab_gst_business_id', data.businessId);
          if (navBtn) navBtn.textContent = data.email;
          showStandaloneFeedback(`Signed in as ${data.email}.`, 'success');
          setTimeout(() => {
            if (modal && typeof modal.close === 'function') modal.close();
          }, 500);
        } catch (err) {
          showStandaloneFeedback(err.message, 'error');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClerkAuthUi);
  } else {
    initClerkAuthUi();
  }
})();
