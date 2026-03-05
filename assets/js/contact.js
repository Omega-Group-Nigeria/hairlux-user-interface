/**
 * Hairlux Contact Form — Brevo (Sendinblue) SMTP API
 *
 * SETUP (one-time, ~2 minutes):
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Sign up free at https://app.brevo.com  (300 emails / day free tier)
 * 2. Go to  Profile → SMTP & API → API Keys  and create a key.
 * 3. Go to  Senders & IP → Senders  and verify a sender email address.
 *    (You can verify omegaresourcemgnt@gmail.com directly as a single sender.)
 * 4. Replace the two placeholder strings below with your real values.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BREVO_API_KEY      = 'YOUR_BREVO_API_KEY';         // e.g. "xkeysib-abc123..."
const BREVO_SENDER_EMAIL = 'YOUR_VERIFIED_SENDER_EMAIL'; // must be verified in Brevo
const BREVO_SENDER_NAME  = 'Hairlux Contact Form';
const BREVO_TO_EMAIL     = 'omegaresourcemgnt@gmail.com';
const BREVO_TO_NAME      = 'Hairlux Team';

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var form       = document.getElementById('hl-contact-form');
    var successBox = document.getElementById('hl-form-success');
    var errorBox   = document.getElementById('hl-form-error');
    var submitBtn  = document.getElementById('hl-submit-btn');

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name    = (form.querySelector('#hl-name').value    || '').trim();
      var email   = (form.querySelector('#hl-email').value   || '').trim();
      var phone   = (form.querySelector('#hl-phone').value   || '').trim();
      var subject = (form.querySelector('#hl-subject').value || '').trim();
      var message = (form.querySelector('#hl-message').value || '').trim();

      if (!name || !email || !message) {
        showError('Please fill in your name, email, and message.');
        return;
      }

      if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        return;
      }

      setLoading(true);
      hideAlerts();

      var rows = [
        '<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:130px">Name</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + escHtml(name) + '</td></tr>',
        '<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Email</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="mailto:' +
          escHtml(email) + '">' + escHtml(email) + '</a></td></tr>',
      ];
      if (phone) {
        rows.push('<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Phone</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + escHtml(phone) + '</td></tr>');
      }
      if (subject) {
        rows.push('<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Subject</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + escHtml(subject) + '</td></tr>');
      }
      rows.push(
        '<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;vertical-align:top">Message</td>' +
        '<td style="padding:8px 12px;white-space:pre-wrap">' + escHtml(message) + '</td></tr>'
      );

      var htmlContent =
        '<h2 style="color:#9d8248;margin-bottom:8px">New Message — Hairlux Contact Form</h2>' +
        '<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:15px">' +
        rows.join('') +
        '</table>' +
        '<hr style="margin:24px 0;border:none;border-top:1px solid #ddd"/>' +
        '<p style="color:#888;font-size:12px">Sent via Hairlux website contact form</p>';

      var payload = {
        sender:      { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to:          [{ email: BREVO_TO_EMAIL, name: BREVO_TO_NAME }],
        replyTo:     { email: email, name: name },
        subject:     subject ? '[Hairlux] ' + subject : '[Hairlux] New message from ' + name,
        htmlContent: htmlContent,
      };

      fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_API_KEY,
        },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            showSuccess();
          } else {
            return res.json().then(function (data) {
              throw new Error(data.message || 'Brevo API error ' + res.status);
            });
          }
        })
        .catch(function (err) {
          console.error('Contact form error:', err);
          showError(
            'Could not send your message right now. Please email us at ' +
            '<a href="mailto:omegaresourcemgnt@gmail.com">omegaresourcemgnt@gmail.com</a>' +
            ' or WhatsApp <a href="https://wa.me/2348087141501">+234 808 714 1501</a>.'
          );
        })
        .finally(function () {
          setLoading(false);
        });
    });

    /* ── helpers ───────────────────────────────────────── */

    function showSuccess() {
      if (successBox) {
        successBox.style.display = 'block';
        successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (errorBox) errorBox.style.display = 'none';
    }

    function showError(msg) {
      if (errorBox) {
        errorBox.querySelector('.hl-error-text').innerHTML = msg;
        errorBox.style.display = 'block';
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (successBox) successBox.style.display = 'none';
    }

    function hideAlerts() {
      if (successBox) successBox.style.display = 'none';
      if (errorBox)   errorBox.style.display   = 'none';
    }

    function setLoading(loading) {
      if (!submitBtn) return;
      submitBtn.disabled    = loading;
      submitBtn.textContent = loading ? 'Sending\u2026' : 'Send Message';
    }

    function isValidEmail(val) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    function escHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
