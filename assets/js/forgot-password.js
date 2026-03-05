/**
 * HairLux Forgot Password Page Handler
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('wf-form-Forgot-Password');
    const emailInput = document.getElementById('forgot-email');

    if (!form || !emailInput) {
      console.error('Forgot password form not found');
      return;
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const email = emailInput.value.trim();
      const submitButton = form.querySelector('input[type="submit"]');

      if (!email) {
        UIHelper.showToast('Please enter your email address.', 'error');
        return;
      }

      if (!UIHelper.isValidEmail(email)) {
        UIHelper.showToast('Please enter a valid email address.', 'error');
        return;
      }

      UIHelper.setButtonLoading(submitButton, true);

      try {
        const response = await AuthAPI.forgotPassword(email);
        UIHelper.showToast(response.message || 'Reset link sent. Check your email.', 'success', 3600);
        form.reset();
      } catch (error) {
        let message = 'Unable to process request. Please try again.';

        if (error.status === 0) {
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
