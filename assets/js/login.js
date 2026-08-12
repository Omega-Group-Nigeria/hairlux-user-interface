/**
 * HairLux Login Page Handler
 * Handles login form submission and authentication
 */

(function() {
  'use strict';

  // Wait for DOM to be fully loaded
  document.addEventListener('DOMContentLoaded', function() {
    
    // Get form elements
    const loginForm = document.getElementById('wf-form-Sign-In');
    
    if (!loginForm) {
      console.error('Login form not found');
      return;
    }

    const passwordInput = document.getElementById('Password-2');
    const togglePasswordBtn = document.getElementById('toggle-login-password');
    const eyeIconLogin = document.getElementById('eye-icon-login');

    // Prefill email when arriving from the "create an account" / login redirects.
    const urlEmail = (UIHelper.getQueryParam('email') || '').trim();
    if (urlEmail) {
      const emailInputEl = document.getElementById('Email-7');
      if (emailInputEl && !emailInputEl.value) emailInputEl.value = urlEmail;
    }

    if (togglePasswordBtn && passwordInput && eyeIconLogin) {
      togglePasswordBtn.addEventListener('click', function () {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;

        if (type === 'text') {
          eyeIconLogin.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle><line x1="1" y1="1" x2="23" y2="23"></line>';
        } else {
          eyeIconLogin.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        }
      });
    }

    const authNotice = sessionStorage.getItem('hairlux_auth_notice');
    if (authNotice) {
      if (authNotice === 'logged-out') {
        UIHelper.showToast('You have been logged out.', 'info');
      } else if (authNotice === 'session-expired') {
        UIHelper.showToast('Session expired. Please log in again.', 'info');
      }
      sessionStorage.removeItem('hairlux_auth_notice');
    }

    // If already authenticated, attempt a quick refresh and continue to app
    if (APIHelper.isAuthenticated()) {
      AuthAPI.refreshToken()
        .then(() => UIHelper.redirect('app/index.html'))
        .catch(() => APIHelper.clearAuth());
    }

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      // Get form data
      const emailInput = document.getElementById('Email-7');
      const submitButton = loginForm.querySelector('input[type="submit"]');

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      // Validation
      if (!email || !password) {
        UIHelper.showToast('Please fill in all fields', 'error');
        return;
      }

      if (!UIHelper.isValidEmail(email)) {
        UIHelper.showToast('Please enter a valid email address', 'error');
        return;
      }

      // Show loading state
      UIHelper.setButtonLoading(submitButton, true);

      try {
        // Call login API for the USER (customer) account.
        const response = await AuthAPI.login({
          email: email,
          password: password,
          type: 'USER'
        });

        UIHelper.showToast(response.message || 'Login successful!', 'success');

        // Route the UI from the response, not from the requested type.
        const data = response && response.data ? response.data : response;
        const user = data && data.user ? data.user : {};
        const { role, roles = [] } = user;
        // USER → normal customer UI; if roles includes "STAFF", staff views may also be unlocked.
        console.log('Login successful:', { role, roles }, data);

        setTimeout(() => {
          UIHelper.redirect('app/index.html');
        }, 700);

      } catch (error) {
        console.error('Login error:', error);
        
        // Show error alert
        let errorMessage = 'Login failed. Please try again.';
        
        if (error.status === 401) {
          // Check for specific inactive account message
          if (error.message === 'Your account is inactive. Please contact support.') {
            errorMessage = error.message;
          } else if (error.message === 'Please verify your email before logging in. Check your email for the OTP code.') {
             // Show OTP modal and stop error flow
             showOtpModal(email);
             return; 
          } else if ((error.message || '').toLowerCase().indexOf('no user account exists for this email') !== -1) {
            // No USER account for this email → don't imply a wrong password.
            // Show a "create one" CTA instead.
            showNoAccountCta(email);
            return;
          } else {
            errorMessage = 'Invalid email or password';
          }
        } else if (error.status === 0) {
          errorMessage = 'Network error. Please check your connection.';
        } else if (error.message) {
          errorMessage = error.message;
        }

        UIHelper.showToast(errorMessage, 'error');
        
      } finally {
        // Remove loading state
        UIHelper.setButtonLoading(submitButton, false);
      }
    });

    /* ── OTP Modal Logic ───────────────────────────────────────────────────── */
    const otpModal      = document.getElementById('hl-otp-modal');
    const otpCloseBtn   = document.getElementById('hl-otp-close-btn');
    const otpVerifyBtn  = document.getElementById('hl-otp-verify-btn');
    const otpResendBtn  = document.getElementById('hl-otp-resend-btn');
    const otpCodeInput  = document.getElementById('hl-otp-code');
    const otpEmailDisp  = document.getElementById('hl-otp-email-display');
    const otpMsg        = document.getElementById('hl-otp-msg');
    const otpCountdown  = document.getElementById('hl-otp-countdown');

    var _otpEmail        = '';
    var _otpTimerHandle  = null;
    var _otpSecondsLeft  = 60;

    if (otpModal) {
      otpModal.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    if (otpCloseBtn) {
      otpCloseBtn.addEventListener('click', function() {
        closeOtpModal();
      });
    }

    if (otpCodeInput) {
      otpCodeInput.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 6);
        setOtpMsg('', '');
      });
      otpCodeInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') otpVerifyBtn && otpVerifyBtn.click();
      });
    }

    if (otpVerifyBtn) {
      otpVerifyBtn.addEventListener('click', async function() {
        const code = (otpCodeInput ? otpCodeInput.value : '').trim();
        if (!code || code.length < 4) {
          setOtpMsg('Please enter the OTP code from your email.', 'error');
          return;
        }

        otpVerifyBtn.disabled    = true;
        otpVerifyBtn.textContent = 'Verifying…';
        setOtpMsg('', '');

        try {
          await AuthAPI.verifyOtp({ email: _otpEmail, otpCode: code });
          setOtpMsg('Email verified! taking you to dashboard...', 'success');
          clearOtpTimer();
          setTimeout(function() {
            closeOtpModal();
            UIHelper.redirect('app/index.html');
          }, 1000);
        } catch (err) {
          const msg = (err && err.message) ? err.message : 'Invalid or expired OTP. Please try again.';
          setOtpMsg(msg, 'error');
          otpVerifyBtn.disabled    = false;
          otpVerifyBtn.textContent = 'Verify & Continue';
        }
      });
    }

    if (otpResendBtn) {
      otpResendBtn.addEventListener('click', async function() {
        if (otpResendBtn.disabled) return;
        otpResendBtn.disabled = true;
        setOtpMsg('', '');

        try {
          await AuthAPI.resendOtp(_otpEmail);
          setOtpMsg('A new OTP has been sent to your email.', 'success');
          if (otpCodeInput) otpCodeInput.value = '';
          startOtpTimer();
        } catch (err) {
          const msg = (err && err.message) ? err.message : 'Could not resend OTP. Please try again.';
          setOtpMsg(msg, 'error');
          otpResendBtn.disabled = false;
        }
      });
    }

    function showOtpModal(email) {
      _otpEmail = email;
      if (otpEmailDisp) otpEmailDisp.textContent = email;
      if (otpCodeInput) otpCodeInput.value = '';
      setOtpMsg('', '');
      if (otpVerifyBtn) { otpVerifyBtn.disabled = false; otpVerifyBtn.textContent = 'Verify & Continue'; }
      if (otpModal) {
        otpModal.style.display = 'flex'; // Override inline style from HTML
        otpModal.classList.add('hl-otp-open');
      }
      if (otpCodeInput) setTimeout(function() { otpCodeInput.focus(); }, 120);
      startOtpTimer();
    }

    function closeOtpModal() {
      if (otpModal) {
        otpModal.classList.remove('hl-otp-open');
        otpModal.style.display = 'none';
      }
      clearOtpTimer();
    }

    // Show an inline "no account — create one" CTA inside the login form.
    function showNoAccountCta(email) {
      const existing = document.getElementById('hl-no-account-cta');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      const banner = document.createElement('div');
      banner.id = 'hl-no-account-cta';
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'margin:0 0 18px;background:#fdf3ec;border:1px solid #edc9a8;border-radius:12px;padding:16px 18px;text-align:center;';

      const title = document.createElement('p');
      title.style.cssText = 'margin:0 0 6px;font-size:14px;font-weight:600;color:#7a4a1d;';
      title.textContent = 'No user account exists for this email.';

      const sub = document.createElement('p');
      sub.style.cssText = 'margin:0 0 14px;font-size:13px;color:#8a5a2a;';
      sub.textContent = 'Create a customer account to start booking with HairLux.';

      const link = document.createElement('a');
      link.href = 'sign-up.html' + (email ? '?email=' + encodeURIComponent(email) : '');
      link.textContent = 'Create an account';
      link.style.cssText = 'display:inline-block;background:#2d3622;color:#fff;border-radius:100px;padding:11px 24px;font-size:13px;font-weight:600;text-decoration:none;';

      banner.appendChild(title);
      banner.appendChild(sub);
      banner.appendChild(link);

      const formGap = loginForm.querySelector('.form-gap');
      const submitBtn = loginForm.querySelector('input[type="submit"]');
      if (formGap) {
        formGap.insertBefore(banner, formGap.firstChild);
      } else if (submitBtn && submitBtn.parentNode) {
        submitBtn.parentNode.insertBefore(banner, submitBtn);
      } else {
        loginForm.insertBefore(banner, loginForm.firstChild);
      }

      if (banner.scrollIntoView) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function startOtpTimer() {
      clearOtpTimer();
      _otpSecondsLeft = 60;
      if (otpCountdown) otpCountdown.textContent = _otpSecondsLeft;
      if (otpResendBtn) {
        otpResendBtn.disabled    = true;
        otpResendBtn.textContent = 'Resend OTP (' + _otpSecondsLeft + 's)';
      }
      _otpTimerHandle = setInterval(function() {
        _otpSecondsLeft -= 1;
        if (otpCountdown) otpCountdown.textContent = _otpSecondsLeft;
        if (otpResendBtn) otpResendBtn.textContent = 'Resend OTP (' + _otpSecondsLeft + 's)';
        if (_otpSecondsLeft <= 0) {
          clearOtpTimer();
          if (otpResendBtn) {
            otpResendBtn.disabled    = false;
            otpResendBtn.textContent = 'Resend OTP';
          }
        }
      }, 1000);
    }

    function clearOtpTimer() {
      if (_otpTimerHandle) { clearInterval(_otpTimerHandle); _otpTimerHandle = null; }
    }

    function setOtpMsg(text, type) {
      if (!otpMsg) return;
      otpMsg.textContent = text;
      otpMsg.className   = 'hl-otp-msg' + (type ? ' ' + type : '');
      otpMsg.style.display = text ? 'block' : 'none';
    }

  });

})();
