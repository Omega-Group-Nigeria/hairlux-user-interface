/**
 * Hairlux ad landing page (book-now.html).
 *
 * A visitor from an ad picks a walk-in service, a branch and a slot, enters
 * name, phone and email, and pays a deposit (or the full price) through the
 * Monnify checkout (card, bank transfer or USSD). Monnify then sends them to
 * the thank-you page, booking-confirmed.html?ref=HLADB-..., which confirms the
 * payment and shows the reservation code and QR code (booking-confirmed.js).
 * A return link that still points here is forwarded there.
 *
 * Attribution: utm_* tags and the ad click id (fbclid / gclid / ttclid) are
 * kept in sessionStorage from the first page view and sent with the checkout,
 * so the booking is logged with its source (e.g. "Facebook Ad").
 * Meta Pixel: the page loads the salon pixel and sends PageView. Purchase is
 * sent from the thank-you page once the booking is confirmed; no other event
 * is sent unless added to PIXEL_EVENTS. The Facebook click id is kept in
 * the _fbc cookie on arrival, so the Purchase is still credited to the ad
 * after the trip out to Monnify and back.
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
    // Category from the ad link (?spa or ?category=spa): only its services are listed
    // until "Show all services" is pressed.
    category: null,
    showAllCategories: false,
    // Services dropped because the chosen branch does not offer them; put back
    // automatically when the visitor moves to a branch that does.
    parked: [],
    slotsReq: 0,
    slots: [],
    // Optional add-ons (2026-10-24): offers per chosen service at this branch, and the ticked ones.
    addOnOffers: {},
    addOnsPicked: {},
    addOnsReq: 0,
    // Long lists start short; "Show more" opens them.
    showAllBranches: false,
    showAllDays: false,
    showAllTimes: false,
  };

  var FIRST_BRANCHES = 2;
  var FIRST_DAYS = 7;
  var FIRST_TIMES = 8;

  /** The first `n` items, plus the selected one if it sits further down. */
  function firstWithSelected(list, n, isSelectedItem) {
    var shown = list.slice(0, n);
    var picked = list.filter(isSelectedItem)[0];
    if (picked && shown.indexOf(picked) === -1) shown.push(picked);
    return shown;
  }

  function moreButton(kind, hidden, label, expanded) {
    return '<button type="button" class="bn-more" data-more="' + kind + '" aria-expanded="' + expanded + '">' +
      (expanded ? 'Show fewer' : label.replace('{n}', hidden)) +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6') + '" /></svg>' +
      '</button>';
  }

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

  // Only these events are sent from this page (Purchase is sent from the
  // thank-you page). Add 'ViewContent' (service picked) or 'InitiateCheckout'
  // (Pay tapped) here to send them.
  var PIXEL_EVENTS = [];

  /**
   * Keeps the Facebook click id (fbclid) as Meta's _fbc cookie from the
   * first page of the visit. Monnify sends the visitor back without it in
   * the link, and the pixel reads this cookie to credit the Purchase to the ad.
   */
  function keepFacebookClickId(attr) {
    if (!attr || attr.clickIdType !== 'fbclid' || !attr.clickId) return;
    try {
      if (/(?:^|;\s*)_fbc=/.test(document.cookie)) return;
      document.cookie = '_fbc=fb.1.' + Date.now() + '.' + encodeURIComponent(attr.clickId) +
        '; path=/; max-age=7776000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) { /* cookies blocked: attribution falls back to Meta's own matching */ }
  }

  function initPixel(id) {
    if (!id || window.fbq) return;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    // Fallback only: the page snippet normally loads the pixel first.
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  }

  function track(event, params, eventId) {
    if (!window.fbq || PIXEL_EVENTS.indexOf(event) === -1) return;
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

  // ─── Category from the link ───────────────────────────────────────────

  /** "Hair Styling & Braids" -> "hairstylingbraids", for matching link keys. */
  function catKey(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /** ?category=spa, or a bare ?spa next to the ad tags. Same rule as salon.html. */
  function requestedCategory() {
    var q = new URLSearchParams(location.search);
    if (q.get('category')) return q.get('category');
    var known = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'branch', 'service', 'category', 'ref', 'paymentReference'];
    var hit = null;
    q.forEach(function (value, key) {
      if (!hit && !value && known.indexOf(key) === -1) hit = key;
    });
    return hit;
  }

  /** Exact match first ("spa" = "Spa"), then one category starting with it or containing it as a word. */
  function matchCategory(wanted) {
    var key = catKey(wanted);
    if (!key) return null;
    var cats = [];
    state.config.services.forEach(function (s) { if (s.category && cats.indexOf(s.category) === -1) cats.push(s.category); });
    var exact = cats.filter(function (c) { return catKey(c) === key; });
    if (exact.length) return exact[0];
    var loose = cats.filter(function (c) {
      return catKey(c).indexOf(key) === 0 || String(c).toLowerCase().split(/[^a-z0-9]+/).indexOf(key) !== -1;
    });
    return loose.length === 1 ? loose[0] : null;
  }

  /** Services listed on the page: the link's category only, until "Show all services". */
  function listedServices() {
    if (!state.category || state.showAllCategories) return state.config.services;
    return state.config.services.filter(function (s) { return s.category === state.category; });
  }

  /** Services the branch offers, with that branch's price. Chosen services are always
   * listed (even from another category) so they can be seen and unticked. */
  function servicesAtBranch(branchId) {
    if (!branchId) return [];
    var listed = listedServices();
    return state.config.services.filter(function (s) {
      return listed.indexOf(s) !== -1 || isSelected(s.id);
    }).map(function (s) {
      var bp = servicePriceAt(s, branchId);
      return bp ? { service: s, price: bp.price } : null;
    }).filter(Boolean);
  }

  /** How many listed services a branch has (branches with none are hidden). */
  function serviceCountAt(branchId) {
    return listedServices().filter(function (s) { return !!servicePriceAt(s, branchId); }).length;
  }

  /** Names of chosen services the branch does not offer. */
  function missingAt(branchId) {
    return state.services.filter(function (s) { return !servicePriceAt(s, branchId); }).map(function (s) { return s.name; });
  }

  /** Same rule as the server: % of the combined price, at least the minimum, never more than the price. */
  function depositFor(total) {
    var c = state.config;
    if (!(total > 0)) return 0;
    var byPercent = Math.ceil(total * Math.max(0, c.depositPercent) / 100);
    return Math.min(total, Math.max(byPercent, Math.max(0, Math.round(c.minDepositAmount))));
  }

  function totalDuration() {
    return state.services.reduce(function (sum, s) { return sum + (Number(s.duration) || 0); }, 0) +
      pickedAddOns().reduce(function (sum, a) { return sum + (Number(a.duration) || 0); }, 0);
  }

  function servicesLabel() {
    return state.services.map(function (s) { return s.name; }).concat(pickedAddOns().map(function (a) { return a.name; })).join(' + ');
  }

  // ─── Optional add-ons (2026-10-24) ──────────────────────────────────
  /** Ticked add-ons still offered for the chosen services: [{ id, name, price, duration, addOnOf }]. */
  function pickedAddOns() {
    var out = [];
    state.services.forEach(function (s) {
      var ids = state.addOnsPicked[s.id] || [];
      (state.addOnOffers[s.id] || []).forEach(function (a) {
        if (ids.indexOf(a.id) !== -1) out.push({ id: a.id, name: a.name, price: a.price, duration: a.duration, addOnOf: s.id });
      });
    });
    return out;
  }

  /** Loads the add-ons the chosen services offer at this branch, then redraws them. */
  async function loadAddOns() {
    var req = ++state.addOnsReq;
    if (!state.branchId || !state.services.length) {
      state.addOnOffers = {};
      renderAddOns();
      return;
    }
    try {
      var data = await api('/services/add-on-options', {
        method: 'POST',
        body: JSON.stringify({ serviceIds: state.services.map(function (s) { return s.id; }), mode: 'WALK_IN', branchId: state.branchId }),
      });
      if (req !== state.addOnsReq) return;
      var offers = {};
      (data.byService || []).forEach(function (g) { offers[g.serviceId] = g.addOns || []; });
      state.addOnOffers = offers;
    } catch (e) {
      if (req !== state.addOnsReq) return;
      state.addOnOffers = {}; // optional: the booking still works without them
    }
    renderAddOns();
    renderPayOptions();
    updateSummary();
    loadSlots();
  }

  function renderAddOns() {
    var box = $('bnAddOns');
    var groups = state.services.filter(function (s) { return (state.addOnOffers[s.id] || []).length; });
    if (!groups.length) {
      box.innerHTML = '';
      show('bnAddOns', false);
      return;
    }
    box.innerHTML = groups.map(function (s) {
      var picked = state.addOnsPicked[s.id] || [];
      return '<p class="bn-addons-title">Add to ' + esc(s.name) + ' <small>(optional)</small></p>' +
        '<div class="bn-options two">' + state.addOnOffers[s.id].map(function (a) {
          var on = picked.indexOf(a.id) !== -1;
          return '<button type="button" class="bn-option" role="checkbox" aria-checked="' + on + '" data-addon="' + esc(a.id) + '" data-main="' + esc(s.id) + '">' +
            '<span class="bn-check bn-check-box"></span>' +
            '<span class="bn-option-body"><span class="bn-option-name">' + esc(a.name) + '</span>' +
            '<span class="bn-option-meta">' + (a.duration ? minutesLabel(a.duration) : '') + '</span></span>' +
            '<span class="bn-option-price">' + naira(a.price) + (a.standardPrice > a.price ? '<span class="bn-addon-was">' + naira(a.standardPrice) + '</span>' : '') + '</span>' +
            '</button>';
        }).join('') + '</div>';
    }).join('');
    show('bnAddOns', true);
  }

  /**
   * After the branch changes: keep only the services that branch offers and
   * say which were dropped. Returns the names removed.
   */
  function keepServicesAtBranch() {
    var removed = [];
    // Services set aside at an earlier branch come back when this branch offers them.
    var back = state.parked.filter(function (s) { return !!servicePriceAt(s, state.branchId) && !isSelected(s.id); });
    state.parked = state.parked.filter(function (s) { return back.indexOf(s) === -1; });
    state.services = state.services.concat(back).filter(function (s) {
      var ok = !!servicePriceAt(s, state.branchId);
      if (!ok) {
        removed.push(s.name);
        if (!state.parked.some(function (p) { return p.id === s.id; })) state.parked.push(s);
      }
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
    var all = state.config.branches.filter(function (b) { return serviceCountAt(b.id) > 0 || b.id === state.branchId; });
    // With services already chosen (e.g. from a link), branches that offer all of them come first.
    var wanted = state.services.concat(state.parked);
    if (wanted.length) {
      var fits = function (b) { return wanted.every(function (s) { return !!servicePriceAt(s, b.id); }) ? 0 : 1; };
      all = all.slice().sort(function (a, b) { return fits(a) - fits(b); });
    }
    var list = state.showAllBranches ? all : firstWithSelected(all, FIRST_BRANCHES, function (b) { return b.id === state.branchId; });
    var hidden = all.length - list.length;
    $('bnBranches').innerHTML = (all.length ? list.map(function (b) {
      var n = serviceCountAt(b.id);
      var miss = wanted.filter(function (s) { return !servicePriceAt(s, b.id); }).map(function (s) { return s.name; });
      return '<button type="button" class="bn-option" role="radio" aria-checked="' + (state.branchId === b.id) + '" data-branch="' + esc(b.id) + '">' +
        '<span class="bn-check"></span>' +
        '<span class="bn-option-body"><span class="bn-option-name">' + esc(b.name) + '</span>' +
        '<span class="bn-option-meta">' + esc(b.address) + '</span>' +
        (miss.length ? '<span class="bn-option-meta bn-miss">No ' + esc(miss.join(', ')) + ' here</span>' : '') + '</span>' +
        '<span class="bn-option-meta" style="white-space:nowrap">' + n + (n === 1 ? ' service' : ' services') + '</span>' +
        '</button>';
    }).join('') : '<div class="bn-empty" style="grid-column:1/-1">No branch is taking online bookings right now.</div>') +
      (hidden > 0 || (state.showAllBranches && all.length > FIRST_BRANCHES)
        ? moreButton('branches', hidden, 'Show {n} more ' + (hidden === 1 ? 'branch' : 'branches'), state.showAllBranches)
        : '');
  }

  /** "Showing Spa services · Show all services" when the page came from a category link. */
  function renderCategoryBar() {
    var bar = $('bnCategoryBar');
    if (!state.category) { bar.classList.add('bn-hidden'); return; }
    bar.classList.remove('bn-hidden');
    bar.innerHTML = state.showAllCategories
      ? '<span>Showing all services.</span><button type="button" class="bn-link-btn" data-cat-toggle>Show only ' + esc(state.category) + '</button>'
      : '<span>Showing <strong>' + esc(state.category) + '</strong> services.</span><button type="button" class="bn-link-btn" data-cat-toggle>Show all services</button>';
  }

  function renderServices(filter) {
    renderCategoryBar();
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
    // Show the first week, or up to the chosen day if it is later.
    var chosenIndex = state.date ? Math.round((dateObj(state.date) - dateObj(c.today)) / 86400000) : 0;
    var last = state.showAllDays ? days : Math.min(days, Math.max(FIRST_DAYS - 1, chosenIndex));
    var html = '';
    for (var i = 0; i <= last; i++) {
      var d = addDays(c.today, i);
      var o = dateObj(d);
      var checked = state.date === d;
      html += '<button type="button" class="bn-day" role="radio" aria-checked="' + checked + '" data-date="' + d + '">' +
        '<small>' + (i === 0 ? 'Today' : i === 1 ? 'Tmrw' : o.toLocaleDateString('en-NG', { weekday: 'short', timeZone: 'UTC' })) + '</small>' +
        '<strong>' + o.getUTCDate() + '</strong>' +
        '<small>' + o.toLocaleDateString('en-NG', { month: 'short', timeZone: 'UTC' }) + '</small></button>';
    }
    if (last < days) {
      html += '<button type="button" class="bn-day bn-day-more" data-more="days" aria-expanded="false"><small>More</small><strong>+' + (days - last) + '</strong><small>dates</small></button>';
    } else if (state.showAllDays && days >= FIRST_DAYS) {
      html += '<button type="button" class="bn-day bn-day-more" data-more="days" aria-expanded="true"><small>Show</small><strong>&minus;</strong><small>fewer</small></button>';
    }
    $('bnDays').innerHTML = html;
  }

  function renderTimes() {
    var box = $('bnTimes');
    var all = state.slots || [];
    if (!all.length) {
      box.innerHTML = '<div class="bn-empty" style="grid-column:1/-1">' + esc(state.slotsReason || 'No times left on this day.') + ' Please pick another day.</div>';
      return;
    }
    var list = state.showAllTimes ? all : firstWithSelected(all, FIRST_TIMES, function (t) { return t === state.time; });
    var hidden = all.length - list.length;
    box.innerHTML = list.map(function (t) {
      return '<button type="button" class="bn-time" role="radio" aria-checked="' + (state.time === t) + '" data-time="' + t + '">' + time12(t) + '</button>';
    }).join('') +
      (hidden > 0 || (state.showAllTimes && all.length > FIRST_TIMES)
        ? moreButton('times', hidden, 'Show {n} more ' + (hidden === 1 ? 'time' : 'times'), state.showAllTimes)
        : '');
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
        (state.services.length ? '&serviceIds=' + encodeURIComponent(state.services.map(function (s) { return s.id; }).concat(pickedAddOns().map(function (a) { return a.id; })).join(',')) : '');
      var data = await api('/public/ad-bookings/slots' + qs);
      if (req !== state.slotsReq) return;
      if (data.openTime && data.closeTime) $('bnHoursHint').textContent = 'Open ' + time12(data.openTime) + ' to ' + time12(data.closeTime);
      if (state.time && data.slots.indexOf(state.time) === -1) state.time = null;
      state.slots = data.slots;
      state.slotsReason = data.reason;
      renderTimes();
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
    pickedAddOns().forEach(function (a) { total += Number(a.price) || 0; });
    var deposit = depositFor(total);
    var payNow = state.payOption === 'FULL' ? total : state.payOption === 'PAY_AT_BRANCH' ? 0 : deposit;
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
    }
    // A deposit that equals the price is just a full payment.
    if (a && a.deposit >= a.total && c.allowFullPayment) {
      opts = opts.filter(function (o) { return o.key !== 'DEPOSIT'; });
    }
    // Pay at the branch is listed first.
    if (c.allowPayAtBranch) {
      opts.unshift({ key: 'PAY_AT_BRANCH', name: 'Pay at the branch', meta: 'Nothing to pay now. Pay the full price before or at your visit.', price: a ? naira(0) : '' });
    }
    // Keep the choice only while it is still on offer (settings can change between visits).
    // A paid option stays the default; pay at the branch is chosen only when nothing else is offered.
    if (!opts.some(function (o) { return o.key === state.payOption; })) {
      var paid = opts.filter(function (o) { return o.key !== 'PAY_AT_BRANCH'; })[0];
      state.payOption = (paid || opts[0]).key;
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
    var payLater = state.payOption === 'PAY_AT_BRANCH';
    var label = missing || (payLater ? 'Confirm booking' : 'Pay ' + naira(a.payNow) + (state.payOption === 'FULL' ? '' : ' deposit'));
    [$('bnPayBtn'), $('bnPayBtnMobile')].forEach(function (btn) {
      if (btn.dataset.busy === '1') return;
      btn.disabled = !!missing;
      btn.textContent = btn.id === 'bnPayBtnMobile' ? (missing || (payLater ? 'Book now' : 'Pay now')) : label;
    });
    // Nothing is paid online with "Pay at the branch": no card note, and a cancellation note that fits.
    show('bnSecure', !payLater);
    $('bnPolicyNote').textContent = payLater
      ? 'Your slot is held for you. The full price is paid before or at your visit. If you cannot make it, cancel from your account so someone else can have the slot.'
      : 'If you cannot make it, cancel from your account and your payment goes back to your Hairlux wallet for your next visit.';
    saveForm();
  }

  function saveForm() {
    store(sessionStorage, FORM_KEY, {
      serviceIds: state.services.map(function (s) { return s.id; }),
      addOnsPicked: state.addOnsPicked,
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
    var wanted = q.get('service') ? q.get('service').split(',') : (f && f.serviceIds) || [];
    state.services = wanted.map(serviceById).filter(Boolean);
    var offersAll = function (id) {
      return state.services.every(function (s) { return !!servicePriceAt(s, id); });
    };
    // The branch in the link wins. A branch remembered from an earlier visit is only
    // reused when it offers the services in the link, so a service chosen on
    // salon.html is never dropped for a branch the visitor did not pick this time.
    var remembered = f && f.branchId;
    var wantBranch = q.get('branch') || (remembered && (!q.get('service') || offersAll(remembered)) ? remembered : null);
    state.branchId = wantBranch && branchById(wantBranch) && (serviceCountAt(wantBranch) > 0 || offersAll(wantBranch)) ? wantBranch : null;
    var bookable = state.config.branches.filter(function (b) { return serviceCountAt(b.id) > 0; });
    if (!state.branchId && bookable.length === 1) state.branchId = bookable[0].id;
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
      if (f.addOnsPicked && typeof f.addOnsPicked === 'object') state.addOnsPicked = f.addOnsPicked;
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
      b.innerHTML = '<span class="bn-spinner"></span> ' + (state.payOption === 'PAY_AT_BRANCH' ? 'Saving your booking' : 'Opening payment');
    });

    var payload = Object.assign({
      fullName: $('bnName').value.trim(),
      email: $('bnEmail').value.trim(),
      phone: $('bnPhone').value.trim(),
      serviceIds: state.services.map(function (s) { return s.id; }),
      addOns: pickedAddOns().map(function (a) { return { serviceId: a.id, addOnOf: a.addOnOf }; }),
      branchId: state.branchId,
      date: state.date,
      time: state.time,
      paymentOption: state.payOption,
    }, attribution());

    try {
      if (state.payOption !== 'PAY_AT_BRANCH') track('InitiateCheckout', { value: a.payNow, currency: 'NGN', content_name: servicesLabel(), content_ids: state.services.map(function (s) { return s.id; }), content_type: 'product', num_items: state.services.length });
      var data = await api('/public/ad-bookings/checkout', { method: 'POST', body: JSON.stringify(payload) });
      store(sessionStorage, REF_KEY, data.reference);
      // Pay at the branch: nothing to pay, so go straight to this site's own
      // confirmation page (never a payment check, never another site).
      window.location.href = state.payOption === 'PAY_AT_BRANCH'
        ? 'booking-confirmed.html?ref=' + encodeURIComponent(data.reference) + '&booked=1'
        : data.authorizationUrl;
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
      loadAddOns();
      if (adding) track('ViewContent', { content_name: svc.name, content_ids: [svc.id], content_type: 'product', value: (servicePriceAt(svc, state.branchId) || {}).price || lowestPrice(svc), currency: 'NGN' });
    });
    $('bnBranches').addEventListener('click', function (e) {
      if (e.target.closest('[data-more]')) {
        state.showAllBranches = !state.showAllBranches;
        renderBranches();
        return;
      }
      var btn = e.target.closest('[data-branch]');
      if (!btn) return;
      state.branchId = btn.getAttribute('data-branch');
      state.showAllBranches = false;
      state.showAllTimes = false;
      var before = state.services.length;
      var removed = keepServicesAtBranch();
      var restored = state.services.length - (before - removed.length);
      showServicesNote(removed.length
        ? removed.join(', ') + (removed.length === 1 ? ' is' : ' are') + ' not offered at this branch, so ' + (removed.length === 1 ? 'it was' : 'they were') + ' set aside. ' +
          (removed.length === 1 ? 'It comes' : 'They come') + ' back if you pick a branch that offers ' + (removed.length === 1 ? 'it' : 'them') + '.'
        : restored > 0 ? 'Your earlier choice is back: this branch offers it.' : '');
      renderBranches();
      renderServices($('bnServiceSearch').value);
      renderPayOptions();
      loadSlots();
      updateSummary();
      loadAddOns();
    });
    $('bnAddOns').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-addon]');
      if (!btn) return;
      var main = btn.getAttribute('data-main');
      var id = btn.getAttribute('data-addon');
      var ids = (state.addOnsPicked[main] || []).filter(function (x) { return x !== id; });
      if (btn.getAttribute('aria-checked') !== 'true') ids.push(id);
      if (ids.length) state.addOnsPicked[main] = ids; else delete state.addOnsPicked[main];
      renderAddOns();
      renderServices($('bnServiceSearch').value);
      renderPayOptions();
      loadSlots();
      updateSummary();
    });
    $('bnDays').addEventListener('click', function (e) {
      if (e.target.closest('[data-more]')) {
        state.showAllDays = !state.showAllDays;
        renderDays();
        return;
      }
      var btn = e.target.closest('[data-date]');
      if (!btn) return;
      state.date = btn.getAttribute('data-date');
      state.time = null;
      state.showAllTimes = false;
      renderDays();
      loadSlots();
      updateSummary();
    });
    $('bnTimes').addEventListener('click', function (e) {
      if (e.target.closest('[data-more]')) {
        state.showAllTimes = !state.showAllTimes;
        renderTimes();
        return;
      }
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
    $('bnCategoryBar').addEventListener('click', function (e) {
      if (!e.target.closest('[data-cat-toggle]')) return;
      state.showAllCategories = !state.showAllCategories;
      renderBranches();
      renderServices($('bnServiceSearch').value);
    });
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
    state.category = matchCategory(requestedCategory());
    // A category with no branch taking it online is ignored (everything is shown).
    if (state.category && !state.config.branches.some(function (b) { return serviceCountAt(b.id) > 0; })) state.category = null;
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
    loadAddOns();
    var sel = document.querySelector('.bn-day[aria-checked="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ─── Start ──────────────────────────────────────────────────────────

  /**
   * An HLADB- payment reference in the link: a return from Monnify (older
   * checkouts were sent back here). Read from paymentReference or ref, and
   * tolerant of "?ref=HLADB-X?paymentReference=HLADB-X".
   */
  function returnReference() {
    var q = new URLSearchParams(location.search);
    var raw = [q.get('paymentReference'), q.get('ref'), location.search].join(' ');
    var m = raw.match(/HLADB-[A-Z0-9]+-[A-Z0-9]+/i);
    return m ? m[0].toUpperCase() : null;
  }

  async function init() {
    // A payment return belongs on the thank-you page.
    var ref = returnReference();
    if (ref) {
      location.replace('booking-confirmed.html?ref=' + encodeURIComponent(ref));
      return;
    }
    $('bnYear').textContent = new Date().getFullYear();
    keepFacebookClickId(captureAttribution());

    try {
      state.config = await api('/public/ad-bookings/config');
    } catch (e) {
      $('bnLoadingText').textContent = 'We could not load booking options. Please check your connection and refresh.';
      return;
    }
    initPixel(state.config.metaPixelId);
    startForm();
  }

  init();
})();
