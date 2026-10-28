/**
 * Hairlux ad landing page (salon.html).
 *
 * Ads point here first. The page shows services with prices and the branches
 * (from the same public config the booking page uses), and every "Book"
 * button goes to book-now.html. The ad tags (utm_*, fbclid / gclid / ttclid)
 * are saved in sessionStorage the same way book-now.js does, and passed on in
 * the booking links, so the booking is still logged with its source and with
 * this page as where the visitor first landed. Meta Pixel: the page loads the
 * salon pixel and sends PageView. The Pixel ID in admin is only used if that
 * is missing.
 */
(function () {
  'use strict';

  // config.js declares API_CONFIG with const, so it is not on window.
  var API = (typeof API_CONFIG !== 'undefined' && API_CONFIG.BASE_URL) || '';
  var ATTR_KEY = 'hlx_ad_attribution';
  var FIRST_SHOWN = 8;
  var SPARKLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>';
  var TRACKED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid'];

  // locked: the page was opened for one category (salon.html?spa or ?category=spa),
  // so only that category's services and branches are shown.
  var state = { config: null, category: '', showAll: false, locked: false };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function naira(v) {
    return '₦' + (Number(v) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  }

  function minutesLabel(mins) {
    var m = Number(mins) || 0;
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + (h === 1 ? ' hr' : ' hrs') + (r ? ' ' + r + ' min' : '');
  }

  function store(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function load(key) {
    try { var v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  // ─── Attribution (same shape as book-now.js) ──────────────────────────

  function captureAttribution() {
    var q = new URLSearchParams(location.search);
    var saved = load(ATTR_KEY) || {};
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
    var isNewTouch = Object.keys(fresh).length > 0;
    var attr = isNewTouch ? fresh : saved;
    if (isNewTouch || !saved.landingUrl) {
      attr.landingUrl = location.href.split('#')[0].slice(0, 255);
      attr.referrer = (document.referrer || '').slice(0, 255) || undefined;
    }
    store(ATTR_KEY, attr);
  }

  /** book-now.html with the ad tags from this visit, plus optional branch / service. */
  function bookUrl(extra) {
    var here = new URLSearchParams(location.search);
    var q = new URLSearchParams();
    TRACKED.forEach(function (k) { if (here.get(k)) q.set(k, here.get(k)); });
    ['branch', 'service'].forEach(function (k) { if (here.get(k)) q.set(k, here.get(k)); });
    // A category link carries on to the booking page, which then lists that category first.
    if (state.locked) q.set('category', state.category);
    Object.keys(extra || {}).forEach(function (k) {
      if (extra[k]) q.set(k, extra[k]); else q.delete(k);
    });
    var s = q.toString();
    return 'book-now.html' + (s ? '?' + s : '');
  }

  function wireBookLinks() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-book]'), function (a) {
      a.href = bookUrl();
    });
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

  // ─── Content ──────────────────────────────────────────────────────────

  // ─── Category from the link ───────────────────────────────────────────

  /** "Hair Styling & Braids" -> "hairstylingbraids", for matching link keys. */
  function catKey(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /** The category asked for in the link: salon.html?category=spa, or just salon.html?spa
   * (a bare word, next to any ad tags). Null when none is given. */
  function requestedCategory() {
    var q = new URLSearchParams(location.search);
    if (q.get('category')) return q.get('category');
    var known = TRACKED.concat(['branch', 'service', 'category']);
    var hit = null;
    q.forEach(function (value, key) {
      if (!hit && !value && known.indexOf(key) === -1) hit = key;
    });
    return hit;
  }

  /** Match the link key to one of the service categories: exact first ("spa" = "Spa",
   * "hair-styling" = "Hair Styling"), then a single category starting with it or
   * containing it as a word ("nails" = "Nails & Lashes"). Null when nothing or several match. */
  function matchCategory(wanted, categories) {
    var key = catKey(wanted);
    if (!key) return null;
    var exact = categories.filter(function (c) { return catKey(c) === key; });
    if (exact.length) return exact[0];
    var loose = categories.filter(function (c) {
      return catKey(c).indexOf(key) === 0 || String(c).toLowerCase().split(/[^a-z0-9]+/).indexOf(key) !== -1;
    });
    return loose.length === 1 ? loose[0] : null;
  }

  function categories() {
    var cats = [];
    state.config.services.forEach(function (s) {
      if (s.category && cats.indexOf(s.category) === -1) cats.push(s.category);
    });
    return cats;
  }

  /** Services shown on the page: only the linked category when the page is locked to one. */
  function pageServices() {
    return state.locked
      ? state.config.services.filter(function (s) { return s.category === state.category; })
      : state.config.services;
  }

  /** A category link: heading, page title and a way back to every service. */
  function applyCategoryLock() {
    var wanted = requestedCategory();
    if (!wanted) return;
    var cat = matchCategory(wanted, categories());
    if (!cat) return; // unknown category: show everything rather than an empty page
    state.category = cat;
    state.locked = true;
    var head = document.querySelector('#services .section-head h2');
    if (head) head.textContent = cat + ' services and prices';
    document.title = cat + ' | Hairlux Salon & Spa | Book Your Appointment';
    var here = new URLSearchParams(location.search);
    var keep = new URLSearchParams();
    TRACKED.forEach(function (k) { if (here.get(k)) keep.set(k, here.get(k)); });
    var all = $('allServicesLink');
    if (all) {
      all.href = 'salon.html' + (keep.toString() ? '?' + keep.toString() : '') + '#services';
      all.classList.remove('hidden');
    }
    wireBookLinks(); // "Book" buttons now carry the category
  }

  function lowestPrice(s) {
    return s.branches.reduce(function (min, b) { return min === null || b.price < min ? b.price : min; }, null);
  }

  function renderDepositCopy() {
    var c = state.config;
    if (!c) return;
    var parts = [];
    if (c.depositPercent > 0) parts.push(c.depositPercent + '% of the price');
    if (c.minDepositAmount > 0) parts.push((c.depositPercent > 0 ? 'at least ' : '') + naira(c.minDepositAmount));
    var rule = parts.join(', ');
    if (rule) {
      $('faqDeposit').textContent = 'It is ' + rule + ', and never more than the price. You see the exact amount before you pay, and it comes off your final bill.' +
        (c.allowFullPayment ? ' You can also choose to pay in full.' : '');
    }
    if (c.depositPercent > 0) $('chipDeposit').textContent = 'Just ' + c.depositPercent + '% deposit, comes off your bill';
  }

  function renderFilters() {
    if (state.locked) return; // one category only: no filter chips
    var cats = categories();
    if (cats.length < 2) return;
    var el = $('filters');
    el.classList.remove('hidden');
    el.innerHTML = ['All'].concat(cats).map(function (c) {
      var key = c === 'All' ? '' : c;
      return '<button type="button" class="filter" aria-pressed="' + (state.category === key) + '" data-cat="' + esc(key) + '">' + esc(c) + '</button>';
    }).join('');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      state.category = b.getAttribute('data-cat');
      state.showAll = false;
      Array.prototype.forEach.call(el.querySelectorAll('[data-cat]'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderServices();
      var top = $('services-list').getBoundingClientRect().top;
      if (top < 0) $('filters').scrollIntoView({ block: 'start' });
    });
  }

  function renderServices() {
    var list = pageServices().filter(function (s) { return !state.category || s.category === state.category; });
    var shown = state.showAll ? list : list.slice(0, FIRST_SHOWN);
    // One row per service (2026-10-28): picture, name, price and time, and a clear Book button.
    $('services-list').innerHTML = shown.length ? shown.map(function (s) {
      var prices = s.branches.map(function (b) { return b.price; });
      var same = prices.every(function (p) { return p === prices[0]; });
      return '<a class="svc" href="' + esc(bookUrl({ service: s.id })) + '">' +
        (s.imageUrl ? '<img class="svc-img" src="' + esc(s.imageUrl) + '" alt="" loading="lazy" />' : '<span class="svc-img svc-img-blank" aria-hidden="true">' + SPARKLE_ICON + '</span>') +
        '<span class="svc-body">' +
        '<span class="svc-name">' + esc(s.name) + '</span>' +
        (s.description ? '<span class="svc-desc">' + esc(s.description) + '</span>' : '') +
        '<span class="svc-meta">' + (same ? '' : 'from ') + '<strong>' + naira(lowestPrice(s)) + '</strong>' +
        (s.duration ? ' &middot; ' + minutesLabel(s.duration) : '') + '</span>' +
        '</span>' +
        '<span class="svc-go">Book</span>' +
        '</a>';
    }).join('') : '<div class="empty">No services in this category right now.</div>';
    var more = list.length > shown.length;
    $('moreWrap').classList.toggle('hidden', !more);
    if (more) $('moreBtn').textContent = 'Show all ' + list.length + ' services';
  }

  function renderBranches() {
    var c = state.config;
    var rows = c.branches.map(function (b) {
      var n = pageServices().filter(function (s) { return s.branches.some(function (x) { return x.branchId === b.id; }); }).length;
      return { branch: b, count: n };
    }).filter(function (r) { return r.count > 0; });
    $('branches-list').innerHTML = rows.length ? rows.map(function (r) {
      var b = r.branch;
      var maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Hairlux ' + b.name + ', ' + b.address);
      return '<div class="branch">' +
        '<h3>' + esc(b.name) + '</h3>' +
        '<div class="addr">' + esc(b.address) + '</div>' +
        '<div class="branch-actions">' +
        '<a class="btn btn-primary btn-small" href="' + esc(bookUrl({ branch: b.id })) + '">Book at this branch</a>' +
        '<a class="btn btn-ghost btn-small" href="' + maps + '" target="_blank" rel="noopener">Directions</a>' +
        '</div></div>';
    }).join('') : '<div class="empty" style="grid-column:1/-1">Please call or visit any Hairlux branch to book.</div>';
  }

  function showUnavailable() {
    $('services-list').innerHTML = '<div class="empty" style="grid-column:1/-1">Online booking is paused right now. Please call or visit any Hairlux branch.</div>';
    $('branches-list').innerHTML = '<div class="empty" style="grid-column:1/-1">See our <a href="contact.html">contact page</a> for branch details.</div>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-book]'), function (a) {
      a.href = 'contact.html';
      a.textContent = 'Contact us';
    });
  }

  // ─── Start ────────────────────────────────────────────────────────────

  /** The phone booking bar shows as soon as the hero buttons scroll out of view. */
  function stickyCta() {
    var bar = $('mobileCta');
    var ctas = $('heroCtas');
    if (ctas && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        bar.classList.toggle('show', !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0);
      }).observe(ctas);
      return;
    }
    var onScroll = function () { bar.classList.toggle('show', window.scrollY > 400); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /** Hero line with the branch count, and "from" price in the phone booking bar. */
  function renderHeroFacts() {
    var c = state.config;
    var n = c.branches.filter(function (b) {
      return pageServices().some(function (s) { return s.branches.some(function (x) { return x.branchId === b.id; }); });
    }).length;
    if (n > 1) $('heroEyebrow').textContent = 'Hairlux Salon & Spa \u00B7 ' + n + ' branches';
    var low = pageServices().reduce(function (min, s) { var p = lowestPrice(s); return min === null || (p !== null && p < min) ? p : min; }, null);
    if (low) $('mcSub').textContent = (state.locked ? state.category + ' from ' : 'Services from ') + naira(low);
  }

  async function init() {
    $('year').textContent = new Date().getFullYear();
    captureAttribution();
    wireBookLinks();
    stickyCta();
    $('moreBtn').addEventListener('click', function () { state.showAll = true; renderServices(); });

    try {
      var res = await fetch(API + '/public/ad-bookings/config');
      var body = await res.json();
      if (!res.ok) throw new Error('config');
      state.config = body && body.data !== undefined ? body.data : body;
    } catch (e) {
      $('services-list').innerHTML = '<div class="empty" style="grid-column:1/-1">We could not load services. You can still <a href="' + esc(bookUrl()) + '">book here</a>.</div>';
      $('branches-list').innerHTML = '';
      return;
    }

    initPixel(state.config.metaPixelId);
    if (!state.config.enabled || !state.config.services.length) { showUnavailable(); return; }
    renderDepositCopy();
    applyCategoryLock();
    renderFilters();
    renderServices();
    renderBranches();
    renderHeroFacts();
  }

  init();
})();
