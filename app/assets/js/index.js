    // ── Helpers ─────────────────────────────────────────────────────────────
    var _BOOKING_PARAM_KEY = 'hlx2024';

    function encodeBookingParams(obj) {
      try {
        var json = JSON.stringify(obj);
        var hex = '';
        for (var i = 0; i < json.length; i++) {
          hex += ('0' + (json.charCodeAt(i) ^ _BOOKING_PARAM_KEY.charCodeAt(i % _BOOKING_PARAM_KEY.length)).toString(16)).slice(-2);
        }
        return btoa(hex);
      } catch (e) {
        return '';
      }
    }

    function fmtBkDate(s) {
      if (!s || s === '-') return '';
      const d = new Date(String(s).includes('T') ? s : s + 'T00:00:00');
      return isNaN(d) ? s : d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    function fmtBkTime(s) {
      if (!s) return '';
      const parts = String(s).split(':');
      if (parts.length < 2) return s;
      const h = parseInt(parts[0], 10), m = String(parts[1]).padStart(2, '0');
      const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${dh}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
    }
    function fmtNaira(n) { return '\u20a6' + Number(n || 0).toLocaleString(); }
    function normalizeBookingType(type) {
      const t = String(type || '').toUpperCase();
      if (t === 'WALK_IN' || t === 'WALKIN') return 'WALK_IN';
      if (t === 'HOME_SERVICE' || t === 'HOME') return 'HOME_SERVICE';
      return '';
    }
    function fmtBookingType(type) {
      const t = normalizeBookingType(type);
      if (t === 'WALK_IN') return 'Walk-In (Store)';
      if (t === 'HOME_SERVICE') return 'Mobile Service';
      return '-';
    }
    function fmtBookingLocation(type, locationValue) {
      return normalizeBookingType(type) === 'WALK_IN' ? 'At the salon' : (locationValue || '-');
    }

      const BOOKING_GATEWAY_STATE_KEY = 'hairlux.booking.gateway.pending';
      const BOOKING_GATEWAY_PROVIDER = 'monnify';

      function normalizeGatewayProvider(provider) {
        const candidate = String(provider || '').trim().toLowerCase();
        return candidate === 'monnify' ? 'monnify' : 'monnify';
      }

      function isFailedGatewayStatus(status) {
        const value = String(status || '').trim().toLowerCase();
        return value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled' || value === 'abandoned';
      }

      function bookingPaymentEndpoints() {
        const source = API_CONFIG && API_CONFIG.ENDPOINTS && API_CONFIG.ENDPOINTS.BOOKING_PAYMENTS
          ? API_CONFIG.ENDPOINTS.BOOKING_PAYMENTS
          : {};

        return {
          BASE: source.BASE || '/bookings/payments',
          VERIFY: source.VERIFY || '/bookings/payments/verify'
        };
      }

      function readPendingBookingPayment() {
        try {
          const raw = window.sessionStorage.getItem(BOOKING_GATEWAY_STATE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') return null;
          if (parsed.createdAt && (Date.now() - Number(parsed.createdAt)) > (6 * 60 * 60 * 1000)) {
            clearPendingBookingPayment();
            return null;
          }
          return parsed;
        } catch (_) {
          return null;
        }
      }

      function clearPendingBookingPayment() {
        try {
          window.sessionStorage.removeItem(BOOKING_GATEWAY_STATE_KEY);
        } catch (_) {
          // Ignore storage failures.
        }
      }

      function cleanBookingPaymentCallbackQuery() {
        if (window.history && typeof window.history.replaceState === 'function') {
          const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }

      function closeBookingPaymentSuccessModal() {
        const modal = document.getElementById('bookingPaymentSuccessModal');
        if (!modal) return;
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.wallet-modal.show')) {
          document.body.style.overflow = '';
        }
      }

      function openBookingPaymentSuccessModal(summary) {
        const modal = document.getElementById('bookingPaymentSuccessModal');
        if (!modal) return;

        const reservationEl = document.getElementById('bookingSuccessReservation');
        const serviceEl = document.getElementById('bookingSuccessService');
        const dateTimeEl = document.getElementById('bookingSuccessDateTime');
        const amountEl = document.getElementById('bookingSuccessAmount');

        if (reservationEl) reservationEl.textContent = summary.reservationCode || '-';
        if (serviceEl) serviceEl.textContent = summary.service || '-';
        if (dateTimeEl) dateTimeEl.textContent = summary.dateTime || '-';
        if (amountEl) amountEl.textContent = summary.amount || '-';

        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }

      function summarizeBookingPaymentResult(result, pendingState) {
        const booking = (result && result.booking) || {};
        const services = Array.isArray(booking.services) ? booking.services : (booking.service ? [booking.service] : []);
        const serviceNames = services.map(function (svc) {
          return svc && (svc.name || svc.title);
        }).filter(Boolean).join(', ');

        const dateLabel = fmtBkDate(booking.bookingDate || (pendingState && pendingState.bookingDate) || '') || '-';
        const timeLabel = fmtBkTime(booking.bookingTime || (pendingState && pendingState.bookingTime) || '') || '-';

        const amountValue = Number(
          (result && result.totalAmount) ||
          booking.totalAmount ||
          (pendingState && pendingState.amountDue) ||
          0
        );

        return {
          reservationCode: (result && result.reservationCode) || booking.reservationCode || booking.id || '-',
          service: serviceNames || (pendingState && pendingState.serviceNames) || 'Booking Service',
          dateTime: `${dateLabel} at ${timeLabel}`,
          amount: fmtNaira(amountValue)
        };
      }

      async function verifyBookingPaymentFromDashboard(bookingPaymentReference, provider) {
        const endpoints = bookingPaymentEndpoints();
        const response = await APIHelper.request(endpoints.VERIFY, {
          method: 'POST',
          body: JSON.stringify({
            bookingPaymentReference: bookingPaymentReference,
            provider: provider || BOOKING_GATEWAY_PROVIDER
          })
        });

        const data = (response && response.data) || {};
        return {
          booking: data.booking || {},
          reservationCode: data.reservationCode || (data.booking && data.booking.reservationCode) || '',
          totalAmount: Number(data.totalAmount || (data.booking && data.booking.totalAmount) || 0),
          message: data.message || (response && response.message) || 'Booking payment verified successfully.'
        };
      }

      async function getBookingPaymentStatusFromDashboard(bookingPaymentReference) {
        const endpoints = bookingPaymentEndpoints();
        const response = await APIHelper.request(
          `${endpoints.BASE}/${encodeURIComponent(bookingPaymentReference)}`,
          { method: 'GET' }
        );

        const data = (response && response.data) || {};
        return {
          status: String(data.status || '').toUpperCase(),
          amount: Number(data.amount || 0),
          booking: data.booking || {},
          reservationCode: data.reservationCode || (data.booking && data.booking.reservationCode) || ''
        };
      }

      async function handleBookingPaymentCallbackOnDashboard() {
        const params = new URLSearchParams(window.location.search);
        const pendingState = readPendingBookingPayment();

        const status = (
          params.get('status') ||
          params.get('paymentStatus') ||
          params.get('payment_status') ||
          params.get('transactionStatus') ||
          ''
        ).toLowerCase();

        const bookingPaymentReference =
          params.get('bookingPaymentReference') ||
          params.get('booking_payment_reference') ||
          params.get('paymentReference') ||
          (pendingState && pendingState.bookingPaymentReference) ||
          '';

        const provider = normalizeGatewayProvider(
          params.get('provider') ||
          params.get('paymentProvider') ||
          (pendingState && pendingState.provider) ||
          BOOKING_GATEWAY_PROVIDER
        );

        const hasCallbackSignal = Boolean(
          pendingState ||
          bookingPaymentReference ||
          status ||
          params.get('paymentStatus') ||
          params.get('payment_status')
        );

        if (!hasCallbackSignal) return;

        cleanBookingPaymentCallbackQuery();

        if (status && isFailedGatewayStatus(status)) {
          clearPendingBookingPayment();
          if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
            UIHelper.showToast('Booking payment was not completed. Please try again.', 'info');
          }
          return;
        }

        if (!bookingPaymentReference) {
          clearPendingBookingPayment();
          if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
            UIHelper.showToast('Booking payment reference is missing. Please contact support.', 'error');
          }
          return;
        }

        let verifiedResult = null;
        try {
          verifiedResult = await verifyBookingPaymentFromDashboard(bookingPaymentReference, provider);
        } catch (verifyError) {
          try {
            const statusResult = await getBookingPaymentStatusFromDashboard(bookingPaymentReference);

            if (statusResult.status === 'COMPLETED' && statusResult.booking && statusResult.booking.id) {
              verifiedResult = {
                booking: statusResult.booking,
                reservationCode: statusResult.reservationCode,
                totalAmount: Number(statusResult.booking.totalAmount || statusResult.amount || 0),
                message: 'Booking payment verified and booking created.'
              };
            } else if (statusResult.status === 'PENDING') {
              if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
                UIHelper.showToast('Payment is still pending. Please wait a moment and refresh.', 'info', 4200);
              }
              return;
            } else if (statusResult.status === 'FAILED') {
              clearPendingBookingPayment();
              if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
                UIHelper.showToast('Payment failed. Please try again.', 'error');
              }
              return;
            } else {
              throw verifyError;
            }
          } catch (statusError) {
            const message = (verifyError && verifyError.message) || (statusError && statusError.message) || 'Could not verify booking payment.';
            if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
              UIHelper.showToast(message, 'error', 5000);
            }
            return;
          }
        }

        if (!verifiedResult || !verifiedResult.booking || !verifiedResult.booking.id) {
          if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
            UIHelper.showToast('Payment verified but booking details were not returned. Please contact support.', 'error', 5000);
          }
          return;
        }

        sessionStorage.removeItem('selectedServices');
        clearPendingBookingPayment();
        openBookingPaymentSuccessModal(summarizeBookingPaymentResult(verifiedResult, pendingState));

        if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
          UIHelper.showToast((verifiedResult && verifiedResult.message) || 'Payment successful. Booking confirmed.', 'success', 1800);
        }
      }

    // ── Fallback service backgrounds ────────────────────────────────────────
    var _svcBgs = [
      'url("https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80")',
      'url("https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80")',
      'url("https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80")',
      'url("https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80")',
      'url("https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80")'
    ];

    function buildServiceCard(svc, idx) {
      var name  = svc.name  || svc.title || 'Service';
      var desc  = svc.description || svc.desc || '';
      var price = Number(svc.price || svc.basePrice || svc.amount || 0);
      var duration = Number(svc.duration || svc.durationMinutes || svc.estimatedDuration || 0);
      var imgUrl = (svc.imageUrl || svc.image || svc.coverImage || svc.thumbnail || '');
      var bg = imgUrl
        ? "url('" + imgUrl + "')"
        : _svcBgs[idx % _svcBgs.length];
      var costHtml = price > 0
        ? '<div class="service-cost">From \u20a6' + price.toLocaleString() + '</div>'
        : '';
      var href = 'booking.html';
      if (svc.id) {
        var token = encodeBookingParams({
          services: [{
            id: String(svc.id),
            name: String(name),
            price: price,
            duration: duration
          }],
          totalPrice: price,
          totalDuration: duration
        });
        if (token) {
          href = 'booking.html?d=' + encodeURIComponent(token);
        }
      }
      return [
        '<div class="service-item" style="background-image:' + bg + '">',
          '<div class="service-card-content">',
            '<h4 class="heading-regular">' + name + '</h4>',
            desc ? '<p class="p-regular">' + desc + '</p>' : '',
            costHtml,
            '<a href="' + href + '" class="button-green w-inline-block"><div>Book Service</div></a>',
          '</div>',
        '</div>'
      ].join('');
    }

    async function loadDashboardServices() {
      var grid = document.getElementById('dashServicesGrid');
      if (!grid) return;
      try {
        var res = await ServicesAPI.getServices({ status: 'ACTIVE' });
        var d = (res && res.data) ? res.data : res;
        var list = Array.isArray(d.services) ? d.services
          : Array.isArray(d.items)   ? d.items
          : Array.isArray(d.results) ? d.results
          : Array.isArray(d)         ? d : [];
        list = list.slice(0, 3);
        if (!list.length) {
          grid.innerHTML = '<div class="bookings-state" style="grid-column:1/-1;">No services available right now.</div>';
        } else {
          grid.innerHTML = list.map(function(s, i) { return buildServiceCard(s, i); }).join('');
        }
      } catch (_) {
        if (grid) grid.innerHTML = '<div class="bookings-state" style="grid-column:1/-1;">Could not load services.</div>';
      }
    }

    // ── Stored rows for modal lookup ─────────────────────────────────────────
    let _dashBookings = [];

    function buildBookingCard(bk, index) {
      const services = Array.isArray(bk.services) ? bk.services : (bk.service ? [bk.service] : []);
      const primaryName = services.length
        ? (services[0].name || services[0].title || 'Service')
        : (bk.serviceName || bk.title || 'Service');
      const extra = services.length > 1 ? `<span class="booking-svc-extra">+${services.length - 1} more</span>` : '';

      const status = (bk.status || 'pending').toLowerCase();
      const statusCls = status.replace(/_/g, '-');
      const statusLabel = status.replace(/_/g, ' ');

      const dateStr = bk.bookingDate || bk.date || (bk.schedule && bk.schedule.date) || '';
      const timeStr = bk.bookingTime || bk.time || (bk.schedule && bk.schedule.time) || '';
      const datePart = fmtBkDate(dateStr), timePart = fmtBkTime(timeStr);
      const dateLine = [datePart, timePart].filter(Boolean).join(' \u00b7 ');
      const bookingType = normalizeBookingType(bk.bookingType);
      const bookingTypeLabel = fmtBookingType(bookingType);

      const addr = (bk.address && (
        bk.address.fullAddress
        || bk.address.streetAddress
        || [bk.address.streetAddress, bk.address.city, bk.address.state, bk.address.country].filter(Boolean).join(', ')
      ))
        || bk.fullAddress
        || bk.streetAddress
        || '';
      const location = fmtBookingLocation(bookingType, addr);

      const amount = Number(bk.totalAmount || bk.amount
        || (bk.service && bk.service.price) || 0);

      return `
        <div class="booking-card">
          <div class="booking-top">
            <div class="booking-services">
              <span class="p-s">${primaryName}</span>${extra}
            </div>
            <div class="booking-status ${statusCls}">${statusLabel}</div>
          </div>
          <div class="booking-body">
            ${dateLine ? `<div class="booking-meta"><span class="booking-meta-icon">&#128197;</span><span class="booking-meta-text">${dateLine}</span></div>` : ''}
            ${bookingTypeLabel !== '-' ? `<div class="booking-meta"><span class="booking-meta-icon">&#127968;</span><span class="booking-meta-text">${bookingTypeLabel}</span></div>` : ''}
            ${location ? `<div class="booking-meta"><span class="booking-meta-icon">&#128205;</span><span class="booking-meta-text">${location}</span></div>` : ''}
            ${amount > 0 ? `<div class="booking-amount">${fmtNaira(amount)}</div>` : ''}
          </div>
          <div class="booking-actions">
            <button type="button" class="button-green w-inline-block" onclick="openDashBkModal(${index})" style="cursor:pointer;"><div>View Details</div></button>
          </div>
        </div>`;
    }

    // ── Modal open / close ───────────────────────────────────────────────────
    function _dbkSet(id, val, rowId) {
      const span = document.getElementById(id);
      if (span) span.textContent = val || '-';
      if (rowId) {
        const row = document.getElementById(rowId);
        if (row) row.style.display = (val && val !== '-') ? '' : 'none';
      }
    }

    function _populateDashModal(bk, allNames, primaryName) {
      const status = (bk.status || 'pending').toLowerCase();
      const statusCls = status.replace(/_/g, '-');
      const paymentStatus = (bk.paymentStatus || bk.payment_state || '').toLowerCase();
      const dateStr = bk.bookingDate || bk.date || (bk.schedule && bk.schedule.date) || '';
      const timeStr = bk.bookingTime || bk.time || (bk.schedule && bk.schedule.time) || '';
      const addr = (bk.address && (
        bk.address.fullAddress
        || bk.address.streetAddress
        || [bk.address.streetAddress, bk.address.city, bk.address.state, bk.address.country].filter(Boolean).join(', ')
      ))
        || bk.fullAddress
        || bk.streetAddress
        || '-';
      const bookingType = normalizeBookingType(bk.bookingType);
      const amount = Number(bk.totalAmount || bk.amount || (bk.service && bk.service.price) || 0);

      document.getElementById('dashBkTitle').textContent = primaryName;
      document.getElementById('dashBkBadges').innerHTML =
        `<span class="booking-status ${statusCls}" style="font-size:11px;">${status.replace(/_/g,' ')}</span>` +
        (paymentStatus ? `<span class="tx-pill payment-${paymentStatus}" style="font-size:11px;margin-left:4px;">${paymentStatus}</span>` : '');
      document.getElementById('dashBkResCode').textContent    = bk.reservationCode || '-';
      document.getElementById('dashBkId').textContent         = bk.id || '-';
      document.getElementById('dashBkDate').textContent       = fmtBkDate(dateStr) || '-';
      document.getElementById('dashBkTime').textContent       = fmtBkTime(timeStr) || '-';
      document.getElementById('dashBkBookingType').textContent = fmtBookingType(bookingType);
      document.getElementById('dashBkAddr').textContent       = fmtBookingLocation(bookingType, addr);
      const addrLabel = document.getElementById('dashBkAddrLabel');
      if (addrLabel) addrLabel.textContent = bookingType === 'WALK_IN' ? 'Location' : 'Address';
      document.getElementById('dashBkNotes').textContent      = bk.notes || 'None';
      document.getElementById('dashBkService').textContent    = allNames;
      document.getElementById('dashBkAmount').textContent     = amount > 0 ? fmtNaira(amount) : '-';
      document.getElementById('dashBkPay').textContent        = (bk.paymentMethod || bk.payment_method || 'WALLET').toUpperCase();
      document.getElementById('dashBkCreated').textContent    = bk.createdAt ? fmtBkDate(bk.createdAt) : '-';
      _dbkSet('dashBkGuestName',    bk.guestName,    'dashBkGuestNameRow');
      _dbkSet('dashBkGuestPhone',   bk.guestPhone,   'dashBkGuestPhoneRow');
      _dbkSet('dashBkGuestEmail',   bk.guestEmail,   'dashBkGuestEmailRow');
      _dbkSet('dashBkCancelReason', bk.cancelReason, 'dashBkCancelReasonRow');
      const user    = bk.user;
      const custSec = document.getElementById('dashBkCustomerSection');
      if (custSec) custSec.style.display = user ? '' : 'none';
      if (user) {
        document.getElementById('dashBkCustomerName').textContent  = [user.firstName, user.lastName].filter(Boolean).join(' ') || '-';
        document.getElementById('dashBkCustomerEmail').textContent = user.email || '-';
        document.getElementById('dashBkCustomerPhone').textContent = user.phone || '-';
      }
    }

    async function openDashBkModal(index) {
      const bk = _dashBookings[index];
      if (!bk) return;

      const services = Array.isArray(bk.services) ? bk.services : (bk.service ? [bk.service] : []);
      const allNames = services.map(s => s.name || s.title || 'Service').join(', ')
        || bk.serviceName || bk.title || 'Service';
      const primaryName = services.length
        ? (services[0].name || services[0].title || 'Service')
        : (bk.serviceName || bk.title || 'Service');

      // Populate with cached data immediately
      _populateDashModal(bk, allNames, primaryName);

      const modal = document.getElementById('dashBkModal');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      // Refresh from API: GET /bookings/{id}
      try {
        const res = await APIHelper.request(`${API_CONFIG.ENDPOINTS.BOOKINGS}/${bk.id}`, { method: 'GET' });
        const d = (res && res.data) ? res.data : res;
        if (!d || !d.id || !modal.classList.contains('show')) return;
        const svcs = Array.isArray(d.services) ? d.services : (d.service ? [d.service] : services);
        const freshNames = svcs.map(s => s.name || s.title || 'Service').join(', ') || d.serviceName || d.title || allNames;
        const freshPrimary = svcs.length ? (svcs[0].name || svcs[0].title || 'Service') : (d.serviceName || d.title || primaryName);
        _populateDashModal(d, freshNames, freshPrimary);
      } catch (_) {
        // silently keep showing cached data
      }
    }

    function closeDashBkModal() {
      const modal = document.getElementById('dashBkModal');
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    async function loadDashboardBookings() {
      const grid = document.getElementById('bookingsGrid');
      if (!grid) return;
      try {
        const res = await APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS + '/user', { method: 'GET' });
        const d = (res && res.data) ? res.data : res;
        let rows = Array.isArray(d.bookings) ? d.bookings
          : Array.isArray(d.items)   ? d.items
          : Array.isArray(d.results) ? d.results
          : Array.isArray(d)         ? d : [];

        rows = rows.slice().sort(function (a, b) {
          return new Date(b.bookingDate || b.date || b.createdAt || 0)
               - new Date(a.bookingDate || a.date || a.createdAt || 0);
        }).slice(0, 3);

        _dashBookings = rows;

        if (!rows.length) {
          grid.innerHTML = '<div class="bookings-state">No bookings yet. <a href="services.html" style="color:#8c5e1a;font-weight:600;">Book a service!</a></div>';
        } else {
          grid.innerHTML = rows.map((bk, i) => buildBookingCard(bk, i)).join('');
        }
      } catch (_) {
        const g = document.getElementById('bookingsGrid');
        if (g) g.innerHTML = '<div class="bookings-state">Could not load bookings.</div>';
      }
    }

    // ── Referral mini card ────────────────────────────────────────────────────
    async function loadMiniReferral() {
      try {
        const res  = await APIHelper.request(API_CONFIG.ENDPOINTS.REFERRALS);
        const data = res && res.data ? res.data : res;
        const code = data.code || '';
        const el   = document.getElementById('miniRefCode');
        if (el) el.textContent = code || '—';
        document.getElementById('miniCopyBtn').addEventListener('click', async function () {
          if (!code) return;
          const link = window.location.origin + '/sign-up.html?code=' + encodeURIComponent(code);
          try {
            await navigator.clipboard.writeText(link);
          } catch {
            const ta = document.createElement('textarea');
            ta.value = link; ta.style.position='fixed'; ta.style.opacity='0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          }
          const orig = this.textContent;
          this.textContent = '✓ Copied!';
          setTimeout(() => { this.textContent = orig; }, 2000);
        });
      } catch (_) {
        const el = document.getElementById('miniRefCode');
        if (el) el.textContent = '—';
      }
    }

    // ── Init ─────────────────────────────────────────────────────────────────
      document.addEventListener('DOMContentLoaded', async function () {
        await handleBookingPaymentCallbackOnDashboard();

        if (window.WalletDashboard && typeof window.WalletDashboard.init === 'function') {
          await window.WalletDashboard.init();
        }
        loadDashboardBookings();
        loadDashboardServices();
        loadMiniReferral();

      // Modal close handlers
      document.getElementById('dashBkClose').addEventListener('click', closeDashBkModal);
      document.getElementById('dashBkModalClose').addEventListener('click', function(e) { e.preventDefault(); closeDashBkModal(); });
      document.getElementById('dashBkModal').addEventListener('click', function(e) { if (e.target === this) closeDashBkModal(); });

        var bookingSuccessClose = document.getElementById('bookingSuccessClose');
        if (bookingSuccessClose) {
          bookingSuccessClose.addEventListener('click', function (e) {
            e.preventDefault();
            closeBookingPaymentSuccessModal();
          });
        }

        var bookingSuccessModal = document.getElementById('bookingPaymentSuccessModal');
        if (bookingSuccessModal) {
          bookingSuccessModal.addEventListener('click', function (e) {
            if (e.target === this) closeBookingPaymentSuccessModal();
          });
        }
    });