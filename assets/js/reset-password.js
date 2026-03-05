/**
 * HairLux Reset Password Page Handler
 */

(function () {
  'use strict';

  function togglePassword(input, icon) {
    const nextType = input.type === 'password' ? 'text' : 'password';
    input.type = nextType;

    if (nextType === 'text') {
      icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle><line x1="1" y1="1" x2="23" y2="23"></line>';
    } else {
      icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('wf-form-Reset-Password');
    const passwordInput = document.getElementById('reset-password');
    const confirmInput = document.getElementById('reset-confirm-password');

    const toggleResetBtn = document.getElementById('toggle-reset-password');
    const toggleConfirmBtn = document.getElementById('toggle-reset-confirm-password');
    const eyeIconReset = document.getElementById('eye-icon-reset');
    const eyeIconConfirm = document.getElementById('eye-icon-reset-confirm');

    if (!form || !passwordInput || !confirmInput) {
      console.error('Reset password form not found');
      return;
    }

    const tokenFromUrl = UIHelper.getQueryParam('token') || UIHelper.getQueryParam('resetToken');
    if (!tokenFromUrl) {
      UIHelper.showToast('Invalid reset link. Please request a new password reset email.', 'error', 4500);
    }

    if (toggleResetBtn && eyeIconReset) {
      toggleResetBtn.addEventListener('click', function () {
        togglePassword(passwordInput, eyeIconReset);
      });
    }

    if (toggleConfirmBtn && eyeIconConfirm) {
      toggleConfirmBtn.addEventListener('click', function () {
        togglePassword(confirmInput, eyeIconConfirm);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const token = (UIHelper.getQueryParam('token') || UIHelper.getQueryParam('resetToken') || '').trim();
      const newPassword = passwordInput.value;
      const confirmPassword = confirmInput.value;
      const submitButton = form.querySelector('input[type="submit"]');

      if (!token) {
        UIHelper.showToast('Reset token is required.', 'error');
        return;
      }

      if (!newPassword || !confirmPassword) {
        UIHelper.showToast('Please fill in both password fields.', 'error');
        return;
      }

      const passwordValidation = UIHelper.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        UIHelper.showToast(passwordValidation.message, 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        UIHelper.showToast('Passwords do not match.', 'error');
        return;
      }

      UIHelper.setButtonLoading(submitButton, true);

      try {
        const response = await AuthAPI.resetPassword({ token, newPassword });
        UIHelper.showToast(response.message || 'Password reset successful. Redirecting to login...', 'success', 2600);
        form.reset();

        setTimeout(function () {
          UIHelper.redirect('log-in.html');
        }, 1100);
      } catch (error) {
        let message = 'Unable to reset password. Please try again.';

        if (error.status === 400) {
          message = error.message || 'Invalid or expired reset token.';
        } else if (error.status === 0) {
          message = 'Network issue. Please check your connection.';
        } else if (error.message) {
          message = error.message;
        }

        UIHelper.showToast(message, 'error');
      } finally {
        UIHelper.setButtonLoading(submitButton, false);
      }
    });
  });
})();
