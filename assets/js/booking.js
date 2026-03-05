(function () {
  // ── Param decoder (XOR + base64, mirrors services.html encoder) ──
  const _KEY = 'hlx2024';
  function decodeBookingParams(str) {
    try {
      const hex = atob(str);
      let json = '';
      for (let i = 0; i < hex.length; i += 2) {
        json += String.fromCharCode(
          parseInt(hex.substr(i, 2), 16) ^ _KEY.charCodeAt((i / 2) % _KEY.length)
        );
      }
      return JSON.parse(json);
    } catch(e) { return null; }
  }

  // ── Resolve selected services ─────────────────────────────────────
  // Priority: sessionStorage → encoded ?d= param → legacy single params
  const params = new URLSearchParams(window.location.search);

  const allSelectedServices = (() => {
    // 1. sessionStorage (primary — written by services.html on Continue click)
    try {
      const stored = JSON.parse(sessionStorage.getItem('selectedServices') || 'null');
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch(e) {}

    // 2. Encoded ?d= param (fallback for direct/shared links)
    const d = params.get('d');
    if (d) {
      try {
        const decoded = decodeBookingParams(decodeURIComponent(d));
        if (decoded && Array.isArray(decoded.services) && decoded.services.length > 0) {
          return decoded.services;
        }
      } catch(e) {}
    }

    // 3. Legacy single-service URL params (backwards compat)
    const id       = params.get('serviceId') || '';
    const name     = params.get('name')      || '';
    const price    = Number(params.get('price')    || 0);
    const duration = Number(params.get('duration') || 0);
    if (id && name) return [{ id, name, price, duration }];

    return [];
  })();

  // ── Helpers ───────────────────────────────────────────────────────
  function getSelectedServices() { return allSelectedServices; }
  function getSelectedService()  { return allSelectedServices[0] || null; }
  function getTotalPrice()       { return allSelectedServices.reduce((s, x) => s + x.price, 0); }
  function getTotalDuration()    { return allSelectedServices.reduce((s, x) => s + x.duration, 0); }
  function getServiceNames()     { return allSelectedServices.map(s => s.name).join(', ') || '-'; }
  function getDiscountedTotal()  {
    const base = getTotalPrice();
    if (!discountInfo || !discountInfo.percentage) return base;
    return Math.round(base * (1 - discountInfo.percentage / 100));
  }

  // ── DOM refs ──────────────────────────────────────────────────────
  const serviceIdEl           = document.getElementById('serviceId');
  const selectedServiceBox    = document.getElementById('selectedServiceBox');
  const selectedServiceTitle  = document.getElementById('selectedServiceTitle');
  const servicesListContainer = document.getElementById('servicesListContainer');
  const selectedServiceHelp   = document.getElementById('selectedServiceHelp');

  const bookingDateEl   = document.getElementById('bookingDate');
  const bookingTimeEl   = document.getElementById('bookingTime');
  const savedAddressEl  = document.getElementById('savedAddress');
  const addressSection  = document.getElementById('addressSection');
  const notesEl         = document.getElementById('notes');
  const addAddressWrap  = document.getElementById('addAddressWrap');
  const saveAddressBtn  = document.getElementById('saveAddressBtn');

  // Booking-for
  const forSelfCard      = document.getElementById('forSelfCard');
  const forGuestCard     = document.getElementById('forGuestCard');
  const guestFieldsWrap  = document.getElementById('guestFieldsWrap');
  const guestNameEl      = document.getElementById('guestName');
  const guestPhoneEl     = document.getElementById('guestPhone');

  // Booking type
  const homeServiceCard  = document.getElementById('homeServiceCard');
  const walkInCard       = document.getElementById('walkInCard');

  const newAddressLine = document.getElementById('newAddressLine');
  const newCity        = document.getElementById('newCity');
  const newState       = document.getElementById('newState');
  const newLatitude    = document.getElementById('newLatitude');
  const newLongitude   = document.getElementById('newLongitude');

  const nextStepBtn   = document.getElementById('nextStep');
  const prevStepBtn   = document.getElementById('prevStep');
  const stepActionsEl = document.querySelector('.step-actions');
  const stepPills     = document.querySelectorAll('[data-step-pill]');
  const stepPanes     = document.querySelectorAll('[data-step-pane]');

  const reviewContainer = document.getElementById('reviewContainer');
  const liveSummary     = document.getElementById('liveSummary');
  const summaryTotal    = document.getElementById('summaryTotal');

  const bookingPayModal    = document.getElementById('bookingPayModal');
  const bookingPaidModal   = document.getElementById('bookingPaidModal');
  const modalService       = document.getElementById('modalService');
  const modalDateTime      = document.getElementById('modalDateTime');
  const modalBookingType   = document.getElementById('modalBookingType');
  const modalAddress       = document.getElementById('modalAddress');
  const modalAddressRow    = document.getElementById('modalAddressRow');
  const modalGuest         = document.getElementById('modalGuest');
  const modalGuestRow      = document.getElementById('modalGuestRow');
  const modalWalletRow     = document.getElementById('modalWalletRow');
  const modalStatus        = document.getElementById('modalStatus');
  const modalStatusRow     = document.getElementById('modalStatusRow');
  const modalSubtext       = document.getElementById('modalSubtext');
  const modalWalletBalance = document.getElementById('modalWalletBalance');
  const modalDebitAmount   = document.getElementById('modalDebitAmount');
  const payLaterBtn        = document.getElementById('payLaterBtn');
  const makePaymentBtn     = document.getElementById('makePaymentBtn');
  const paidModalBookingId = document.getElementById('paidModalBookingId');
  const paidModalService   = document.getElementById('paidModalService');
  const paidModalDateTime  = document.getElementById('paidModalDateTime');
  const paidModalAmount    = document.getElementById('paidModalAmount');

  // Set first serviceId on hidden input (sent to API)
  const firstService = getSelectedService();
  if (firstService) serviceIdEl.value = firstService.id;

  let step = 1;
  let pendingBookingPayload = null;
  let walletBalance = 0;
  let bookingType    = 'HOME_SERVICE'; // 'HOME_SERVICE' | 'WALK_IN'
  let bookingForSelf = true;

  function getBookingType()   { return bookingType; }
  function getPaymentMethod() { return 'WALLET'; }
  function isBookingForSelf() { return bookingForSelf; }

  // ── Utilities ─────────────────────────────────────────────────────
  function formatMoney(value) {
    return `₦${Number(value || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(message, type = 'info', duration = 3000) {
    if (window.UIHelper && typeof window.UIHelper.showToast === 'function') {
      window.UIHelper.showToast(message, type, duration);
    }
  }

  function getApiData(payload) {
    if (!payload) return null;
    return payload.data && typeof payload.data === 'object' ? payload.data : payload;
  }

  // ── Step 1: Service display ───────────────────────────────────────
  function hydrateSelectedServiceUI() {
    const services = getSelectedServices();

    if (!services.length) {
      selectedServiceBox.classList.add('missing');
      selectedServiceTitle.textContent = 'No services selected';
      servicesListContainer.innerHTML = '';
      selectedServiceHelp.innerHTML =
        'Please return to <a href="services.html">Services</a> and select one or more services.';
      return;
    }

    selectedServiceBox.classList.remove('missing');
    const count = services.length;
    const totalPrice    = getTotalPrice();
    const totalDuration = getTotalDuration();

    selectedServiceTitle.textContent =
      count === 1 ? services[0].name : `${count} Services Selected`;

    // Build service rows
    let html = '<div class="services-list">';
    services.forEach(svc => {
      html += `
        <div class="service-list-row">
          <span class="service-list-name">${escHtml(svc.name)}</span>
          <div class="service-list-badges">
            <span class="selected-service-chip">${formatMoney(svc.price)}</span>
            <span class="selected-service-chip">${svc.duration} mins</span>
          </div>
        </div>`;
    });

    if (count > 1) {
      html += `
        <div class="services-total-row">
          <span class="services-total-label">${count} services &middot; ${totalDuration} mins total</span>
          <span class="services-total-amount">${formatMoney(totalPrice)}</span>
        </div>`;
    }
    html += '</div>';

    servicesListContainer.innerHTML = html;
  }

  // ── Address helper ────────────────────────────────────────────────
  function getSelectedAddress() {
    const value = savedAddressEl.value;
    if (!value || value === '__add_new__') return null;
    const option = savedAddressEl.options[savedAddressEl.selectedIndex];
    const text = option.textContent;
    const [addressLine, cityPart] = text.split(',').map(s => s.trim());
    return {
      id: value,
      addressLine: addressLine || text,
      city: option.dataset.city || cityPart || 'Lagos',
      state: option.dataset.state || cityPart || 'Lagos',
      latitude: Number(option.dataset.lat || 6.4541),
      longitude: Number(option.dataset.lng || 3.3947)
    };
  }

  function refreshSummary() {
    const services = getSelectedServices();
    const address  = getSelectedAddress();
    const serviceLabel = services.length > 1
      ? `${services.length} services`
      : (services[0] ? services[0].name : '-');
    const btLabel = bookingType === 'HOME_SERVICE' ? '🏠 Home Service' : '🏪 Walk-In (Store)';
    const addrLabel = bookingType === 'HOME_SERVICE'
      ? (address ? escHtml(address.addressLine) : '-')
      : 'At the salon';
    const guestLabel = bookingForSelf
      ? 'Myself'
      : ((guestNameEl && guestNameEl.value.trim()) || 'Guest');

    liveSummary.innerHTML = `
      <div class="summary-row"><span>Service(s)</span><span>${escHtml(serviceLabel)}</span></div>
      <div class="summary-row"><span>Booking For</span><span>${escHtml(guestLabel)}</span></div>
      <div class="summary-row"><span>Type</span><span>${btLabel}</span></div>
      <div class="summary-row"><span>Date</span><span>${bookingDateEl.value || '-'}</span></div>
      <div class="summary-row"><span>Time</span><span>${bookingTimeEl.value || '-'}</span></div>
      <div class="summary-row"><span>Location</span><span>${addrLabel}</span></div>
      <div class="summary-row"><span>Payment</span><span>👛 Wallet</span></div>
      ${discountInfo ? `<div class="summary-row" style="color:#1f7a3f;"><span>Discount (${discountInfo.percentage}% off)</span><span>&minus;${formatMoney(getTotalPrice() - getDiscountedTotal())}</span></div>` : ''}
    `;
    summaryTotal.textContent = formatMoney(getDiscountedTotal());
  }

  // ── Step 3: Review ────────────────────────────────────────────────
  function buildReview() {
    const services = getSelectedServices();
    const address  = getSelectedAddress();
    const totalPrice    = getTotalPrice();
    const totalDuration = getTotalDuration();
    const isHomeService = bookingType === 'HOME_SERVICE';
    const gName  = guestNameEl && guestNameEl.value.trim();
    const gPhone = guestPhoneEl && guestPhoneEl.value.trim();

    // Services block
    const svcIcon = `<svg viewBox="0 0 16 16"><path d="M8 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`;
    let svcRows = services.map(svc => `
      <div class="review-svc-item">
        <div class="review-svc-left">
          <span class="review-svc-dot"></span>
          <span class="review-svc-name">${escHtml(svc.name)}</span>
        </div>
        <div class="review-svc-right">
          <span class="review-svc-price">${formatMoney(svc.price)}</span>
          <span class="review-svc-duration">${svc.duration} mins</span>
        </div>
      </div>`).join('');

    const svcFooter = services.length > 1 ? `
      <div class="review-svc-footer">
        <span class="review-svc-footer-meta">${services.length} services &middot; ${totalDuration} mins total</span>
        <span class="review-svc-footer-total">${formatMoney(totalPrice)}</span>
      </div>` : '';

    // Details block
    const detailIcon = `<svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="11" y2="9"/><line x1="5" y1="12" x2="8" y2="12"/></svg>`;
    const notesVal  = notesEl.value.trim();
    const addrVal   = isHomeService
      ? (address ? `${escHtml(address.addressLine)}, ${escHtml(address.city)}` : '-')
      : '<span class="btype-badge walkin">🏪 Walk-In at salon</span>';
    const btBadge   = isHomeService
      ? '<span class="btype-badge home">🏠 Home Service</span>'
      : '<span class="btype-badge walkin">🏪 Walk-In (Store)</span>';
    const guestVal  = bookingForSelf
      ? 'Myself'
      : (gName ? `${escHtml(gName)}${gPhone ? ' &middot; ' + escHtml(gPhone) : ''}` : '—');
    const payBadge  = 'Wallet';

    reviewContainer.innerHTML = `
      <div class="review-block">
        <div class="review-block-label">${svcIcon} Selected Services</div>
        ${svcRows}
        ${svcFooter}
      </div>

      <div class="review-block">
        <div class="review-block-label">${detailIcon} Appointment Details</div>
        <div class="review-detail-row">
          <span class="review-detail-label">Booking For</span>
          <span class="review-detail-value">${guestVal}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label">Type</span>
          <span class="review-detail-value">${btBadge}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label">Date</span>
          <span class="review-detail-value">${bookingDateEl.value || '-'}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label">Time</span>
          <span class="review-detail-value">${bookingTimeEl.value || '-'}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label">${isHomeService ? 'Address' : 'Location'}</span>
          <span class="review-detail-value">${addrVal}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label">Payment</span>
          <span class="review-detail-value">${payBadge}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label">Notes</span>
          <span class="review-detail-value">${notesVal ? escHtml(notesVal) : '<span style="color:var(--muted);font-weight:400">None</span>'}</span>
        </div>
      </div>

      ${discountInfo ? `
      <div class="review-block" style="padding-top:0;border-top:none;">
        <div class="review-detail-row">
          <span class="review-detail-label">Subtotal</span>
          <span class="review-detail-value">${formatMoney(totalPrice)}</span>
        </div>
        <div class="review-detail-row">
          <span class="review-detail-label" style="color:#1f7a3f;">Discount (${discountInfo.percentage}%)</span>
          <span class="review-detail-value" style="color:#1f7a3f;">&minus;${formatMoney(Math.round(totalPrice * discountInfo.percentage / 100))}</span>
        </div>
      </div>` : ''}
      <div class="summary-total">
        <span>Estimated Total</span>
        <span>${formatMoney(discountInfo ? Math.round(totalPrice * (1 - discountInfo.percentage / 100)) : totalPrice)}</span>
      </div>

    `;
  }

  // ── Stepper ───────────────────────────────────────────────────────
  function setStep(newStep) {
    step = newStep;
    stepPills.forEach(pill => {
      pill.classList.toggle('active', Number(pill.dataset.stepPill) === step);
    });
    stepPanes.forEach(pane => {
      pane.classList.toggle('active', Number(pane.dataset.stepPane) === step);
    });
    prevStepBtn.classList.toggle('hidden', step === 1);
    stepActionsEl.classList.toggle('single-action', step === 1);
    nextStepBtn.querySelector('div').textContent = step === 3 ? 'Create Booking' : 'Continue';
    if (step === 3) buildReview();
  }

  function validateStep(currentStep) {
    if (currentStep === 1) return getSelectedServices().length > 0;
    if (currentStep === 2) {
      const dateTimeOk = Boolean(bookingDateEl.value && bookingTimeEl.value);
      const addrOk = bookingType === 'WALK_IN' || Boolean(getSelectedAddress());
      return dateTimeOk && addrOk;
    }
    return true;
  }

  function setButtonState(button, loadingText, isLoading) {
    if (!button) return;
    const label = button.querySelector('div');
    if (!button.dataset.originalLabel && label) {
      button.dataset.originalLabel = label.textContent.trim();
    }
    if (isLoading) {
      button.style.pointerEvents = 'none';
      button.style.opacity = '0.75';
      if (label) label.textContent = loadingText;
    } else {
      button.style.pointerEvents = '';
      button.style.opacity = '';
      if (label) label.textContent = button.dataset.originalLabel || label.textContent;
    }
  }

  function closePayModal() {
    bookingPayModal.classList.remove('show');
    document.body.style.overflow = '';
  }

  function openPayModal() {
    bookingPayModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function openPaidModal() {
    bookingPayModal.classList.remove('show');
    bookingPaidModal.classList.add('show');
  }

  // ── Availability slots ────────────────────────────────────────────
  const timeHelperText = document.getElementById('timeHelperText');

  function formatTime12h(h, m) {
    var period   = h >= 12 ? 'PM' : 'AM';
    var displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return displayH + ':' + String(m).padStart(2, '0') + ' ' + period;
  }

  function resetDateTimeFields() {
    bookingDateEl.value = '';
    bookingTimeEl.innerHTML = '<option value="">\u2014 pick a date first \u2014</option>';
    bookingTimeEl.disabled = false;
    timeHelperText.textContent = '';
    timeHelperText.style.color = '';
    refreshSummary();
  }

  async function loadAvailableSlots(date) {
    bookingTimeEl.innerHTML = '<option value="">Loading available slots\u2026</option>';
    bookingTimeEl.disabled = true;
    timeHelperText.textContent = '';
    timeHelperText.style.color = '';

    try {
      // Fetch business hours and exceptions in parallel (both public endpoints)
      var results = await Promise.all([
        APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS_BUSINESS_HOURS),
        APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS_BUSINESS_EXCEPTIONS)
      ]);
      var businessHours = (results[0] && results[0].data) || [];
      var exceptions    = (results[1] && results[1].data) || [];

      // Parse date parts to avoid UTC-offset issues
      var parts = date.split('-').map(Number);
      var yr = parts[0], mo = parts[1], dy = parts[2];
      var selectedDate = new Date(yr, mo - 1, dy);
      var dayOfWeek = selectedDate.getDay(); // 0=Sun, 1=Mon … 6=Sat

      // Check for a date-specific exception
      var dateException = null;
      for (var i = 0; i < exceptions.length; i++) {
        var ex = exceptions[i];
        var exd = new Date(ex.date);
        if (exd.getUTCFullYear() === yr && exd.getUTCMonth() === mo - 1 && exd.getUTCDate() === dy) {
          dateException = ex;
          break;
        }
      }

      var openTime, closeTime;

      if (dateException) {
        if (dateException.isClosed) {
          var reason = dateException.reason || 'Holiday';
          bookingTimeEl.innerHTML = '<option value="">Closed \u2014 ' + reason + '</option>';
          timeHelperText.textContent = 'No appointments available on this date.';
          timeHelperText.style.color = '#dc3545';
          return;
        }
        // Exception with custom hours
        openTime  = dateException.openTime;
        closeTime = dateException.closeTime;
      } else {
        // Regular weekly hours
        var dayConfig = null;
        for (var j = 0; j < businessHours.length; j++) {
          if (businessHours[j].dayOfWeek === dayOfWeek) { dayConfig = businessHours[j]; break; }
        }
        if (!dayConfig || !dayConfig.isOpen) {
          bookingTimeEl.innerHTML = '<option value="">Closed on this day</option>';
          timeHelperText.textContent = 'We are not open on this day of the week.';
          timeHelperText.style.color = '#dc3545';
          return;
        }
        openTime  = dayConfig.openTime;
        closeTime = dayConfig.closeTime;
      }

      // Generate 30-minute slots, filtering out anything < 2 h from now
      var now     = new Date();
      var minTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      var openParts  = openTime.split(':').map(Number);
      var closeParts = closeTime.split(':').map(Number);
      var openMins   = openParts[0] * 60 + (openParts[1] || 0);
      var closeMins  = closeParts[0] * 60 + (closeParts[1] || 0);

      var slots = [];
      for (var mins = openMins; mins < closeMins; mins += 30) {
        var sh = Math.floor(mins / 60);
        var sm = mins % 60;
        var slotDate = new Date(yr, mo - 1, dy, sh, sm, 0, 0);
        if (slotDate <= minTime) continue; // must be at least 2 h ahead
        slots.push({ h: sh, m: sm });
      }

      if (slots.length === 0) {
        bookingTimeEl.innerHTML = '<option value="">No available slots for this date</option>';
        timeHelperText.textContent = 'All slots are too soon. Please try a later date.';
        timeHelperText.style.color = '#888';
      } else {
        bookingTimeEl.innerHTML = '<option value="">\u2014 select a time \u2014</option>';
        slots.forEach(function (slot) {
          var opt = document.createElement('option');
          opt.value = String(slot.h).padStart(2, '0') + ':' + String(slot.m).padStart(2, '0');
          opt.textContent = formatTime12h(slot.h, slot.m);
          bookingTimeEl.appendChild(opt);
        });
        timeHelperText.textContent = slots.length + ' slot' + (slots.length !== 1 ? 's' : '') + ' available';
        timeHelperText.style.color = '';
      }
    } catch (err) {
      bookingTimeEl.innerHTML = '<option value="">Failed to load slots</option>';
      timeHelperText.textContent = (err && err.message) || 'Could not load availability. Try again.';
      timeHelperText.style.color = '#dc3545';
    } finally {
      bookingTimeEl.disabled = false;
      refreshSummary();
    }
  }

  // ── API calls (via BookingAPI helper) ────────────────────────────
  function redirectToDepositFlow(requiredAmount) {
    const amount = Math.max(1, Math.ceil(Number(requiredAmount) || 0));
    window.location.href = `index.html?openDeposit=1&amount=${encodeURIComponent(String(amount))}&reason=booking-payment`;
  }

  function updateConfirmModalUI() {
    const baseTotal     = getTotalPrice();
    const total         = getDiscountedTotal();
    const isHomeService = bookingType === 'HOME_SERVICE';
    const addr          = getSelectedAddress();
    const gName         = guestNameEl && guestNameEl.value.trim();
    const gPhone        = guestPhoneEl && guestPhoneEl.value.trim();

    modalService.textContent     = getServiceNames();
    modalDateTime.textContent    = `${bookingDateEl.value || '-'} at ${bookingTimeEl.value || '-'}`;
    modalDebitAmount.textContent = formatMoney(total);

    // Show discount row if applied
    let discountRow = document.getElementById('modalDiscountRow');
    if (discountInfo) {
      if (!discountRow) {
        discountRow = document.createElement('div');
        discountRow.id = 'modalDiscountRow';
        discountRow.className = 'booking-modal-row';
        // Insert before Amount Due row
        const amountDueRow = modalDebitAmount.closest('.booking-modal-row');
        amountDueRow.parentNode.insertBefore(discountRow, amountDueRow);
      }
      discountRow.innerHTML = `<span>Discount (${discountInfo.percentage}% off)</span><span style="color:#1f7a3f;">&minus;${formatMoney(baseTotal - total)}</span>`;
      discountRow.style.display = '';
    } else if (discountRow) {
      discountRow.style.display = 'none';
    }

    // Booking type
    modalBookingType.innerHTML = isHomeService
      ? '<span class="btype-badge home">🏠 Home Service</span>'
      : '<span class="btype-badge walkin">🏪 Walk-In (Store)</span>';

    // Address row
    if (isHomeService) {
      modalAddressRow.style.display = '';
      modalAddress.textContent = addr ? `${addr.addressLine}, ${addr.city}` : '-';
    } else {
      modalAddressRow.style.display = 'none';
    }

    // Guest row
    if (!bookingForSelf && gName) {
      modalGuestRow.style.display = '';
      modalGuest.textContent = gName + (gPhone ? ` · ${gPhone}` : '');
    } else {
      modalGuestRow.style.display = 'none';
    }

    // WALLET — check balance
    const lowBalance = walletBalance < total;
    modalSubtext.textContent = 'Your wallet will be charged immediately upon confirmation.';
    modalWalletRow.style.display   = '';
    modalStatusRow.style.display   = '';
    modalWalletBalance.textContent = formatMoney(walletBalance);

    if (lowBalance) {
        modalStatus.textContent = 'Insufficient balance — deposit funds first.';
        modalStatus.style.color = '#dc3545';
        makePaymentBtn.querySelector('div').textContent = 'Insufficient Balance';
        makePaymentBtn.style.pointerEvents = 'none';
        makePaymentBtn.style.opacity = '0.5';
        payLaterBtn.style.display = '';
      } else {
        modalStatus.textContent = 'Balance sufficient — ready to book.';
        modalStatus.style.color = '#1f7a3f';
        makePaymentBtn.querySelector('div').textContent = 'Confirm & Book';
        makePaymentBtn.style.pointerEvents = '';
        makePaymentBtn.style.opacity = '';
        payLaterBtn.style.display = 'none';
      }
  }

  // Show confirmation modal BEFORE calling the API
  async function prepareConfirmModal() {
    const address = getSelectedAddress();
    const bType   = getBookingType();
    const bMethod = getPaymentMethod();
    const gName   = guestNameEl  ? guestNameEl.value.trim()  : '';
    const gPhone  = guestPhoneEl ? guestPhoneEl.value.trim() : '';
    pendingBookingPayload = {
      services:      getSelectedServices().map(s => ({ serviceId: s.id })),
      date:          bookingDateEl.value,
      time:          bookingTimeEl.value,
      bookingType:   bType,
      addressId:     bType === 'HOME_SERVICE' ? (address ? address.id : undefined) : undefined,
      guestName:     gName  || undefined,
      guestPhone:    gPhone || undefined,
      paymentMethod: bMethod,
      notes:         notesEl.value.trim() || undefined,
      discountCode:  discountInfo ? discountInfo.code : undefined
    };
    // Only fetch wallet balance when paying with WALLET
    walletBalance = bMethod === 'WALLET' ? await BookingAPI.getWalletBalance() : 0;
    updateConfirmModalUI();
    openPayModal();
  }

  // Called when user clicks "Confirm & Book" / "Reserve Slot" in the modal
  async function createAndPayBooking() {
    if (!pendingBookingPayload) {
      showToast('Missing booking details. Please try again.', 'error');
      return;
    }
    const total = getDiscountedTotal();
    if (walletBalance < total) {
      showToast('Insufficient wallet balance. Please deposit funds first.', 'error');
      return;
    }
    setButtonState(makePaymentBtn, 'Booking…', true);
    try {
      const result  = await BookingAPI.create(pendingBookingPayload);
      const booking = result.booking || {};

      // Show reservation code as the booking reference
      paidModalBookingId.textContent = result.reservationCode || booking.id || '-';
      paidModalService.textContent   = getServiceNames();
      paidModalDateTime.textContent  = `${(booking.bookingDate || bookingDateEl.value || '').split('T')[0]} at ${booking.bookingTime || bookingTimeEl.value || '-'}`;
      paidModalAmount.textContent    = formatMoney(result.totalAmount || getTotalPrice());
      openPaidModal();

      sessionStorage.removeItem('selectedServices');
      pendingBookingPayload = null;
    } catch (error) {
      const msg = (error && error.message) || 'Booking failed. Please try again.';
      if (/insufficient balance/i.test(msg)) {
        showToast('Insufficient wallet balance. Redirecting to deposit...', 'info', 1400);
        window.setTimeout(() => redirectToDepositFlow(total - walletBalance), 900);
        closePayModal();
        return;
      }
      showToast(msg, 'error');
    } finally {
      setButtonState(makePaymentBtn, 'Booking…', false);
    }
  }

  // ── Discount code ─────────────────────────────────────────────────
  var discountInfo = null; // { id, code, name, percentage } or null

  async function validateDiscount() {
    const codeInput   = document.getElementById('discountCodeInput');
    const statusEl    = document.getElementById('discountStatus');
    const badgeEl     = document.getElementById('discountBadge');
    const badgeCodeEl = document.getElementById('discountBadgeCode');
    const badgeText   = document.getElementById('discountBadgeText');
    const inputRow    = document.getElementById('discountInputRow');
    const applyBtn    = document.getElementById('applyDiscountBtn');
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
      statusEl.textContent = 'Please enter a discount code.';
      statusEl.className   = 'discount-status error';
      return;
    }
    setButtonState(applyBtn, 'Checking\u2026', true);
    statusEl.textContent = '';
    statusEl.className   = 'discount-status';

    try {
      const res  = await APIHelper.request(
        API_CONFIG.ENDPOINTS.DISCOUNTS_VALIDATE + '/' + encodeURIComponent(code)
      );
      const data = (res && res.data) || {};
      discountInfo = {
        id:         data.id         || '',
        code:       data.code       || code,
        name:       data.name       || '',
        percentage: Number(data.percentage) || 0
      };
      badgeCodeEl.textContent = discountInfo.code;
      badgeText.textContent   = discountInfo.name
        ? discountInfo.name + ' \u2014 ' + discountInfo.percentage + '% off'
        : discountInfo.percentage + '% off';
      badgeEl.style.display  = '';
      inputRow.style.display = 'none';
      statusEl.textContent   = '';
      statusEl.className     = 'discount-status';
      buildReview();
      refreshSummary();
    } catch (err) {
      discountInfo = null;
      statusEl.textContent = (err && err.message) || 'Invalid or expired discount code.';
      statusEl.className   = 'discount-status error';
    } finally {
      setButtonState(applyBtn, '', false);
    }
  }

  function removeDiscount() {
    discountInfo = null;
    document.getElementById('discountCodeInput').value        = '';
    document.getElementById('discountBadge').style.display    = 'none';
    document.getElementById('discountInputRow').style.display = '';
    document.getElementById('discountStatus').textContent     = '';
    document.getElementById('discountStatus').className       = 'discount-status';
    buildReview();
    refreshSummary();
  }

  function resetDiscountToggle() {
    const toggle = document.getElementById('discountToggle');
    if (toggle && toggle.checked) {
      toggle.checked = false;
      document.getElementById('discountBody').style.display = 'none';
      removeDiscount();
    }
  }

  // ── Event listeners ───────────────────────────────────────────────

  // ── Option card toggling ──────────────────────────────────────────
  function selectOptionCard(cards, selected) {
    cards.forEach(c => {
      c.classList.toggle('selected', c === selected);
      c.setAttribute('aria-pressed', String(c === selected));
    });
  }

  // Booking-for cards (Self / Guest)
  [forSelfCard, forGuestCard].forEach(card => {
    if (!card) return;
    card.addEventListener('click', function () {
      bookingForSelf = this === forSelfCard;
      selectOptionCard([forSelfCard, forGuestCard], this);
      if (guestFieldsWrap) guestFieldsWrap.classList.toggle('visible', !bookingForSelf);
      refreshSummary();
    });
  });

  // Booking-type cards (Home Service / Walk-In)
  [homeServiceCard, walkInCard].forEach(card => {
    if (!card) return;
    card.addEventListener('click', function () {
      bookingType = this === homeServiceCard ? 'HOME_SERVICE' : 'WALK_IN';
      selectOptionCard([homeServiceCard, walkInCard], this);
      const isHome = bookingType === 'HOME_SERVICE';
      if (addressSection) addressSection.classList.toggle('visible', isHome);
      if (!isHome) {
        addAddressWrap.style.display = 'none';
        savedAddressEl.value = '';
      }
      refreshSummary();
    });
  });

  // Keyboard support for all option cards
  document.querySelectorAll('.option-card').forEach(card => {
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
    });
  });

  savedAddressEl.addEventListener('change', function () {
    addAddressWrap.style.display = this.value === '__add_new__' ? 'block' : 'none';
    refreshSummary();
  });

  saveAddressBtn.addEventListener('click', async function (e) {
    e.preventDefault();
    if (!newAddressLine.value || !newCity.value || !newState.value) {
      showToast('Please fill address line, city and state.', 'error');
      return;
    }
    setButtonState(saveAddressBtn, 'Saving\u2026', true);
    try {
      const payload = {
        label:       'New Address',
        addressLine: newAddressLine.value.trim(),
        city:        newCity.value.trim(),
        state:       newState.value.trim(),
        country:     'Nigeria',
        latitude:    newLatitude.value  ? Number(newLatitude.value)  : undefined,
        longitude:   newLongitude.value ? Number(newLongitude.value) : undefined,
        isDefault:   false
      };
      const created = await BookingAPI.createAddress(payload);
      if (!created.id) throw new Error('No address ID returned from server.');
      const option = document.createElement('option');
      option.value = created.id;
      option.textContent = `${created.addressLine}, ${created.city}`;
      option.dataset.city  = created.city  || newCity.value;
      option.dataset.state = created.state || newState.value;
      option.dataset.lat   = created.latitude  != null ? created.latitude  : '6.4541';
      option.dataset.lng   = created.longitude != null ? created.longitude : '3.3947';
      savedAddressEl.insertBefore(option, savedAddressEl.querySelector('option[value="__add_new__"]'));
      savedAddressEl.value = created.id;
      addAddressWrap.style.display = 'none';
      newAddressLine.value = '';
      newCity.value = '';
      newState.value = '';
      newLatitude.value = '';
      newLongitude.value = '';
      refreshSummary();
      showToast('Address saved successfully.', 'success', 2200);
    } catch (err) {
      showToast((err && err.message) || 'Could not save address. Please try again.', 'error');
    } finally {
      setButtonState(saveAddressBtn, 'Saving\u2026', false);
    }
  });

  // Date change: fetch available slots then refresh summary
  bookingDateEl.addEventListener('change', function () {
    if (this.value) {
      loadAvailableSlots(this.value);
    } else {
      bookingTimeEl.innerHTML = '<option value="">\u2014 pick a date first \u2014</option>';
      bookingTimeEl.disabled = false;
      timeHelperText.textContent = '';
    }
    refreshSummary();
  });

  [bookingTimeEl, notesEl].forEach(el => {
    el.addEventListener('change', refreshSummary);
    el.addEventListener('input', refreshSummary);
  });

  nextStepBtn.addEventListener('click', async function (e) {
    e.preventDefault();
    if (!validateStep(step)) {
      showToast('Please complete all required fields before continuing.', 'error');
      return;
    }
    if (step < 3) { setStep(step + 1); return; }
    setButtonState(nextStepBtn, 'Loading…', true);
    try {
      await prepareConfirmModal();
    } catch (error) {
      showToast((error && error.message) || 'Could not load wallet balance. Please try again.', 'error');
    } finally {
      setButtonState(nextStepBtn, 'Loading…', false);
    }
  });

  prevStepBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (step > 1) {
      // Going back from step 3: untoggle discount
      if (step === 3) {
        resetDiscountToggle();
      }
      // Going back from step 2: clear date + time fields
      if (step === 2) {
        resetDateTimeFields();
      }
      setStep(step - 1);
    }
  });

  document.getElementById('applyDiscountBtn').addEventListener('click', function (e) {
    e.preventDefault();
    validateDiscount();
  });

  document.getElementById('discountCodeInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); validateDiscount(); }
  });

  document.getElementById('removeDiscountBtn').addEventListener('click', function (e) {
    e.preventDefault();
    removeDiscount();
  });

  document.getElementById('discountToggle').addEventListener('change', function () {
    document.getElementById('discountBody').style.display = this.checked ? 'block' : 'none';
    if (!this.checked) removeDiscount();
  });

  payLaterBtn.addEventListener('click', function (e) {
    e.preventDefault();
    const total    = getDiscountedTotal();
    const required = total - Number(walletBalance || 0);
    redirectToDepositFlow(required > 0 ? required : total || 5000);
  });

  makePaymentBtn.addEventListener('click', function (e) {
    e.preventDefault();
    createAndPayBooking();
  });

  bookingPayModal.addEventListener('click', function (event) {
    if (event.target === bookingPayModal) closePayModal();
  });

  // ── Address loader ──────────────────────────────────────────────
  async function loadAddresses() {
    savedAddressEl.innerHTML = '<option value="">Loading addresses\u2026</option>';
    try {
      const addresses = await BookingAPI.getAddresses();
      savedAddressEl.innerHTML = '<option value="">\u2014 select an address \u2014</option>';
      addresses.forEach(function (addr) {
        const opt = document.createElement('option');
        opt.value = addr.id;
        opt.textContent = addr.label
          ? addr.label + ' \u2014 ' + addr.addressLine + ', ' + addr.city
          : addr.addressLine + ', ' + addr.city;
        opt.dataset.city  = addr.city  || '';
        opt.dataset.state = addr.state || '';
        opt.dataset.lat   = addr.latitude  != null ? addr.latitude  : '6.4541';
        opt.dataset.lng   = addr.longitude != null ? addr.longitude : '3.3947';
        savedAddressEl.appendChild(opt);
      });
      const addOpt = document.createElement('option');
      addOpt.value = '__add_new__';
      addOpt.textContent = '+ Add new address';
      savedAddressEl.appendChild(addOpt);
      const defaultAddr = addresses.find(function (a) { return a.isDefault; });
      if (defaultAddr) savedAddressEl.value = defaultAddr.id;
      refreshSummary();
    } catch (err) {
      savedAddressEl.innerHTML = '<option value="">Failed to load addresses</option>';
      const addOpt = document.createElement('option');
      addOpt.value = '__add_new__';
      addOpt.textContent = '+ Add new address';
      savedAddressEl.appendChild(addOpt);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────
  hydrateSelectedServiceUI();
  refreshSummary();
  setStep(1);
  loadAddresses();
})();
