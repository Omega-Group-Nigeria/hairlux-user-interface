/* Hairlux customer site: booking QR code.
 *
 * Draws the reservation code (e.g. HLX-A3K9) as a QR code, so the customer
 * can either have it scanned at the front desk or read the code out. Front
 * desk scanners (2D / QR capable) act like a keyboard: they type the code and
 * press Enter into the "Verify Reservation" box on the admin dashboard /
 * staff portal. The QR holds only the reservation code.
 *
 * Only bookings the customer made themselves (website or app, booking.source
 * === 'CUSTOMER') get a QR code. Bookings created on the admin dashboard
 * (source 'ADMIN') and salon / staff portal bookings never do.
 *
 * Needs assets/js/vendor/qrcode-core.min.js (window.HairluxQRCore) loaded
 * first. No network call: the SVG and PDF are drawn here, so it also works
 * offline from the service worker cache. (The name HairluxBarcode is kept so
 * the pages that call it did not have to change.)
 *
 * Usage:
 *   HairluxBarcode.render(containerEl, 'HLX-A3K9');   // shows it
 *   HairluxBarcode.render(containerEl, '');           // hides it
 *   HairluxBarcode.renderForBooking(containerEl, booking);
 *
 * Pass booking details as a third argument (an object, or a function that
 * returns one when the button is pressed) and a "Download PDF" button is
 * added under the QR code. The PDF is built here too, with no PDF library:
 *   HairluxBarcode.render(el, code, function () {
 *     return { services: '...', date: '...', time: '...', amount: '...' };
 *   });
 * Detail fields (all optional): services, date, time, dateTime, bookingType,
 * location, locationLabel, amount, amountLabel, paymentMethod, status,
 * customerName, guestName.
 */
(function (global) {
  'use strict';

  var QUIET = 4; // modules of white space around the QR code (scanner requirement)

  var RESERVATION_CODE = /^HL[XS]-[A-Z0-9]{3,12}$/;

  function isReservationCode(code) {
    return RESERVATION_CODE.test(String(code || '').trim().toUpperCase());
  }

  /**
   * QR code modules for the text: { size, dark(row, col) }. Medium error
   * correction, so a slightly scratched screen or print still scans.
   */
  function matrix(text) {
    if (!global.HairluxQRCore) throw new Error('QR library not loaded');
    var qr = global.HairluxQRCore.create(text, { errorCorrectionLevel: 'M' });
    var m = qr.modules;
    return { size: m.size, dark: function (r, c) { return !!m.get(r, c); } };
  }

  /** SVG markup for the code. Black on white so it scans in dark mode too. */
  function svg(code) {
    var text = String(code || '').trim().toUpperCase();
    var q = matrix(text);
    var total = q.size + QUIET * 2;
    var path = '';
    for (var r = 0; r < q.size; r++) {
      for (var c = 0; c < q.size; c++) {
        if (q.dark(r, c)) path += 'M' + (c + QUIET) + ' ' + (r + QUIET) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '"' +
      ' shape-rendering="crispEdges" role="img"' +
      ' aria-label="QR code for reservation code ' + text + '">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
      '<path fill="#000" d="' + path + '"/></svg>';
  }

  function injectStyles() {
    if (document.getElementById('hlx-barcode-styles')) return;
    var style = document.createElement('style');
    style.id = 'hlx-barcode-styles';
    style.textContent =
      '.hlx-barcode{margin-top:12px;background:#fff;border:1.5px solid #e8cc94;border-radius:14px;padding:14px 16px 12px;text-align:center;}' +
      '.hlx-barcode[hidden]{display:none!important;}' +
      '.hlx-barcode-bars svg{display:block;width:176px;max-width:100%;height:auto;aspect-ratio:1/1;margin:0 auto;}' +
      '.hlx-barcode-code{margin-top:6px;font-family:"IBM Plex Mono","Courier New",monospace;font-size:14px;font-weight:700;letter-spacing:.2em;color:#111;}' +
      '.hlx-barcode-hint{margin-top:4px;font-size:11px;line-height:1.4;color:#6b5a3c;}' +
      '.hlx-barcode-pdf{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 16px;border:1.5px solid #c9a872;border-radius:999px;background:transparent;color:#6b5a3c;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;}' +
      '.hlx-barcode-pdf:hover{background:#c9a872;color:#111;}' +
      '.hlx-barcode-pdf svg{width:15px;height:15px;}';
    document.head.appendChild(style);
  }

  /**
   * Fills (or hides) a container with the QR code, the code under it and a
   * short hint. Safe to call repeatedly, e.g. when fresher data arrives.
   */
  function render(container, code, details) {
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
        '<div class="hlx-barcode-hint">Scan at the front desk on arrival, or show the reservation code.</div>' +
        (details ? '<button type="button" class="hlx-barcode-pdf">' + DOWNLOAD_ICON + 'Download PDF</button>' : '');
      if (details) {
        container.querySelector('.hlx-barcode-pdf').addEventListener('click', function () {
          var d = typeof details === 'function' ? details() : details;
          downloadPdf(text, d || {});
        });
      }
      container.hidden = false;
      return true;
    } catch (e) {
      container.hidden = true;
      container.innerHTML = '';
      return false;
    }
  }

  /**
   * True when this booking should carry a QR code: made by the customer
   * (not on the admin dashboard) and still usable at the salon.
   */
  function isEligibleBooking(booking) {
    if (!booking || String(booking.source || '').toUpperCase() !== 'CUSTOMER') return false;
    if (booking.reservationUsed === true) return false;
    var status = String(booking.status || '').toUpperCase();
    return ['CANCELLED', 'COMPLETED', 'AWAITING_CUSTOMER_CONFIRM'].indexOf(status) === -1;
  }

  function renderForBooking(container, booking, details) {
    return render(container, isEligibleBooking(booking) ? booking.reservationCode : '', details);
  }

  // ── Booking confirmation PDF ─────────────────────────────────────
  // A one-page A4 PDF written by hand (built-in Helvetica fonts, vector
  // QR code), so it needs no PDF library and works offline.

  var DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

  // Glyph widths (per 1000 units) for ASCII 32..126, from the standard font metrics.
  var W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

  /** Text the built-in PDF fonts can show: naira sign spelled out, odd characters dropped. */
  function pdfSafe(value) {
    return String(value == null ? '' : value)
      .replace(/\u20A6/g, 'NGN ')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/\u00B7/g, '-')
      .replace(/[\u2713\u2714]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
      .trim();
  }

  function textWidth(text, size, bold) {
    var table = bold ? W_BOLD : W_REG;
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? table[c - 32] : 556;
    }
    return (w * size) / 1000;
  }

  function wrapText(text, size, bold, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var next = line ? line + ' ' + word : word;
      if (line && textWidth(next, size, bold) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /** PDF string literal; Latin-1 characters written as octal escapes. */
  function pdfString(text) {
    var out = '(';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var c = text.charCodeAt(i);
      if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
      else if (c > 126) out += '\\' + ('00' + c.toString(8)).slice(-3);
      else out += ch;
    }
    return out + ')';
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(function (v) { return v.toFixed(3); }).join(' ');
  }

  function currentCustomerName() {
    try {
      var u = window.APIHelper && typeof APIHelper.getUserData === 'function' ? APIHelper.getUserData() : null;
      if (u) return [u.firstName, u.lastName].filter(Boolean).join(' ');
    } catch (e) { /* not signed in */ }
    return '';
  }

  /** Builds the PDF bytes for a booking. */
  function buildPdf(code, d) {
    var PAGE_W = 595.28, PAGE_H = 841.89, M = 48;
    var ops = [];
    var GOLD = '#C9A872', DARK = '#161616', INK = '#1A1A1A', MUTED = '#777777', LINE = '#E6E6E6';

    function rect(x, y, w, h, color) { ops.push(hexToRgb(color) + ' rg ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f'); }
    function strokeRect(x, y, w, h, color, lw) { ops.push(hexToRgb(color) + ' RG ' + (lw || 1) + ' w ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re S'); }
    function line(x1, y1, x2, color) { ops.push(hexToRgb(color) + ' RG 0.8 w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y1.toFixed(2) + ' l S'); }
    function text(str, x, y, size, bold, color, align, spacing) {
      var t = pdfSafe(str);
      var w = textWidth(t, size, bold) + (spacing ? spacing * Math.max(t.length - 1, 0) : 0);
      var tx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      ops.push('BT ' + hexToRgb(color) + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + (spacing ? spacing + ' Tc ' : '0 Tc ') +
        tx.toFixed(2) + ' ' + y.toFixed(2) + ' Td ' + pdfString(t) + ' Tj ET');
    }

    // Header band
    rect(0, PAGE_H - 120, PAGE_W, 120, DARK);
    text('HAIRLUX', M, PAGE_H - 62, 26, true, GOLD, 'left', 4);
    text('BEAUTY & WELLNESS', M, PAGE_H - 82, 9, false, '#FFFFFF', 'left', 2.2);
    text('Booking Confirmation', PAGE_W - M, PAGE_H - 62, 16, true, '#FFFFFF', 'right');
    var status = pdfSafe(d.status || 'Confirmed');
    text(status.toUpperCase(), PAGE_W - M, PAGE_H - 82, 9, true, GOLD, 'right', 1.5);

    // Reservation code + QR card
    var cardTop = PAGE_H - 150, cardH = 285;
    strokeRect(M, cardTop - cardH, PAGE_W - 2 * M, cardH, GOLD, 1.5);
    text('RESERVATION CODE', PAGE_W / 2, cardTop - 30, 9, true, MUTED, 'center', 2);
    text(code, PAGE_W / 2, cardTop - 62, 28, true, INK, 'center', 4);

    var q = matrix(code);
    var qrSize = 150;
    var cell = qrSize / q.size;
    var qx = (PAGE_W - qrSize) / 2;
    var qyTop = cardTop - 96; // the page around it is white, which is the quiet zone
    for (var r = 0; r < q.size; r++) {
      for (var c = 0; c < q.size; c++) {
        // PDF y grows upwards, so row 0 is drawn at the top.
        if (q.dark(r, c)) rect(qx + c * cell, qyTop - (r + 1) * cell, cell + 0.02, cell + 0.02, '#000000');
      }
    }
    text('Scan at the front desk on arrival, or show the reservation code.', PAGE_W / 2, cardTop - cardH + 18, 10, false, MUTED, 'center');

    // Details
    var rows = [];
    var customer = d.customerName || currentCustomerName();
    if (customer) rows.push(['Booked by', customer]);
    if (d.guestName) rows.push(['Booked for', d.guestName]);
    if (d.services) rows.push(['Service(s)', d.services]);
    if (d.date || d.time) rows.push(['Date & time', [d.date, d.time].filter(Boolean).join(' at ')]);
    else if (d.dateTime) rows.push(['Date & time', d.dateTime]);
    if (d.bookingType) rows.push(['Booking type', d.bookingType]);
    if (d.location) rows.push([d.locationLabel || 'Location', d.location]);
    if (d.amount) rows.push([d.amountLabel || 'Amount paid', d.amount]);
    if (d.paymentMethod) rows.push(['Payment method', d.paymentMethod]);
    rows.push(['Status', status]);

    var y = cardTop - cardH - 40;
    text('BOOKING DETAILS', M, y, 10, true, GOLD, 'left', 2);
    y -= 14;
    line(M, y, PAGE_W - M, GOLD);
    var labelW = 140, valueX = M + labelW, valueW = PAGE_W - M - valueX;
    rows.forEach(function (r) {
      var lines = wrapText(pdfSafe(r[1]) || '-', 11, true, valueW).slice(0, 6);
      y -= 22;
      text(r[0], M, y, 10, false, MUTED, 'left');
      lines.forEach(function (ln, k) { text(ln, valueX, y - k * 15, 11, true, INK, 'left'); });
      y -= (lines.length - 1) * 15 + 10;
      line(M, y, PAGE_W - M, LINE);
    });

    // Footer
    var generated = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    text('Please arrive a few minutes early. Need to make changes? Contact us before your appointment.', PAGE_W / 2, 74, 9.5, false, MUTED, 'center');
    line(M, 60, PAGE_W - M, LINE);
    text('Hairlux Salon & Spa - hairlux.com.ng', M, 42, 9, true, INK, 'left');
    text('Generated ' + generated, PAGE_W - M, 42, 9, false, MUTED, 'right');

    var content = ops.join('\n');
    var objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Title ' + pdfString('Hairlux booking ' + code) + ' /Producer (Hairlux) >>'
    ];
    var pdf = '%PDF-1.4\n';
    var offsets = [];
    objects.forEach(function (body, idx) {
      offsets.push(pdf.length);
      pdf += (idx + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    var xref = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { pdf += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R /Info 7 0 R >>\nstartxref\n' + xref + '\n%%EOF';

    // Everything above is ASCII, so one character is one byte.
    var bytes = new Uint8Array(pdf.length);
    for (var b = 0; b < pdf.length; b++) bytes[b] = pdf.charCodeAt(b) & 255;
    return bytes;
  }

  /** Saves the booking confirmation as "Hairlux-Booking-HLX-A3K9.pdf". */
  function downloadPdf(code, details) {
    var text = String(code || '').trim().toUpperCase();
    if (!isReservationCode(text)) return false;
    var blob = new Blob([buildPdf(text, details || {})], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Hairlux-Booking-' + text + '.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return true;
  }

  global.HairluxBarcode = {
    matrix: matrix,
    svg: svg,
    render: render,
    renderForBooking: renderForBooking,
    buildPdf: buildPdf,
    downloadPdf: downloadPdf,
    isEligibleBooking: isEligibleBooking,
    isReservationCode: isReservationCode
  };
})(window);
