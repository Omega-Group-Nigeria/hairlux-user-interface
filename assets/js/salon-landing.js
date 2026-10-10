/**
 * Hairlux ad landing page (salon.html).
 *
 * Ads point here first. The page shows services with prices and the branches
 * (from the same public config the booking page uses), and every "Book"
 * button goes to book-now.html. The ad tags (utm_*, fbclid / gclid / ttclid)
 * are saved in sessionStorage the same way book-now.js does, and passed on in
 * the booking links, so the booking is still logged with its source and with
 * this page as where the visitor first landed. Meta Pixel PageView fires here
 * when a Pixel ID is set in admin.
 */
(function () {
  'use strict';

  // config.js declares API_CONFIG with const, so it is not on window.
  var API = (typeof API_CONFIG !== 'undefined' && API_CONFIG.BASE_URL) || '';
  var ATTR_KEY = 'hlx_ad_attribution';
  var FIRST_SHOWN = 9;
  var TRACKED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid'];

  var state = { config: null, category: '', showAll: false };
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
    var cats = [];
    state.config.services.forEach(function (s) {
      if (s.category && cats.indexOf(s.category) === -1) cats.push(s.category);
    });
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
    });
  }

  function renderServices() {
    var list = state.config.services.filter(function (s) { return !state.category || s.category === state.category; });
    var shown = state.showAll ? list : list.slice(0, FIRST_SHOWN);
    $('services-list').innerHTML = shown.length ? shown.map(function (s) {
      var prices = s.branches.map(function (b) { return b.price; });
      var same = prices.every(function (p) { return p === prices[0]; });
      return '<a class="svc" href="' + esc(bookUrl({ service: s.id })) + '">' +
        (s.imageUrl ? '<img class="svc-img" src="' + esc(s.imageUrl) + '" alt="" loading="lazy" />' : '') +
        '<div class="svc-body">' +
        (s.category ? '<div class="svc-cat">' + esc(s.category) + '</div>' : '') +
        '<div class="svc-name">' + esc(s.name) + '</div>' +
        (s.description ? '<div class="svc-desc">' + esc(s.description) + '</div>' : '') +
        '<div class="svc-foot"><span class="svc-price">' + (same ? '' : '<small>from </small>') + naira(lowestPrice(s)) +
        (s.duration ? ' <small>· ' + minutesLabel(s.duration) + '</small>' : '') + '</span>' +
        '<span class="svc-cta">Book →</span></div>' +
        '</div></a>';
    }).join('') : '<div class="empty" style="grid-column:1/-1">No services in this category right now.</div>';
    var more = list.length > shown.length;
    $('moreWrap').classList.toggle('hidden', !more);
    if (more) $('moreBtn').textContent = 'Show all ' + list.length + ' services';
  }

  function renderBranches() {
    var c = state.config;
    var rows = c.branches.map(function (b) {
      var n = c.services.filter(function (s) { return s.branches.some(function (x) { return x.branchId === b.id; }); }).length;
      return { branch: b, count: n };
    }).filter(function (r) { return r.count > 0; });
    $('branches-list').innerHTML = rows.length ? rows.map(function (r) {
      var b = r.branch;
      var maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Hairlux ' + b.name + ', ' + b.address);
      return '<div class="branch">' +
        '<h3>' + esc(b.name) + '</h3>' +
        '<div class="addr">' + esc(b.address) + '</div>' +
        '<div class="count">' + r.count + (r.count === 1 ? ' service' : ' services') + ' bookable online</div>' +
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

  function stickyCta() {
    var bar = $('mobileCta');
    var hero = document.querySelector('.hero');
    var onScroll = function () {
      bar.classList.toggle('show', window.scrollY > (hero ? hero.offsetHeight * 0.6 : 300));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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
    renderFilters();
    renderServices();
    renderBranches();
  }

  init();
})();
