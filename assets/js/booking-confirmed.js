/**
 * Hairlux ad booking thank-you page (booking-confirmed.html).
 *
 * Monnify sends the customer here after paying on book-now.html, with
 * ?ref=HLADB-... (Monnify adds its own "?paymentReference=HLADB-..."). The
 * page asks the API for the booking status (which also confirms the payment
 * with Monnify), then shows the reservation code, QR code and balance, or
 * "Payment not completed" with a way to finish paying.
 *
 * Meta Pixel: the snippet in the page only initialises the pixel. The one
 * event sent is Purchase, once the booking is confirmed, with the payment
 * reference as eventID so it is counted once (also guarded per browser, so
 * a reload does not send it again).
 */
(function () {
  'use strict';

  // config.js declares API_CONFIG with const, so it is not on window.
  var API = (typeof API_CONFIG !== 'undefined' && API_CONFIG.BASE_URL) || '';
  var FORM_KEY = 'hlx_ad_booking_form'; // book-now.js keeps the unfinished form here

  var $ = function (id) { return document.getElementById(id); };

  // ─── Helpers ──────────────────────────────────────────────────────────

  function naira(v) {
    var n = Number(v) || 0;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function time12(hhmm) {
    var p = String(hhmm || '').split(':');
    var h = Number(p[0]), m = p[1] || '00';
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function dateObj(ymd) { return new Date(ymd + 'T12:00:00Z'); }

  function longDate(ymd) {
    return dateObj(ymd).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  async function api(path) {
    var res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' } });
    var body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      var msg = body && body.message;
      if (Array.isArray(msg)) msg = msg[0];
      var err = new Error(msg || 'Something went wrong. Please try again.');
      err.status = res.status;
      throw err;
    }
    return body && body.data !== undefined ? body.data : body;
  }

  function show(id, on) { $(id).classList.toggle('bn-hidden', !on); }

  function localStorageSafe() {
    try { return window.localStorage; } catch (e) { return window.sessionStorage; }
  }

  function seen(key) {
    try { return !!localStorageSafe().getItem(key); } catch (e) { return false; }
  }

  function remember(key) {
    try { localStorageSafe().setItem(key, '1'); } catch (e) { /* private mode */ }
  }

  /**
   * The HLADB- reference in the link. Read from ref or paymentReference, and
   * tolerant of "?ref=HLADB-X?paymentReference=HLADB-X" (Monnify adds its own "?").
   */
  function returnReference() {
    var q = new URLSearchParams(location.search);
    var raw = [q.get('paymentReference'), q.get('ref'), location.search].join(' ');
    var m = raw.match(/HLADB-[A-Z0-9]+-[A-Z0-9]+/i);
    return m ? m[0].toUpperCase() : null;
  }

  // ─── Meta Pixel ───────────────────────────────────────────────────────

  function trackPurchase(r) {
    var key = 'hlx_ad_purchase_' + r.reference;
    if (!window.fbq || seen(key)) return;
    try {
      window.fbq('track', 'Purchase', {
        value: r.amountPaid,
        currency: 'NGN',
        content_name: r.serviceName,
        content_type: 'product',
      }, { eventID: r.reference });
      remember(key);
    } catch (e) { /* never block the confirmation */ }
  }

  // ─── Result ───────────────────────────────────────────────────────────

  function icsFile(r) {
    var start = r.date.replace(/-/g, '') + 'T' + r.time.replace(':', '') + '00';
    var mins = Number(r.durationMinutes) || 60;
    var endDate = new Date(Date.UTC(+r.date.slice(0, 4), +r.date.slice(5, 7) - 1, +r.date.slice(8, 10), +r.time.slice(0, 2), +r.time.slice(3, 5) + mins));
    var end = endDate.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00';
    var loc = r.branch ? (r.branch.name + ', ' + r.branch.address) : '';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hairlux//Booking//EN', 'BEGIN:VEVENT',
      'UID:' + r.reference + '@hairlux.com.ng',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;TZID=Africa/Lagos:' + start,
      'DTEND;TZID=Africa/Lagos:' + end,
      'SUMMARY:Hairlux: ' + r.serviceName,
      'LOCATION:' + loc.replace(/,/g, '\\,'),
      'DESCRIPTION:Reservation code ' + r.reservationCode + '. Balance to pay at the branch: ' + naira(r.balanceDue).replace('₦', 'NGN '),
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }

  function showDone(r) {
    show('bnChecking', false);
    show('bnNotPaid', false);
    show('bnDone', true);
    document.title = 'You are booked | Hairlux';
    $('doneCode').textContent = r.reservationCode;
    $('doneTitle').textContent = 'You are booked, ' + r.firstName + '!';
    $('doneLead').textContent = 'We sent your confirmation to ' + r.email + '.';
    $('doneService').textContent = r.serviceName;
    $('doneBranch').textContent = r.branch ? r.branch.name : '-';
    $('doneAddress').textContent = r.branch ? r.branch.address : '-';
    $('doneWhen').textContent = longDate(r.date) + ', ' + time12(r.time);
    $('doneTotal').textContent = naira(r.totalAmount);
    $('donePaid').textContent = naira(r.amountPaid);
    $('doneBalance').textContent = r.balanceDue > 0 ? naira(r.balanceDue) : 'Nothing, fully paid';
    if (r.accountCreated) {
      show('doneAccount', true);
      $('doneAccountText').textContent = 'We emailed ' + r.email + ' a link to set your password. Sign in any time to see your bookings, payments and balance.';
    }
    $('doneCalendar').href = icsFile(r);
    if (window.HairluxBarcode) {
      HairluxBarcode.render($('bnBarcode'), r.reservationCode, {
        services: r.serviceName,
        dateTime: longDate(r.date) + ', ' + time12(r.time),
        location: r.branch ? r.branch.name + ', ' + r.branch.address : '',
        amount: naira(r.totalAmount) + ' (paid ' + naira(r.amountPaid) + ', balance ' + naira(r.balanceDue) + ')',
        paymentMethod: r.paymentOption === 'FULL' ? 'Paid online in full' : 'Deposit paid online',
        status: 'Confirmed',
        customerName: r.firstName,
      });
    }
    trackPurchase(r);
    // The booking is made: the half-filled form on book-now is no longer needed.
    try { sessionStorage.removeItem(FORM_KEY); } catch (e) { /* ignore */ }
  }

  function showNotPaid(r, text) {
    show('bnChecking', false);
    show('bnNotPaid', true);
    if (text) $('notPaidText').textContent = text;
    if (r && r.status === 'FAILED' && r.message) {
      $('notPaidTitle').textContent = 'We are on it';
      $('notPaidText').textContent = r.message;
      show('notPaidRetry', false);
      return;
    }
    if (r && r.status === 'EXPIRED') {
      $('notPaidText').textContent = 'This booking request has expired. Please start again to choose a new time.';
    }
    if (r && r.checkoutUrl) $('notPaidRetry').href = r.checkoutUrl;
    else show('notPaidRetry', false);
  }

  async function checkStatus(ref) {
    var tries = 0;
    var last = null;
    // Monnify may take a little while to confirm a bank transfer or USSD payment.
    while (tries < 20) {
      tries++;
      try {
        last = await api('/public/ad-bookings/status/' + encodeURIComponent(ref));
        if (last.status === 'BOOKED' && last.reservationCode) { showDone(last); return; }
        if (last.status === 'FAILED' || last.status === 'EXPIRED') { showNotPaid(last); return; }
        if (!last.processing && tries >= 10) { showNotPaid(last); return; }
      } catch (e) {
        if (e.status === 404) { showNotPaid(null, 'We could not find this booking. Please start again.'); return; }
      }
      if (tries === 4) $('bnCheckingText').textContent = 'Still confirming with your bank. This can take a minute for transfers.';
      await new Promise(function (r) { setTimeout(r, 3000); });
    }
    if (last && last.processing) {
      $('bnCheckingText').textContent = 'Your payment is received and your booking is being finalised. You will get an email with your reservation code shortly.';
      return;
    }
    showNotPaid(last);
  }

  // ─── Start ────────────────────────────────────────────────────────────

  function init() {
    $('bnYear').textContent = new Date().getFullYear();
    var ref = returnReference();
    if (!ref) {
      // Opened without a booking reference (bookmarked or typed): nothing to confirm.
      showNotPaid(null, 'There is no booking to show here. Start a booking to choose your service and time.');
      $('notPaidTitle').textContent = 'No booking found';
      show('notPaidCheck', false);
      return;
    }
    checkStatus(ref);
  }

  init();
})();
