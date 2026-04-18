
    document.addEventListener('DOMContentLoaded', function () {
      const state = {
        all: [], filtered: [], page: 1, pageSize: 8,
        search: '', payment: 'all', status: 'all'
      };

      // ── DOM refs ──────────────────────────────────────────────────
      const txSearch         = document.getElementById('txSearch');
      const txTypeFilter     = document.getElementById('txTypeFilter');
      const txStatusFilter   = document.getElementById('txStatusFilter');
      const txTableBody      = document.getElementById('txTableBody');
      const txPaginationInfo = document.getElementById('txPaginationInfo');
      const txPrevPage       = document.getElementById('txPrevPage');
      const txNextPage       = document.getElementById('txNextPage');
      const txPageNumbers    = document.getElementById('txPageNumbers');

      // Detail modal refs
      const bkDetailModal       = document.getElementById('bkDetailModal');
      const bkRescheduleSection = document.getElementById('bkRescheduleSection');
      const bkRescheduleDate    = document.getElementById('bkRescheduleDate');
      const bkRescheduleTime    = document.getElementById('bkRescheduleTime');
      let activeBookingId = null;

      // ── Formatters ────────────────────────────────────────────────
      function formatAmount(v) { return `\u20a6${Number(v || 0).toLocaleString()}`; }

      function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return isNaN(d) ? dateStr : d.toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      function formatScheduleDate(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
        return isNaN(d) ? dateStr : d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
      }

      function formatScheduleTime(timeStr) {
        if (!timeStr || timeStr === '-') return '-';
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        const h = parseInt(parts[0], 10);
        const m = String(parts[1]).padStart(2, '0');
        const period = h >= 12 ? 'PM' : 'AM';
        const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${dh}:${m} ${period}`;
      }

      function normalizeBookingType(type) {
        const t = String(type || '').toUpperCase();
        if (t === 'WALK_IN' || t === 'WALKIN') return 'WALK_IN';
        if (t === 'HOME_SERVICE' || t === 'HOME') return 'HOME_SERVICE';
        return '';
      }

      function formatBookingType(type) {
        const t = normalizeBookingType(type);
        if (t === 'WALK_IN') return 'Walk-In (Store)';
        if (t === 'HOME_SERVICE') return 'Mobile Service';
        return '-';
      }

      function formatBookingLocation(type, address) {
        return normalizeBookingType(type) === 'WALK_IN' ? 'At the salon' : (address || '-');
      }

      // ── Data normalisation ────────────────────────────────────────
      function normalizeTx(tx) {
        const status = (tx.status || 'pending').toString().toLowerCase();
        const paymentRaw = tx.paymentStatus || (tx.payment && tx.payment.status) || tx.payment_state;
        const paymentStatus = paymentRaw
          ? String(paymentRaw).toLowerCase()
          : (status === 'completed' || status === 'confirmed' || status === 'successful' || status === 'in_progress' ? 'paid' : 'pending');
        // services may come back as an array (multi-service bookings) or a single service object
        const serviceObj = Array.isArray(tx.services) && tx.services.length
          ? tx.services[0]
          : (tx.service || null);
        const serviceCount = Array.isArray(tx.services) ? tx.services.length : 1;
        const serviceBaseName = (serviceObj && (serviceObj.name || serviceObj.title)) || tx.serviceName || tx.title || 'Service';
        const serviceName = serviceCount > 1 ? `${serviceCount} Services (${serviceBaseName}, …)` : serviceBaseName;
        const scheduleDate = tx.date || tx.bookingDate || (tx.schedule && tx.schedule.date) || '-';
        const scheduleTime = tx.time || tx.bookingTime || (tx.schedule && tx.schedule.time) || '-';
        const totalAmt = Number(tx.amount || tx.totalAmount || tx.total || (serviceObj && serviceObj.price) || 0);
        const bookingType = normalizeBookingType(tx.bookingType);
        const address = (tx.address && (
          tx.address.fullAddress
          || tx.address.streetAddress
          || [tx.address.streetAddress, tx.address.city, tx.address.state, tx.address.country].filter(Boolean).join(', ')
        )) || tx.fullAddress || tx.streetAddress || '-';
        return {
          id:            tx.id || tx.booking_id || tx.reference || `bk_${Math.random().toString(36).slice(2, 8)}`,
          reservationCode: tx.reservationCode || '',
          createdAt:     tx.createdAt || tx.created_at || tx.updatedAt || new Date().toISOString(),
          serviceName,  status, paymentStatus, scheduleDate, scheduleTime,
          address,
          amount:        totalAmt,
          notes:         tx.notes || '',
          paymentMethod: (tx.paymentMethod || tx.payment_method || 'WALLET').toUpperCase(),
          bookingType,
          _raw:          tx
        };
      }

      // ── API load ──────────────────────────────────────────────────
      async function loadTransactions() {
        try {
          if (typeof APIHelper === 'undefined' || typeof API_CONFIG === 'undefined') throw new Error('Booking helper not loaded.');
          const response = await APIHelper.request(`${API_CONFIG.ENDPOINTS.BOOKINGS}/user`, { method: 'GET' });
          const data = response && response.data ? response.data : response;
          const rows = Array.isArray(data.bookings) ? data.bookings
            : Array.isArray(data.items)   ? data.items
            : Array.isArray(data.results) ? data.results
            : Array.isArray(data)         ? data : [];
          state.all = rows.map(normalizeTx).sort((a, b) =>
            new Date(b.createdAt || b.bookingDate || 0) - new Date(a.createdAt || a.bookingDate || 0)
          );
        } catch (error) {
          state.all = [];
          if (typeof UIHelper !== 'undefined') {
            const msg = Array.isArray(error && error.message) ? error.message.join(', ') : ((error && error.message) || 'Unable to load bookings.');
            UIHelper.showToast(msg, 'error');
          }
        }
      }

      // ── Filtering + render ────────────────────────────────────────
      function applyFilters() {
        const q = state.search.trim().toLowerCase();
        state.filtered = state.all.filter(tx => {
          const matchPayment = state.payment === 'all' || tx.paymentStatus === state.payment;
          const matchStatus  = state.status  === 'all' || tx.status === state.status;
          const hay = `${tx.serviceName} ${tx.id} ${tx.address} ${formatDate(tx.createdAt)}`.toLowerCase();
          return matchPayment && matchStatus && (!q || hay.includes(q));
        });
        const tp = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        if (state.page > tp) state.page = tp;
      }

      function renderRows() {
        if (!state.filtered.length) { txTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">No bookings found.</td></tr>`; return; }
        const start    = (state.page - 1) * state.pageSize;
        const pageRows = state.filtered.slice(start, start + state.pageSize);
        txTableBody.innerHTML = pageRows.map(tx => {
          const dateDisplay = formatScheduleDate(tx.scheduleDate);
          const timeDisplay = formatScheduleTime(tx.scheduleTime);
          const bookingTypeLabel = formatBookingType(tx.bookingType);
          const locationLabel = formatBookingLocation(tx.bookingType, tx.address);
          const resCode     = tx.reservationCode ? `<span class="res-code">${tx.reservationCode}</span>` : `<span style="font-size:11px;color:var(--muted);">—</span>`;
          return `<tr class="clickable-row" data-booking-id="${tx.id}" title="Click to view details">
            <td>${resCode}</td>
            <td><div class="tx-description">${tx.serviceName}</div><div class="tx-sub">${bookingTypeLabel} &middot; ${dateDisplay} &middot; ${timeDisplay}</div></td>
            <td><span class="tx-pill status-${tx.status}">${tx.status.replace(/_/g,' ')}</span></td>
            <td><span class="tx-pill payment-${tx.paymentStatus}">${tx.paymentStatus}</span></td>
            <td>${dateDisplay}<br><span style="font-size:12px;color:var(--muted);">${timeDisplay}</span></td>
            <td style="font-size:12px;">${locationLabel}</td>
            <td class="tx-amount">${formatAmount(tx.amount)}</td>
            <td style="font-size:12px;">${formatDate(tx.createdAt)}</td>
          </tr>`;
        }).join('');
      }

      function renderPagination() {
        const total = state.filtered.length;
        const tp    = Math.max(1, Math.ceil(total / state.pageSize));
        const start = total ? (state.page - 1) * state.pageSize + 1 : 0;
        const end   = Math.min(state.page * state.pageSize, total);
        txPaginationInfo.textContent = `Showing ${start}-${end} of ${total} bookings`;
        txPrevPage.disabled = state.page <= 1;
        txNextPage.disabled = state.page >= tp;
        const pages = [], from = Math.max(1, state.page - 1), to = Math.min(tp, state.page + 1);
        for (let p = from; p <= to; p++) pages.push(`<button type="button" class="page-btn ${p === state.page ? 'active' : ''}" data-page="${p}">${p}</button>`);
        txPageNumbers.innerHTML = pages.join('');
      }

      function render() { applyFilters(); renderRows(); renderPagination(); }

      // ── Filter / pagination events ────────────────────────────────
      txSearch.addEventListener('input', () => { state.search = txSearch.value || ''; state.page = 1; render(); });
      txTypeFilter.addEventListener('change', () => { state.payment = txTypeFilter.value; state.page = 1; render(); });
      txStatusFilter.addEventListener('change', () => { state.status = txStatusFilter.value; state.page = 1; render(); });
      txPrevPage.addEventListener('click', () => { if (state.page > 1) { state.page--; render(); } });
      txNextPage.addEventListener('click', () => { const tp = Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); if (state.page < tp) { state.page++; render(); } });
      txPageNumbers.addEventListener('click', e => { const btn = e.target.closest('[data-page]'); if (btn) { state.page = Number(btn.dataset.page); render(); } });

      // ── Row click → detail modal ──────────────────────────────────
      txTableBody.addEventListener('click', function (e) {
        const row = e.target.closest('[data-booking-id]');
        if (!row) return;
        const tx = state.all.find(t => t.id === row.getAttribute('data-booking-id'));
        if (tx) openDetailModal(tx);
      });

      // ── Detail modal: open / close ────────────────────────────────
      function openDetailModal(tx) {
        activeBookingId = tx.id;
        bkRescheduleSection.style.display = 'none';
        bkRescheduleDate.value = '';
        bkRescheduleTime.innerHTML = '<option value="">— pick date first —</option>';

        // ── helper: show/hide a row based on value ─────────────────
        function _bkSet(id, val, rowId) {
          const span = document.getElementById(id);
          if (span) span.textContent = val || '-';
          if (rowId) {
            const row = document.getElementById(rowId);
            if (row) row.style.display = (val && val !== '-') ? '' : 'none';
          }
        }

        // Populate with cached data immediately
        const _raw = tx._raw || tx;
        const bookingType = normalizeBookingType(tx.bookingType);
        document.getElementById('bkModalServiceName').textContent = tx.serviceName;
        document.getElementById('bkModalId').textContent          = tx.id;
        document.getElementById('bkModalResCode').textContent     = tx.reservationCode || '-';
        document.getElementById('bkModalDate').textContent        = formatScheduleDate(tx.scheduleDate);
        document.getElementById('bkModalTime').textContent        = formatScheduleTime(tx.scheduleTime);
        document.getElementById('bkModalBookingType').textContent = formatBookingType(bookingType);
        document.getElementById('bkModalAddress').textContent     = formatBookingLocation(bookingType, tx.address);
        const modalAddrLabel = document.getElementById('bkModalAddressLabel');
        if (modalAddrLabel) modalAddrLabel.textContent = bookingType === 'WALK_IN' ? 'Location' : 'Address';
        document.getElementById('bkModalNotes').textContent       = tx.notes || 'None';
        document.getElementById('bkModalService2').textContent    = tx.serviceName;
        document.getElementById('bkModalAmount').textContent      = formatAmount(tx.amount);
        document.getElementById('bkModalPayMethod').textContent   = tx.paymentMethod || 'WALLET';
        document.getElementById('bkModalCreated').textContent     = formatDate(tx.createdAt);
        _bkSet('bkModalGuestName',  _raw.guestName,    'bkModalGuestNameRow');
        _bkSet('bkModalGuestPhone', _raw.guestPhone,   'bkModalGuestPhoneRow');
        _bkSet('bkModalGuestEmail', _raw.guestEmail,   'bkModalGuestEmailRow');
        _bkSet('bkModalCancelReason', _raw.cancelReason, 'bkModalCancelReasonRow');
        const _initUser = _raw.user;
        const _custSec  = document.getElementById('bkModalCustomerSection');
        if (_custSec) _custSec.style.display = _initUser ? '' : 'none';
        if (_initUser) {
          document.getElementById('bkModalCustomerName').textContent  = [_initUser.firstName, _initUser.lastName].filter(Boolean).join(' ') || '-';
          document.getElementById('bkModalCustomerEmail').textContent = _initUser.email || '-';
          document.getElementById('bkModalCustomerPhone').textContent = _initUser.phone || '-';
        }

        document.getElementById('bkModalBadges').innerHTML =
          `<span class="tx-pill status-${tx.status}" style="margin-right:4px;">${tx.status.replace(/_/g,' ')}</span>` +
          `<span class="tx-pill payment-${tx.paymentStatus}">${tx.paymentStatus}</span>`;

        const canReschedule = ['pending','confirmed'].includes(tx.status);
        document.getElementById('bkModalRescheduleBtn').style.display = canReschedule ? '' : 'none';

        bkDetailModal.classList.add('show');
        document.body.style.overflow = 'hidden';

        // Refresh from API: GET /bookings/{id}
        APIHelper.request(`${API_CONFIG.ENDPOINTS.BOOKINGS}/${tx.id}`, { method: 'GET' })
          .then(res => {
            const d = (res && res.data) ? res.data : res;
            if (!d || !d.id || activeBookingId !== tx.id) return;

            const svcs = Array.isArray(d.services) ? d.services : (d.service ? [d.service] : []);
            const freshNames     = svcs.map(s => s.name || s.title || 'Service').join(', ') || d.serviceName || d.title || tx.serviceName;
            const freshStatus    = (d.status || tx.status).toLowerCase();
            const freshPayStatus = (d.paymentStatus || d.payment_state || tx.paymentStatus || '').toLowerCase();
            const freshDate      = d.bookingDate || d.date || (d.schedule && d.schedule.date) || tx.scheduleDate;
            const freshTime      = d.bookingTime || d.time || (d.schedule && d.schedule.time) || tx.scheduleTime;
            const freshAddr      = (d.address && (
              d.address.fullAddress
              || d.address.streetAddress
              || [d.address.streetAddress, d.address.city, d.address.state, d.address.country].filter(Boolean).join(', ')
            )) || d.fullAddress || d.streetAddress || tx.address;
            const freshAmt       = Number(d.totalAmount || d.amount || tx.amount);
            const freshBookingType = normalizeBookingType(d.bookingType || tx.bookingType);

            document.getElementById('bkModalServiceName').textContent = freshNames;
            document.getElementById('bkModalId').textContent          = d.id;
            document.getElementById('bkModalResCode').textContent     = d.reservationCode || tx.reservationCode || '-';
            document.getElementById('bkModalDate').textContent        = formatScheduleDate(freshDate);
            document.getElementById('bkModalTime').textContent        = formatScheduleTime(freshTime);
            document.getElementById('bkModalBookingType').textContent = formatBookingType(freshBookingType);
            document.getElementById('bkModalAddress').textContent     = formatBookingLocation(freshBookingType, freshAddr);
            const freshAddrLabel = document.getElementById('bkModalAddressLabel');
            if (freshAddrLabel) freshAddrLabel.textContent = freshBookingType === 'WALK_IN' ? 'Location' : 'Address';
            document.getElementById('bkModalNotes').textContent       = d.notes || 'None';
            document.getElementById('bkModalService2').textContent    = freshNames;
            document.getElementById('bkModalAmount').textContent      = formatAmount(freshAmt);
            document.getElementById('bkModalPayMethod').textContent   = (d.paymentMethod || d.payment_method || tx.paymentMethod || 'WALLET').toUpperCase();
            document.getElementById('bkModalCreated').textContent     = formatDate(d.createdAt || tx.createdAt);
            _bkSet('bkModalGuestName',    d.guestName,    'bkModalGuestNameRow');
            _bkSet('bkModalGuestPhone',   d.guestPhone,   'bkModalGuestPhoneRow');
            _bkSet('bkModalGuestEmail',   d.guestEmail,   'bkModalGuestEmailRow');
            _bkSet('bkModalCancelReason', d.cancelReason, 'bkModalCancelReasonRow');
            const freshUser = d.user;
            const custSec   = document.getElementById('bkModalCustomerSection');
            if (custSec) custSec.style.display = freshUser ? '' : 'none';
            if (freshUser) {
              document.getElementById('bkModalCustomerName').textContent  = [freshUser.firstName, freshUser.lastName].filter(Boolean).join(' ') || '-';
              document.getElementById('bkModalCustomerEmail').textContent = freshUser.email || '-';
              document.getElementById('bkModalCustomerPhone').textContent = freshUser.phone || '-';
            }

            document.getElementById('bkModalBadges').innerHTML =
              `<span class="tx-pill status-${freshStatus}" style="margin-right:4px;">${freshStatus.replace(/_/g,' ')}</span>` +
              (freshPayStatus ? `<span class="tx-pill payment-${freshPayStatus}">${freshPayStatus}</span>` : '');

            const freshCanReschedule = ['pending','confirmed'].includes(freshStatus);
            document.getElementById('bkModalRescheduleBtn').style.display = freshCanReschedule ? '' : 'none';
          })
          .catch(() => {}); // silently keep showing cached data
      }

      function closeDetailModal() {
        bkDetailModal.classList.remove('show');
        document.body.style.overflow = '';
        activeBookingId = null;
        bkRescheduleSection.style.display = 'none';
        document.getElementById('bkModalRescheduleBtn').querySelector('div').textContent = 'Reschedule';
      }

      document.getElementById('bkModalClose').addEventListener('click', closeDetailModal);
      document.getElementById('bkModalCloseBtn').addEventListener('click', e => { e.preventDefault(); closeDetailModal(); });
      bkDetailModal.addEventListener('click', e => { if (e.target === bkDetailModal) closeDetailModal(); });

      // ── Reschedule: toggle ────────────────────────────────────────
      document.getElementById('bkModalRescheduleBtn').addEventListener('click', function (e) {
        e.preventDefault();
        const open = bkRescheduleSection.style.display !== 'none';
        bkRescheduleSection.style.display = open ? 'none' : '';
        this.querySelector('div').textContent = open ? 'Reschedule' : 'Hide Reschedule';
        if (!open) bkRescheduleSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      document.getElementById('bkRescheduleCancel').addEventListener('click', e => {
        e.preventDefault();
        bkRescheduleSection.style.display = 'none';
        document.getElementById('bkModalRescheduleBtn').querySelector('div').textContent = 'Reschedule';
      });

      // ── Reschedule: load available time slots ─────────────────────
      function fmt12h(h, m) {
        const p = h >= 12 ? 'PM' : 'AM', dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${dh}:${String(m).padStart(2,'0')} ${p}`;
      }

      async function loadRescheduleSlots(date) {
        bkRescheduleTime.innerHTML = '<option value="">Loading\u2026</option>';
        bkRescheduleTime.disabled = true;
        try {
          const [hRes, eRes] = await Promise.all([
            APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS_BUSINESS_HOURS),
            APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS_BUSINESS_EXCEPTIONS)
          ]);
          const hours      = (hRes && hRes.data) || [];
          const exceptions = (eRes && eRes.data) || [];
          const [yr, mo, dy] = date.split('-').map(Number);
          const dow = new Date(yr, mo - 1, dy).getDay();
          const exc = exceptions.find(ex => {
            const d = new Date(ex.date);
            return d.getUTCFullYear() === yr && d.getUTCMonth() === mo - 1 && d.getUTCDate() === dy;
          });
          let openTime, closeTime;
          if (exc) {
            if (exc.isClosed) { bkRescheduleTime.innerHTML = '<option value="">Closed on this date</option>'; bkRescheduleTime.disabled = false; return; }
            openTime = exc.openTime; closeTime = exc.closeTime;
          } else {
            const day = hours.find(h => h.dayOfWeek === dow);
            if (!day || !day.isOpen) { bkRescheduleTime.innerHTML = '<option value="">Closed on this day</option>'; bkRescheduleTime.disabled = false; return; }
            openTime = day.openTime; closeTime = day.closeTime;
          }
          const minTime  = new Date(Date.now() + 2 * 3600 * 1000);
          const [oh, om] = openTime.split(':').map(Number);
          const [ch, cm] = closeTime.split(':').map(Number);
          const slots = [];
          for (let mins = oh * 60 + om; mins < ch * 60 + cm; mins += 30) {
            const sh = Math.floor(mins / 60), sm = mins % 60;
            if (new Date(yr, mo - 1, dy, sh, sm) > minTime) slots.push({ h: sh, m: sm });
          }
          if (!slots.length) { bkRescheduleTime.innerHTML = '<option value="">No slots available</option>'; }
          else {
            bkRescheduleTime.innerHTML = '<option value="">— select a time —</option>';
            slots.forEach(s => {
              const o = document.createElement('option');
              o.value = `${String(s.h).padStart(2,'0')}:${String(s.m).padStart(2,'0')}`;
              o.textContent = fmt12h(s.h, s.m);
              bkRescheduleTime.appendChild(o);
            });
          }
        } catch { bkRescheduleTime.innerHTML = '<option value="">Failed to load slots</option>'; }
        finally { bkRescheduleTime.disabled = false; }
      }

      bkRescheduleDate.addEventListener('change', () => { if (bkRescheduleDate.value) loadRescheduleSlots(bkRescheduleDate.value); });

      // ── Reschedule: save ──────────────────────────────────────────
      document.getElementById('bkRescheduleSave').addEventListener('click', async function (e) {
        e.preventDefault();
        if (!activeBookingId) return;
        const newDate = bkRescheduleDate.value, newTime = bkRescheduleTime.value;
        if (!newDate || !newTime) { if (typeof UIHelper !== 'undefined') UIHelper.showToast('Please select a date and time.', 'error'); return; }
        const label = this.querySelector('div'), orig = label.textContent;
        label.textContent = 'Saving\u2026'; this.style.pointerEvents = 'none'; this.style.opacity = '.75';
        try {
          await APIHelper.request(`${API_CONFIG.ENDPOINTS.BOOKINGS}/${activeBookingId}`, {
            method: 'PUT', body: JSON.stringify({ date: newDate, time: newTime })
          });
          if (typeof UIHelper !== 'undefined') UIHelper.showToast('Booking rescheduled successfully!', 'success');
          const tx = state.all.find(t => t.id === activeBookingId);
          if (tx) { tx.scheduleDate = newDate; tx.scheduleTime = newTime; }
          closeDetailModal(); render();
        } catch (err) {
          if (typeof UIHelper !== 'undefined') UIHelper.showToast((err && err.message) || 'Could not reschedule. Please try again.', 'error');
        } finally { label.textContent = orig; this.style.pointerEvents = ''; this.style.opacity = ''; }
      });

      // ── Init ──────────────────────────────────────────────────────
      txTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Loading booking history...</td></tr>';
      loadTransactions().then(render);
    });