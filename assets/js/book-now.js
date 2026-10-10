/**
 * Hairlux ad landing page (book-now.html).
 *
 * A visitor from an ad picks a walk-in service, a branch and a slot, enters
 * name, phone and email, and pays a deposit (or the full price) through the
 * Monnify checkout (card, bank transfer or USSD). Monnify sends them back here
 * with ?ref=HLADB-... (plus its own paymentReference), and the page shows the
 * reservation code and QR code once the booking is confirmed.
 *
 * Attribution: utm_* tags and the ad click id (fbclid / gclid / ttclid) are
 * kept in sessionStorage from the first page view and sent with the checkout,
 * so the booking is logged with its source (e.g. "Facebook Ad").
 * Meta Pixel (when an ID is set in admin): PageView, ViewContent on service
 * choice, InitiateCheckout on pay, Purchase on confirmation (eventID = the
 * payment reference, so it is counted once).
 */
(function () {
  'use strict';

  // config.js declares API_CONFIG with const, so it is not on window.
  var API = (typeof API_CONFIG !== 'undefined' && API_CONFIG.BASE_URL) || '';
  var ATTR_KEY = 'hlx_ad_attribution';
  var FORM_KEY = 'hlx_ad_booking_form';
  var REF_KEY = 'hlx_ad_booking_ref';

  var state = {
    config: null,
    services: [],
    branchId: null,
    date: null,
    time: null,
    payOption: 'DEPOSIT',
    slotsReq: 0,
  };

  var $ = function (id) { return document.getElementById(id); };

  // ─── Helpers ──────────────────────────────────────────────────────────

  function naira(v) {
    var n = Number(v) || 0;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function minutesLabel(mins) {
    var m = Number(mins) || 0;
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + (h === 1 ? ' hr' : ' hrs') + (r ? ' ' + r + ' min' : '');
  }

  function time12(hhmm) {
    var p = String(hhmm || '').split(':');
    var h = Number(p[0]), m = p[1] || '00';
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function dateObj(ymd) { return new Date(ymd + 'T12:00:00Z'); }

  function addDays(ymd, n) {
    var d = dateObj(ymd);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function longDate(ymd) {
    return dateObj(ymd).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  async function api(path, opts) {
    var res = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
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

  function store(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function load(storage, key) {
    try { var v = storage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  function show(id, on) { $(id).classList.toggle('bn-hidden', !on); }

  // ─── Attribution ──────────────────────────────────────────────────────

  function captureAttribution() {
    var q = new URLSearchParams(location.search);
    var saved = load(sessionStorage, ATTR_KEY) || {};
    var fresh = {};
    var UTM = { utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign', utm_content: 'utmContent', utm_term: 'utmTerm' };
    Object.keys(UTM).forEach(function (k) {
      var v = q.get(k);
      if (v) fresh[UTM[k]] = v.slice(0, 255);
    });
    ['fbclid', 'gclid', 'ttclid'].some(function (k) {
      var v = q.get(k);
      if (v) { fresh.clickId = v.slice(0, 255); fresh.clickIdType = k; return true; }
      return false;
    });
    // The landing page (salon.html) passes the same tags on to this page: that
    // is the same visit, so keep where it first landed. A different ad click
    // replaces the old attribution; a plain reload keeps it.
    var sameVisit = ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'clickId'].every(function (k) {
      return (fresh[k] || '') === (saved[k] || '');
    });
    var isNewTouch = Object.keys(fresh).length > 0 && !sameVisit;
    var attr = isNewTouch ? fresh : saved;
    if (isNewTouch || !saved.landingUrl) {
      attr.landingUrl = location.href.split('#')[0].slice(0, 255);
      attr.referrer = (document.referrer || '').slice(0, 255) || undefined;
    }
    store(sessionStorage, ATTR_KEY, attr);
    return attr;
  }

  function attribution() {
    var a = load(sessionStorage, ATTR_KEY) || {};
    var out = {};
    ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'clickId', 'clickIdType', 'landingUrl', 'referrer'].forEach(function (k) {
      if (a[k]) out[k] = a[k];
    });
    return out;
  }

  // ─── Meta Pixel ───────────────────────────────────────────────────────

  function initPixel(id) {
    if (!id || window.fbq) return;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  }

  function track(event, params, eventId) {
    if (!window.fbq) return;
    try {
      if (eventId) window.fbq('track', event, params || {}, { eventID: eventId });
      else window.fbq('track', event, params || {});
    } catch (e) { /* never block the booking */ }
  }

  // ─── Form ─────────────────────────────────────────────────────────────

  function servicePriceAt(service, branchId) {
    if (!service) return null;
    for (var i = 0; i < service.branches.length; i++) {
      if (service.branches[i].branchId === branchId) return service.branches[i];
    }
    return null;
  }

  function lowestPrice(service) {
    return service.branches.reduce(function (min, b) { return min === null || b.price < min ? b.price : min; }, null);
  }

  function branchById(id) {
    var list = state.config.branches;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function serviceById(id) {
    return state.config.services.filter(function (s) { return s.id === id; })[0] || null;
  }

  function isSelected(id) {
    return state.services.some(function (s) { return s.id === id; });
  }

  /** Services the branch offers, with that branch's price. */
  function servicesAtBranch(branchId) {
    if (!branchId) return [];
    return state.config.services.map(function (s) {
      var bp = servicePriceAt(s, branchId);
      return bp ? { service: s, price: bp.price } : null;
    }).filter(Boolean);
  }

  /** How many online-bookable services a branch has (branches with none are hidden). */
  function serviceCountAt(branchId) {
    return state.config.services.filter(function (s) { return !!servicePriceAt(s, branchId); }).length;
  }

  /** Same rule as the server: % of the combined price, at least the minimum, never more than the price. */
  function depositFor(total) {
    var c = state.config;
    if (!(total > 0)) return 0;
    var byPercent = Math.ceil(total * Math.max(0, c.depositPercent) / 100);
    return Math.min(total, Math.max(byPercent, Math.max(0, Math.round(c.minDepositAmount))));
  }

  function totalDuration() {
    return state.services.reduce(function (sum, s) { return sum + (Number(s.duration) || 0); }, 0);
  }

  function servicesLabel() {
    return state.services.map(function (s) { return s.name; }).join(' + ');
  }

  /**
   * After the branch changes: keep only the services that branch offers and
   * say which were dropped. Returns the names removed.
   */
  function keepServicesAtBranch() {
    var removed = [];
    state.services = state.services.filter(function (s) {
      var ok = !!servicePriceAt(s, state.branchId);
      if (!ok) removed.push(s.name);
      return ok;
    });
    return removed;
  }

  function showServicesNote(msg) {
    var el = $('bnServicesNote');
    el.textContent = msg || '';
    el.classList.toggle('bn-hidden', !msg);
  }

  function renderBranches() {
    var list = state.config.branches.filter(function (b) { return serviceCountAt(b.id) > 0; });
    $('bnBranches').innerHTML = list.length ? list.map(function (b) {
      var n = serviceCountAt(b.id);
      return '<button type="button" class="bn-option" role="radio" aria-checked="' + (state.branchId === b.id) + '" data-branch="' + esc(b.id) + '">' +
        '<span class="bn-check"></span>' +
        '<span class="bn-option-body"><span class="bn-option-name">' + esc(b.name) + '</span>' +
        '<span class="bn-option-meta">' + esc(b.address) + '</span></span>' +
        '<span class="bn-option-meta" style="white-space:nowrap">' + n + (n === 1 ? ' service' : ' services') + '</span>' +
        '</button>';
    }).join('') : '<div class="bn-empty" style="grid-column:1/-1">No branch is taking online bookings right now.</div>';
  }

  function renderServices(filter) {
    var n = state.services.length;
    $('bnServicesHint').textContent = n ? n + ' selected' + (totalDuration() ? ' \u00B7 about ' + minutesLabel(totalDuration()) : '') : 'Choose one or more';
    if (!state.branchId) {
      $('bnServiceSearch').classList.add('bn-hidden');
      $('bnServices').innerHTML = '<div class="bn-empty" style="grid-column:1/-1">Choose a branch first to see its services and prices.</div>';
      return;
    }
    var available = servicesAtBranch(state.branchId);
    $('bnServiceSearch').classList.toggle('bn-hidden', available.length <= 8);
    var f = String(filter || '').trim().toLowerCase();
    var list = available.filter(function (x) {
      var s = x.service;
      return !f || s.name.toLowerCase().indexOf(f) !== -1 || String(s.category || '').toLowerCase().indexOf(f) !== -1;
    });
    $('bnServices').innerHTML = list.length ? list.map(function (x) {
      var s = x.service;
      return '<button type="button" class="bn-option" role="checkbox" aria-checked="' + isSelected(s.id) + '" data-service="' + esc(s.id) + '">' +
        '<span class="bn-check bn-check-box"></span>' +
        (s.imageUrl ? '<img class="bn-option-img" src="' + esc(s.imageUrl) + '" alt="" loading="lazy" />' : '') +
        '<span class="bn-option-body"><span class="bn-option-name">' + esc(s.name) + '</span>' +
        '<span class="bn-option-meta">' + (s.duration ? minutesLabel(s.duration) : '') + (s.category ? (s.duration ? ' \u00B7 ' : '') + esc(s.category) : '') + '</span></span>' +
        '<span class="bn-option-price">' + naira(x.price) + '</span>' +
        '</button>';
    }).join('') : '<div class="bn-empty" style="grid-column:1/-1">No service matches your search.</div>';
  }

  function renderDays() {
    var c = state.config;
    var days = Math.min(c.maxDaysAhead, 30);
    var html = '';
    for (var i = 0; i <= days; i++) {
      var d = addDays(c.today, i);
      var o = dateObj(d);
      var checked = state.date === d;
      html += '<button type="button" class="bn-day" role="radio" aria-checked="' + checked + '" data-date="' + d + '">' +
        '<small>' + (i === 0 ? 'Today' : i === 1 ? 'Tmrw' : o.toLocaleDateString('en-NG', { weekday: 'short', timeZone: 'UTC' })) + '</small>' +
        '<strong>' + o.getUTCDate() + '</strong>' +
        '<small>' + o.toLocaleDateString('en-NG', { month: 'short', timeZone: 'UTC' }) + '</small></button>';
    }
    $('bnDays').innerHTML = html;
  }

  async function loadSlots() {
    var box = $('bnTimes');
    $('bnHoursHint').textContent = '';
    if (!state.branchId || !state.date) {
      box.innerHTML = '<div class="bn-empty" style="grid-column:1/-1">' + (state.branchId ? 'Pick a day.' : 'Choose a branch to see available times.') + '</div>';
      return;
    }
    var req = ++state.slotsReq;
    box.innerHTML = '<div class="bn-empty" style="grid-column:1/-1"><span class="bn-spinner"></span></div>';
    try {
      var qs = '?branchId=' + encodeURIComponent(state.branchId) + '&date=' + state.date +
        (state.services.length ? '&serviceIds=' + encodeURIComponent(state.services.map(function (s) { return s.id; }).join(',')) : '');
      var data = await api('/public/ad-bookings/slots' + qs);
      if (req !== state.slotsReq) return;
      if (data.openTime && data.closeTime) $('bnHoursHint').textContent = 'Open ' + time12(data.openTime) + ' to ' + time12(data.closeTime);
      if (state.time && data.slots.indexOf(state.time) === -1) state.time = null;
      box.innerHTML = data.slots.length ? data.slots.map(function (t) {
        return '<button type="button" class="bn-time" role="radio" aria-checked="' + (state.time === t) + '" data-time="' + t + '">' + time12(t) + '</button>';
      }).join('') : '<div class="bn-empty" style="grid-column:1/-1">' + esc(data.reason || 'No times left on this day.') + ' Please pick another day.</div>';
    } catch (e) {
      if (req !== state.slotsReq) return;
      box.innerHTML = '<div class="bn-empty" style="grid-column:1/-1">' + esc(e.message) + '</div>';
    }
    updateSummary();
  }

  function amounts() {
    if (!state.services.length || !state.branchId) return null;
    var total = 0;
    for (var i = 0; i < state.services.length; i++) {
      var bp = servicePriceAt(state.services[i], state.branchId);
      if (!bp) return null;
      total += bp.price;
    }
    var deposit = depositFor(total);
    var payNow = state.payOption === 'FULL' ? total : deposit;
    return { total: total, deposit: deposit, payNow: payNow, balance: Math.max(0, total - payNow) };
  }

  function renderPayOptions() {
    var c = state.config;
    var a = amounts();
    var depositLabel = c.depositPercent > 0
      ? c.depositPercent + '% deposit' + (c.minDepositAmount > 0 ? ' (at least ' + naira(c.minDepositAmount) + ')' : '')
      : 'Deposit of ' + naira(c.minDepositAmount);
    var opts = [{
      key: 'DEPOSIT',
      name: 'Pay a deposit',
      meta: depositLabel + '. Pay the rest at the branch.',
      price: a ? naira(a.deposit) : '',
    }];
    if (c.allowFullPayment) {
      opts.push({ key: 'FULL', name: 'Pay in full', meta: 'Nothing to pay at the branch.', price: a ? naira(a.total) : '' });
    } else {
      state.payOption = 'DEPOSIT';
    }
    // A deposit that equals the price is just a full payment.
    if (a && a.deposit >= a.total && c.allowFullPayment) {
      opts = [opts[1]];
      state.payOption = 'FULL';
    }
    $('bnPayOptions').innerHTML = opts.map(function (o) {
      return '<button type="button" class="bn-option" role="radio" aria-checked="' + (state.payOption === o.key) + '" data-pay="' + o.key + '">' +
        '<span class="bn-check"></span>' +
        '<span class="bn-option-body"><span class="bn-option-name">' + o.name + '</span><span class="bn-option-meta">' + o.meta + '</span></span>' +
        '<span class="bn-option-price">' + o.price + '</span></button>';
    }).join('');
  }

  function missingStep() {
    if (!state.branchId) return 'Choose a branch';
    if (!state.services.length) return 'Choose a service';
    if (!state.date) return 'Pick a day';
    if (!state.time) return 'Pick a time';
    return null;
  }

  function updateSummary() {
    var b = state.branchId ? branchById(state.branchId) : null;
    $('sumService').textContent = state.services.length ? servicesLabel() : 'Not chosen';
    $('sumBranch').textContent = b ? b.name : 'Not chosen';
    $('sumWhen').textContent = state.date
      ? longDate(state.date) + (state.time ? ', ' + time12(state.time) : '')
      : 'Not chosen';
    var a = amounts();
    $('sumTotal').textContent = naira(a ? a.total : 0);
    $('sumBalance').textContent = naira(a ? a.balance : 0);
    $('sumPayNow').textContent = naira(a ? a.payNow : 0);
    $('barPayNow').textContent = naira(a ? a.payNow : 0);

    var missing = missingStep();
    var label = missing || ('Pay ' + naira(a.payNow) + (state.payOption === 'FULL' ? '' : ' deposit'));
    [$('bnPayBtn'), $('bnPayBtnMobile')].forEach(function (btn) {
      if (btn.dataset.busy === '1') return;
      btn.disabled = !!missing;
      btn.textContent = btn.id === 'bnPayBtnMobile' ? (missing || 'Pay now') : label;
    });
    saveForm();
  }

  function saveForm() {
    store(sessionStorage, FORM_KEY, {
      serviceIds: state.services.map(function (s) { return s.id; }),
      branchId: state.branchId,
      date: state.date,
      time: state.time,
      payOption: state.payOption,
      fullName: $('bnName').value,
      phone: $('bnPhone').value,
      email: $('bnEmail').value,
    });
  }

  function restoreForm() {
    var f = load(sessionStorage, FORM_KEY);
    var q = new URLSearchParams(location.search);
    // Ad links can preselect: ?branch=<id>&service=<id> or ?service=<id>,<id>
    var wantBranch = q.get('branch') || (f && f.branchId) || null;
    state.branchId = wantBranch && branchById(wantBranch) && serviceCountAt(wantBranch) > 0 ? wantBranch : null;
    var bookable = state.config.branches.filter(function (b) { return serviceCountAt(b.id) > 0; });
    if (!state.branchId && bookable.length === 1) state.branchId = bookable[0].id;
    var wanted = q.get('service') ? q.get('service').split(',') : (f && f.serviceIds) || [];
    state.services = wanted.map(serviceById).filter(Boolean);
    // A service link without a branch: preselect the branch when only one offers them all.
    if (!state.branchId && state.services.length) {
      var fits = bookable.filter(function (b) {
        return state.services.every(function (s) { return !!servicePriceAt(s, b.id); });
      });
      if (fits.length === 1) state.branchId = fits[0].id;
    }
    // Services stay chosen until a branch is picked; then only that branch's ones are kept.
    if (state.branchId) keepServicesAtBranch();
    if (f) {
      if (f.date && f.date >= state.config.today) state.date = f.date;
      if (f.time) state.time = f.time;
      if (f.payOption) state.payOption = f.payOption;
      $('bnName').value = f.fullName || '';
      $('bnPhone').value = f.phone || '';
      $('bnEmail').value = f.email || '';
    }
    if (!state.date) state.date = state.config.today;
  }

  function showError(msg) {
    var el = $('bnFormError');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function validDetails() {
    var ok = true;
    var name = $('bnName').value.trim();
    var phoneDigits = $('bnPhone').value.replace(/\D/g, '');
    var email = $('bnEmail').value.trim();
    var checks = [
      ['bnName', name.length >= 2],
      ['bnPhone', phoneDigits.length >= 10 && phoneDigits.length <= 13],
      ['bnEmail', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)],
    ];
    checks.forEach(function (c) {
      $(c[0]).parentElement.classList.toggle('invalid', !c[1]);
      if (!c[1]) ok = false;
    });
    if (!ok) {
      var first = checks.filter(function (c) { return !c[1]; })[0][0];
      $(first).focus();
      showError(first === 'bnName' ? 'Enter your full name.' : first === 'bnPhone' ? 'Enter a valid phone number, e.g. 0803 123 4567.' : 'Enter a valid email address.');
    }
    return ok;
  }

  async function submit(e) {
    e.preventDefault();
    showError('');
    var missing = missingStep();
    if (missing) { showError(missing + '.'); return; }
    if (!validDetails()) return;

    var a = amounts();
    var buttons = [$('bnPayBtn'), $('bnPayBtnMobile')];
    buttons.forEach(function (b) {
      b.dataset.busy = '1';
      b.disabled = true;
      b.innerHTML = '<span class="bn-spinner"></span> Opening payment';
    });

    var payload = Object.assign({
      fullName: $('bnName').value.trim(),
      email: $('bnEmail').value.trim(),
      phone: $('bnPhone').value.trim(),
      serviceIds: state.services.map(function (s) { return s.id; }),
      branchId: state.branchId,
      date: state.date,
      time: state.time,
      paymentOption: state.payOption,
    }, attribution());

    try {
      track('InitiateCheckout', { value: a.payNow, currency: 'NGN', content_name: servicesLabel(), content_ids: state.services.map(function (s) { return s.id; }), content_type: 'product', num_items: state.services.length });
      var data = await api('/public/ad-bookings/checkout', { method: 'POST', body: JSON.stringify(payload) });
      store(sessionStorage, REF_KEY, data.reference);
      window.location.href = data.authorizationUrl;
    } catch (err) {
      buttons.forEach(function (b) { b.dataset.busy = ''; });
      updateSummary();
      showError(err.message);
      if (/time is no longer available/i.test(err.message)) { state.time = null; loadSlots(); }
    }
  }

  function bindForm() {
    $('bnServices').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-service]');
      if (!btn) return;
      var id = btn.getAttribute('data-service');
      var svc = serviceById(id);
      if (!svc) return;
      var adding = !isSelected(id);
      state.services = adding
        ? state.services.concat([svc])
        : state.services.filter(function (s) { return s.id !== id; });
      showServicesNote('');
      renderServices($('bnServiceSearch').value);
      renderPayOptions();
      loadSlots();
      updateSummary();
      if (adding) track('ViewContent', { content_name: svc.name, content_ids: [svc.id], content_type: 'product', value: (servicePriceAt(svc, state.branchId) || {}).price || lowestPrice(svc), currency: 'NGN' });
    });
    $('bnBranches').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-branch]');
      if (!btn) return;
      state.branchId = btn.getAttribute('data-branch');
      var removed = keepServicesAtBranch();
      showServicesNote(removed.length
        ? removed.join(', ') + (removed.length === 1 ? ' is' : ' are') + ' not offered at this branch, so ' + (removed.length === 1 ? 'it was' : 'they were') + ' removed.'
        : '');
      renderBranches();
      renderServices($('bnServiceSearch').value);
      renderPayOptions();
      loadSlots();
      updateSummary();
    });
    $('bnDays').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-date]');
      if (!btn) return;
      state.date = btn.getAttribute('data-date');
      state.time = null;
      renderDays();
      loadSlots();
      updateSummary();
    });
    $('bnTimes').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-time]');
      if (!btn) return;
      state.time = btn.getAttribute('data-time');
      Array.prototype.forEach.call($('bnTimes').querySelectorAll('[data-time]'), function (b) {
        b.setAttribute('aria-checked', String(b.getAttribute('data-time') === state.time));
      });
      updateSummary();
    });
    $('bnPayOptions').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pay]');
      if (!btn) return;
      state.payOption = btn.getAttribute('data-pay');
      renderPayOptions();
      updateSummary();
    });
    $('bnServiceSearch').addEventListener('input', function () { renderServices(this.value); });
    ['bnName', 'bnPhone', 'bnEmail'].forEach(function (id) {
      $(id).addEventListener('input', function () { this.parentElement.classList.remove('invalid'); saveForm(); });
    });
    $('bnBookingForm').addEventListener('submit', submit);
  }

  async function startForm() {
    var c = state.config;
    if (!c.enabled || !c.services.length) {
      show('bnLoading', false);
      show('bnUnavailable', true);
      if (c.enabled) $('bnUnavailableText').textContent = 'There are no services open for online booking right now. Please call or visit any Hairlux branch.';
      return;
    }
    if (c.depositPercent > 0 || c.minDepositAmount > 0) {
      $('bnPerkDeposit').textContent = 'Small deposit, comes off your bill';
    }
    restoreForm();
    renderBranches();
    renderServices('');
    renderDays();
    renderPayOptions();
    bindForm();
    updateSummary();
    show('bnLoading', false);
    show('bnForm', true);
    show('bnMobileBar', true);
    document.body.classList.add('has-bar');
    if (state.branchId) loadSlots();
    var sel = document.querySelector('.bn-day[aria-checked="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ─── Return from Monnify ───────────────────────────────────────────────

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
    // Count the conversion once per payment, even if the page is reloaded.
    var firedKey = 'hlx_ad_purchase_' + r.reference;
    if (!load(localStorageSafe(), firedKey)) {
      track('Purchase', { value: r.amountPaid, currency: 'NGN', content_name: r.serviceName, content_type: 'product' }, r.reference);
      store(localStorageSafe(), firedKey, 1);
    }
    try { sessionStorage.removeItem(FORM_KEY); } catch (e) { /* ignore */ }
  }

  function localStorageSafe() {
    try { return window.localStorage; } catch (e) { return window.sessionStorage; }
  }

  function showNotPaid(r) {
    show('bnChecking', false);
    show('bnNotPaid', true);
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

  async function checkReturn(ref) {
    show('bnLoading', false);
    show('bnResult', true);
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
        if (e.status === 404) { showNotPaid(null); $('notPaidText').textContent = 'We could not find this booking. Please start again.'; return; }
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

  // ─── Start ──────────────────────────────────────────────────────────

  async function init() {
    $('bnYear').textContent = new Date().getFullYear();
    captureAttribution();
    var q = new URLSearchParams(location.search);
    var ref = q.get('ref') || q.get('paymentReference');

    try {
      state.config = await api('/public/ad-bookings/config');
    } catch (e) {
      $('bnLoadingText').textContent = 'We could not load booking options. Please check your connection and refresh.';
      return;
    }
    initPixel(state.config.metaPixelId);

    if (ref && /^HLADB-/i.test(ref)) {
      checkReturn(ref);
      return;
    }
    startForm();
  }

  init();
})();
