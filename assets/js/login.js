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
        // Call login API
        const response = await AuthAPI.login({
          email: email,
          password: password
        });

        UIHelper.showToast(response.message || 'Login successful!', 'success');
        
        // Log user data for debugging
        console.log('Login successful:', response.data);
        setTimeout(() => {
          UIHelper.redirect('app/index.html');
        }, 700);

      } catch (error) {
        console.error('Login error:', error);
        
        // Show error alert
        let errorMessage = 'Login failed. Please try again.';
        
        if (error.status === 401) {
          errorMessage = 'Invalid email or password';
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

  });

})();
