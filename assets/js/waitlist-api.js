/**
 * Waitlist API module
 * Handles the POST /waitlist endpoint for the Hairlux coming-soon page.
 */
(function (global) {
  'use strict';

  // Resolve base URL from the shared config if available, else fall back to production.
  var BASE_URL = (
    typeof API_CONFIG !== 'undefined' &&
    API_CONFIG.BASE_URL &&
    typeof API_CONFIG.BASE_URL === 'string'
  ) ? API_CONFIG.BASE_URL.replace(/\/$/, '') : 'https://hairlux-api-production.up.railway.app';

  var ENDPOINT = BASE_URL + '/waitlist';

  // RFC 5321-inspired email regex — tighter than the basic /\S+@\S+/ check.
  var EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  /**
   * Sanitize a string input: trim and enforce a maximum length.
   */
  function sanitize(str, maxLen) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
  }

  /**
   * Normalise an API error body into a human-readable message.
   * NestJS returns { message: string | string[] } on 400.
   */
  function extractMessage(body) {
    if (!body) return null;
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message) && body.message.length) return body.message[0];
    return null;
  }

  /**
   * Join the waitlist.
   *
   * @param {string} fullName
   * @param {string} email
   * @returns {Promise<{
   *   success: boolean,
   *   data?: { id: string, fullName: string, email: string, createdAt: string },
   *   error?: string,
   *   code?: 'VALIDATION'|'DUPLICATE'|'SERVER'|'NETWORK'
   * }>}
   */
  function join(fullName, email) {
    // --- Client-side validation ------------------------------------------------
    var cleanName  = sanitize(fullName, 100);
    var cleanEmail = sanitize(email, 254).toLowerCase();

    if (!cleanName) {
      return Promise.resolve({
        success: false,
        error: 'Please enter your full name.',
        code: 'VALIDATION'
      });
    }

    if (cleanName.length > 100) {
      return Promise.resolve({
        success: false,
        error: 'Name must be 100 characters or fewer.',
        code: 'VALIDATION'
      });
    }

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return Promise.resolve({
        success: false,
        error: 'Please enter a valid email address.',
        code: 'VALIDATION'
      });
    }

    // --- Network request -------------------------------------------------------
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // Send only the two expected fields — nothing extra.
      body: JSON.stringify({ fullName: cleanName, email: cleanEmail })
    })
    .then(function (res) {
      // Parse JSON regardless of status so we can read error bodies.
      return res.json()
        .then(function (body) { return { status: res.status, body: body }; })
        .catch(function ()    { return { status: res.status, body: null  }; });
    })
    .then(function (result) {
      var status = result.status;
      var body   = result.body;

      if (status === 201) {
        return { success: true, data: body && body.data ? body.data : {} };
      }

      if (status === 409) {
        return {
          success: false,
          error: 'This email is already on our waitlist.',
          code: 'DUPLICATE'
        };
      }

      if (status === 400) {
        var msg = extractMessage(body) || 'Please check your details and try again.';
        return { success: false, error: msg, code: 'VALIDATION' };
      }

      // 5xx or unexpected
      return {
        success: false,
        error: 'Something went wrong on our end. Please try again shortly.',
        code: 'SERVER'
      };
    })
    .catch(function () {
      return {
        success: false,
        error: 'Unable to reach the server. Please check your internet connection.',
        code: 'NETWORK'
      };
    });
  }

  // Expose a minimal public surface.
  global.WaitlistAPI = { join: join };

}(window));
