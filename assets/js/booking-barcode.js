/* Hairlux customer site: booking barcode.
 *
 * Draws the reservation code (e.g. HLX-A3K9) as a Code 128 barcode, so the
 * customer can either have it scanned at the front desk or read the code out.
 * Front desk scanners act like a keyboard: they type the code and press Enter
 * into the "Verify Reservation" box on the admin dashboard / staff portal.
 *
 * Only bookings the customer made themselves (website or app, booking.source
 * === 'CUSTOMER') get a barcode. Bookings created on the admin dashboard
 * (source 'ADMIN') and salon / staff portal bookings never do.
 *
 * No library or network call: the SVG is generated here, so it also works
 * offline from the service worker cache.
 *
 * Usage:
 *   HairluxBarcode.render(containerEl, 'HLX-A3K9');   // shows it
 *   HairluxBarcode.render(containerEl, '');           // hides it
 *   HairluxBarcode.renderForBooking(containerEl, booking);
 */
(function (global) {
  'use strict';

  // Code 128 bar/space widths for values 0..106 (106 = STOP).
  var PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];
  var START_B = 104;
  var STOP = 106;
  var QUIET = 10; // modules of white space each side (scanner requirement)

  var RESERVATION_CODE = /^HL[XS]-[A-Z0-9]{3,12}$/;

  function isReservationCode(code) {
    return RESERVATION_CODE.test(String(code || '').trim().toUpperCase());
  }

  /** Code 128 (set B) module widths for printable ASCII text, START to STOP. */
  function encode(text) {
    var values = [START_B];
    for (var i = 0; i < text.length; i++) {
      var v = text.charCodeAt(i) - 32;
      if (v < 0 || v > 94) throw new Error('Unsupported character in barcode: ' + text.charAt(i));
      values.push(v);
    }
    var sum = START_B;
    for (var j = 1; j < values.length; j++) sum += values[j] * j;
    values.push(sum % 103);
    values.push(STOP);
    return values.map(function (val) { return PATTERNS[val]; }).join('');
  }

  /** SVG markup for the code. Black on white so it scans in dark mode too. */
  function svg(code, opts) {
    opts = opts || {};
    var text = String(code || '').trim().toUpperCase();
    var widths = encode(text);
    var height = opts.height || 64;
    var x = QUIET;
    var bars = '';
    for (var i = 0; i < widths.length; i++) {
      var w = Number(widths.charAt(i));
      if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="' + height + '"/>';
      x += w;
    }
    var total = x + QUIET;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + height + '"' +
      ' preserveAspectRatio="none" shape-rendering="crispEdges" role="img"' +
      ' aria-label="Barcode for reservation code ' + text + '">' +
      '<rect width="' + total + '" height="' + height + '" fill="#fff"/>' +
      '<g fill="#000">' + bars + '</g></svg>';
  }

  function injectStyles() {
    if (document.getElementById('hlx-barcode-styles')) return;
    var style = document.createElement('style');
    style.id = 'hlx-barcode-styles';
    style.textContent =
      '.hlx-barcode{margin-top:12px;background:#fff;border:1.5px solid #e8cc94;border-radius:14px;padding:14px 16px 12px;text-align:center;}' +
      '.hlx-barcode[hidden]{display:none!important;}' +
      '.hlx-barcode-bars svg{display:block;width:100%;max-width:300px;height:72px;margin:0 auto;}' +
      '.hlx-barcode-code{margin-top:6px;font-family:"IBM Plex Mono","Courier New",monospace;font-size:14px;font-weight:700;letter-spacing:.2em;color:#111;}' +
      '.hlx-barcode-hint{margin-top:4px;font-size:11px;line-height:1.4;color:#6b5a3c;}';
    document.head.appendChild(style);
  }

  /**
   * Fills (or hides) a container with the barcode, the code under it and a
   * short hint. Safe to call repeatedly, e.g. when fresher data arrives.
   */
  function render(container, code) {
    if (!container) return false;
    var text = String(code || '').trim().toUpperCase();
    if (!isReservationCode(text)) {
      container.hidden = true;
      container.innerHTML = '';
      return false;
    }
    try {
      injectStyles();
      container.classList.add('hlx-barcode');
      container.innerHTML =
        '<div class="hlx-barcode-bars">' + svg(text) + '</div>' +
        '<div class="hlx-barcode-code">' + text + '</div>' +
        '<div class="hlx-barcode-hint">Scan at the front desk on arrival, or show the reservation code.</div>';
      container.hidden = false;
      return true;
    } catch (e) {
      container.hidden = true;
      container.innerHTML = '';
      return false;
    }
  }

  /**
   * True when this booking should carry a barcode: made by the customer
   * (not on the admin dashboard) and still usable at the salon.
   */
  function isEligibleBooking(booking) {
    if (!booking || String(booking.source || '').toUpperCase() !== 'CUSTOMER') return false;
    if (booking.reservationUsed === true) return false;
    var status = String(booking.status || '').toUpperCase();
    return ['CANCELLED', 'COMPLETED', 'AWAITING_CUSTOMER_CONFIRM'].indexOf(status) === -1;
  }

  function renderForBooking(container, booking) {
    return render(container, isEligibleBooking(booking) ? booking.reservationCode : '');
  }

  global.HairluxBarcode = {
    encode: encode,
    svg: svg,
    render: render,
    renderForBooking: renderForBooking,
    isEligibleBooking: isEligibleBooking,
    isReservationCode: isReservationCode
  };
})(window);
