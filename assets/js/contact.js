/**
 * Hairlux Contact Form API handler
 * Sends sanitized form data to POST /contact
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('hl-contact-form');
    var successBox = document.getElementById('hl-form-success');
    var errorBox = document.getElementById('hl-form-error');
    var submitBtn = document.getElementById('hl-submit-btn');
    var submitBtnDefault = submitBtn ? (submitBtn.textContent || 'Send Message') : 'Send Message';

    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideAlerts();

      var rawName = valueOf('#hl-name');
      var rawEmail = valueOf('#hl-email');
      var rawPhone = valueOf('#hl-phone');
      var rawSubject = valueOf('#hl-subject');
      var rawMessage = valueOf('#hl-message');

      if (!rawName || !rawEmail || !rawMessage) {
        showError('Please fill in your name, email address, and message.');
        return;
      }

      if (!isValidEmail(rawEmail)) {
        showError('Please enter a valid email address.');
        return;
      }

      var name = sanitizeText(rawName, 120);
      var emailAddress = sanitizeEmail(rawEmail);
      var phoneNo = sanitizePhone(rawPhone);
      var subject = sanitizeText(rawSubject, 180) || 'General enquiry';
      var message = sanitizeText(rawMessage, 5000);

      if (name.length < 2) {
        showError('Name looks invalid. Please enter your full name.');
        return;
      }

      if (message.length < 10) {
        showError('Message must be at least 10 characters.');
        return;
      }

      if (containsAttackPayload(rawName + ' ' + rawSubject + ' ' + rawMessage)) {
        showError('Please remove unsupported markup or SQL-like syntax from your input and try again.');
        return;
      }

      var requestBody = {
        name: name,
        emailAddress: emailAddress,
        subject: subject,
        message: message
      };

      if (phoneNo) {
        requestBody.phoneNo = phoneNo;
      }

      var baseUrl = getBaseUrl();
      var url = baseUrl + '/contact';

      setLoading(true);

      try {
        var res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        var payload = await safeJson(res);

        if (res.ok) {
          form.reset();
          showSuccess(payload && payload.message ? payload.message : 'Contact request submitted successfully.');
          return;
        }

        if (res.status === 400) {
          if (payload && Array.isArray(payload.message) && payload.message.length) {
            showError(payload.message.join(', '));
          } else {
            showError((payload && payload.message) || 'Invalid contact details. Please review your inputs.');
          }
          return;
        }

        if (res.status === 429) {
          showError('Too many requests. Please wait a little and try again.');
          return;
        }

        showError((payload && payload.message) || 'Unable to send your message right now. Please try again later.');
      } catch (err) {
        console.error('Contact submit failed:', err);
        showError('Network error. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    });

    function valueOf(selector) {
      var node = form.querySelector(selector);
      return (node && node.value ? node.value : '').trim();
    }

    function getBaseUrl() {
      if (typeof API_CONFIG !== 'undefined' && API_CONFIG && API_CONFIG.BASE_URL) {
        return String(API_CONFIG.BASE_URL).replace(/\/+$/, '');
      }
      return '';
    }

    function sanitizeText(value, maxLen) {
      var text = String(value || '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (typeof maxLen === 'number' && maxLen > 0) {
        text = text.slice(0, maxLen);
      }

      return text;
    }

    function sanitizeEmail(value) {
      return String(value || '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F\s]/g, '')
        .replace(/[<>"'`]/g, '')
        .toLowerCase();
    }

    function sanitizePhone(value) {
      var cleaned = String(value || '').replace(/[^\d+]/g, '');
      if (!cleaned) return '';

      if (cleaned.indexOf('+') > 0) {
        cleaned = '+' + cleaned.replace(/\+/g, '');
      }

      if (cleaned.startsWith('00')) {
        cleaned = '+' + cleaned.slice(2);
      }

      return cleaned.slice(0, 20);
    }

    function containsAttackPayload(value) {
      var txt = String(value || '');
      var sqlPattern = /(\bunion\b\s+\bselect\b|\bdrop\b\s+\btable\b|\binsert\b\s+\binto\b|\bdelete\b\s+\bfrom\b|\bor\b\s+1\s*=\s*1|\band\b\s+1\s*=\s*1|--|\/\*|\*\/)/i;
      var xssPattern = /<\s*script|javascript:|on\w+\s*=|<\s*iframe|<\s*object|<\s*embed/i;
      return sqlPattern.test(txt) || xssPattern.test(txt);
    }

    function isValidEmail(val) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    async function safeJson(res) {
      try {
        return await res.json();
      } catch (_) {
        return null;
      }
    }

    function setLoading(loading) {
      if (!submitBtn) return;
      submitBtn.disabled = !!loading;
      submitBtn.textContent = loading ? 'Sending…' : submitBtnDefault;
    }

    function hideAlerts() {
      if (successBox) successBox.style.display = 'none';
      if (errorBox) errorBox.style.display = 'none';
    }

    function showSuccess(message) {
      if (successBox) {
        var boxText = successBox.querySelector('div');
        if (boxText && message) boxText.textContent = message;
        successBox.style.display = 'block';
        successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (errorBox) errorBox.style.display = 'none';
    }

    function showError(message) {
      if (errorBox) {
        var errorText = errorBox.querySelector('.hl-error-text');
        if (errorText) errorText.textContent = message;
        errorBox.style.display = 'block';
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (successBox) successBox.style.display = 'none';
    }
  });
})();
