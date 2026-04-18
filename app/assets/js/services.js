  (function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────
    var _KEY = 'hlx2024';

    function encodeBookingParams(obj) {
      try {
        var json = JSON.stringify(obj);
        var hex = '';
        for (var i = 0; i < json.length; i++) {
          hex += ('0' + (json.charCodeAt(i) ^ _KEY.charCodeAt(i % _KEY.length)).toString(16)).slice(-2);
        }
        return btoa(hex);
      } catch (e) { return ''; }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatPrice(n) {
      return '\u20a6' + Number(n).toLocaleString('en-NG');
    }

    function getServiceDisplayPrice(svc) {
      var prices = [];

      var canWalkIn = svc && svc.isWalkInAvailable !== false;
      var canHome   = svc && svc.isHomeServiceAvailable !== false;

      if (canWalkIn && svc && svc.walkInPrice != null) {
        var walk = Number(svc.walkInPrice);
        if (!isNaN(walk) && walk >= 0) prices.push(walk);
      }

      if (canHome && svc && svc.homeServicePrice != null) {
        var home = Number(svc.homeServicePrice);
        if (!isNaN(home) && home >= 0) prices.push(home);
      }

      if (prices.length) return Math.min.apply(null, prices);

      var fallback = Number((svc && (svc.price || svc.basePrice || svc.amount)) || 0);
      return isNaN(fallback) ? 0 : fallback;
    }

    // Fallback image per category keyword
    var FALLBACK_IMAGES = [
      { key: 'nail',    url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80' },
      { key: 'facial',  url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80' },
      { key: 'massage', url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80' },
      { key: 'hair',    url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80' }
    ];

    function getFallbackImage(categoryName) {
      var name = (categoryName || '').toLowerCase();
      for (var i = 0; i < FALLBACK_IMAGES.length; i++) {
        if (name.indexOf(FALLBACK_IMAGES[i].key) !== -1) return FALLBACK_IMAGES[i].url;
      }
      return FALLBACK_IMAGES[FALLBACK_IMAGES.length - 1].url;
    }

    // ── State ─────────────────────────────────────────────────
    // Map: serviceId (UUID) → { id, name, price, duration, categoryId }
    var selected = new Map();
    var activeCategoryId = '';
    var searchTerm = '';
    var allServices = [];
    var filteredServices = [];
    var currentPage = 1;
    var pageSize = 9;

    // ── DOM refs ──────────────────────────────────────────────
    var grid        = document.getElementById('services-grid');
    var searchInput = document.getElementById('service-search-input');
    var chipsWrap   = document.getElementById('category-chips');
    var bar         = document.getElementById('selection-bar');
    var chipsScroll = document.getElementById('sel-chips-scroll');
    var countEl     = document.getElementById('sel-summary-count');
    var totalEl     = document.getElementById('sel-summary-total');
    var clearBtn    = document.getElementById('sel-clear-btn');
    var continueBtn = document.getElementById('sel-continue-btn');
    var paginationWrap = document.getElementById('services-pagination');

    // ── Selection bottom bar ──────────────────────────────────
    function renderBar() {
      var count = selected.size;
      if (count === 0) {
        bar.classList.remove('visible');
        document.body.style.paddingBottom = '';
        return;
      }

      chipsScroll.innerHTML = '';
      var totalPrice = 0, totalDuration = 0;

      selected.forEach(function (svc) {
        totalPrice    += svc.price;
        totalDuration += svc.duration;

        var chip = document.createElement('div');
        chip.className = 'sel-chip';
        chip.innerHTML =
          '<span>' + escapeHtml(svc.name) + '</span>' +
          '<button type="button" class="sel-chip-remove" data-id="' + escapeHtml(svc.id) + '" aria-label="Remove ' + escapeHtml(svc.name) + '">' +
            '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>' +
          '</button>';
        chipsScroll.appendChild(chip);
      });

      countEl.textContent = count + ' service' + (count !== 1 ? 's' : '') + ' \u00b7 ' + totalDuration + ' mins';
      totalEl.textContent = formatPrice(totalPrice);

      var token = encodeBookingParams({
        services:      Array.from(selected.values()),
        totalPrice:    totalPrice,
        totalDuration: totalDuration
      });
      continueBtn.href = 'booking.html?d=' + encodeURIComponent(token);

      try {
        sessionStorage.setItem('selectedServices', JSON.stringify(Array.from(selected.values())));
      } catch (e) {}

      bar.classList.add('visible');
      requestAnimationFrame(function () {
        document.body.style.paddingBottom = bar.offsetHeight + 'px';
      });
    }

    // ── Toggle a service card selection ──────────────────────
    function toggleService(cardEl) {
      var id       = cardEl.dataset.serviceId;
      var btn      = cardEl.querySelector('.sel-btn');
      var btnText  = cardEl.querySelector('.sel-btn-text');

      if (selected.has(id)) {
        selected.delete(id);
        cardEl.classList.remove('selected');
        if (btn) { btn.classList.remove('selected-active'); btn.classList.add('unselected'); }
        if (btnText) btnText.textContent = 'Select Service';
      } else {
        selected.set(id, {
          id:         id,
          name:       cardEl.dataset.serviceName,
          price:      parseInt(cardEl.dataset.servicePrice, 10),
          duration:   parseInt(cardEl.dataset.serviceDuration, 10),
          categoryId: cardEl.dataset.categoryId || ''
        });
        cardEl.classList.add('selected');
        if (btn) { btn.classList.remove('unselected'); btn.classList.add('selected-active'); }
        if (btnText) btnText.textContent = 'Selected \u2713';
      }
      renderBar();
    }

    // ── Build a service card element ──────────────────────────
    function buildCard(svc) {
      var imgUrl   = svc.imageUrl || getFallbackImage((svc.category && svc.category.name) || '');
      var catName  = (svc.category && svc.category.name) || '';
      var displayPrice = getServiceDisplayPrice(svc);
      var isSelected = selected.has(String(svc.id));
      var canWalkIn = svc && svc.isWalkInAvailable === true;
      var canHomeService = svc && svc.isHomeServiceAvailable === true;

      var modeBadges = '';
      if (canWalkIn) {
        modeBadges += '<span class="service-mode-pill walkin">Walk-In</span>';
      }
      if (canHomeService) {
        modeBadges += '<span class="service-mode-pill mobile">Mobile Service</span>';
      }
      if (!modeBadges) {
        modeBadges = '<span class="service-mode-pill unavailable">Currently unavailable</span>';
      }

      var div = document.createElement('div');
      div.className = 'service-item' + (isSelected ? ' selected' : '');
      div.style.backgroundImage = 'url(\'' + escapeHtml(imgUrl) + '\')';

      // Hidden data attributes — the real UUID is stored here
      div.dataset.serviceId       = svc.id;
      div.dataset.serviceName     = svc.name;
      div.dataset.servicePrice    = displayPrice;
      div.dataset.serviceDuration = svc.duration;
      div.dataset.categoryId      = svc.categoryId || '';

      div.innerHTML =
        '<div class="sel-check" aria-hidden="true">' +
          '<svg viewBox="0 0 16 16"><polyline points="2.5,8 6.5,12 13.5,4.5"/></svg>' +
        '</div>' +
        '<div class="service-mode-badges" aria-label="Service availability">' +
          modeBadges +
        '</div>' +
        '<div class="service-card-content">' +
          '<h4 class="heading-regular">' + escapeHtml(svc.name) + '</h4>' +
          '<p class="p-regular">' + escapeHtml(svc.description || '') + '</p>' +
          '<div class="service-cost">From ' + formatPrice(displayPrice) + '</div>' +
          '<button type="button" class="sel-btn ' + (isSelected ? 'selected-active' : 'unselected') + '"><span class="sel-btn-text">' + (isSelected ? 'Selected \u2713' : 'Select Service') + '</span></button>' +
        '</div>';

      div.addEventListener('click', function () { toggleService(div); });
      return div;
    }

    function getPageSequence(totalPages, page) {
      var sequence = [];
      if (totalPages <= 7) {
        for (var i = 1; i <= totalPages; i++) sequence.push(i);
        return sequence;
      }

      sequence.push(1);
      var left = Math.max(2, page - 1);
      var right = Math.min(totalPages - 1, page + 1);

      if (left > 2) sequence.push('ellipsis-left');
      for (var j = left; j <= right; j++) sequence.push(j);
      if (right < totalPages - 1) sequence.push('ellipsis-right');

      sequence.push(totalPages);
      return sequence;
    }

    function renderPagination(totalCount, pageStartIndex, pageEndIndex, totalPages) {
      if (!paginationWrap) return;

      if (!totalCount) {
        paginationWrap.innerHTML = '';
        paginationWrap.classList.remove('visible');
        return;
      }

      var summary =
        '<div class="services-pagination-meta">Showing <strong>' +
        (pageStartIndex + 1) +
        '</strong> - <strong>' +
        pageEndIndex +
        '</strong> of <strong>' +
        totalCount +
        '</strong> services</div>';

      if (totalPages <= 1) {
        paginationWrap.innerHTML = summary;
        paginationWrap.classList.add('visible');
        return;
      }

      var sequence = getPageSequence(totalPages, currentPage);
      var controls =
        '<div class="services-pagination-controls">' +
          '<button type="button" class="services-page-btn services-page-nav" data-page="prev" ' + (currentPage === 1 ? 'disabled' : '') + '>Previous</button>';

      sequence.forEach(function (item) {
        if (typeof item === 'number') {
          controls +=
            '<button type="button" class="services-page-btn' + (item === currentPage ? ' active' : '') + '" data-page="' + item + '">' +
            item +
            '</button>';
        } else {
          controls += '<span class="services-page-ellipsis" aria-hidden="true">...</span>';
        }
      });

      controls +=
          '<button type="button" class="services-page-btn services-page-nav" data-page="next" ' + (currentPage === totalPages ? 'disabled' : '') + '>Next</button>' +
        '</div>';

      paginationWrap.innerHTML = summary + controls;
      paginationWrap.classList.add('visible');
    }

    // ── Render cards into the grid ────────────────────────────
    function renderServices(services) {
      filteredServices = Array.isArray(services) ? services.slice() : [];
      grid.innerHTML = '';
      if (!filteredServices.length) {
        var emptyMsg = 'No services found in this category.';
        if (searchTerm.trim()) {
          emptyMsg = 'No services match "' + escapeHtml(searchTerm.trim()) + '".';
        }
        grid.innerHTML = '<p class="p-regular" style="color:var(--muted);grid-column:1/-1;padding:24px 0;">' + emptyMsg + '</p>';
        renderPagination(0, 0, 0, 0);
        return;
      }

      var totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      var startIndex = (currentPage - 1) * pageSize;
      var endIndex = Math.min(startIndex + pageSize, filteredServices.length);
      var pageItems = filteredServices.slice(startIndex, endIndex);

      pageItems.forEach(function (svc) {
        grid.appendChild(buildCard(svc));
      });

      renderPagination(filteredServices.length, startIndex, endIndex, totalPages);
    }

    function matchesSearch(svc, query) {
      if (!query) return true;
      var hay = [
        svc && svc.name,
        svc && svc.description,
        svc && svc.category && svc.category.name,
        svc && svc.duration != null ? String(svc.duration) + ' mins' : '',
        formatPrice(getServiceDisplayPrice(svc))
      ].join(' ').toLowerCase();
      return hay.indexOf(query) !== -1;
    }

    // ── Filter by category + local search ────────────────────
    function applyFilter() {
      var filtered = allServices;

      if (activeCategoryId) {
        filtered = filtered.filter(function (s) {
          return s.categoryId === activeCategoryId;
        });
      }

      var query = searchTerm.trim().toLowerCase();
      if (query) {
        filtered = filtered.filter(function (s) {
          return matchesSearch(s, query);
        });
      }

      currentPage = 1;
      renderServices(filtered);
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchTerm = this.value || '';
        applyFilter();
      });
    }

    // ── Category chip click ───────────────────────────────────
    function onChipClick(e) {
      var btn = e.target.closest('button[data-category-id]');
      if (!btn) return;
      activeCategoryId = btn.dataset.categoryId;
      chipsWrap.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      applyFilter();
    }

    chipsWrap.addEventListener('click', onChipClick);

    if (paginationWrap) {
      paginationWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;

        var target = btn.dataset.page;
        var totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize));

        if (target === 'prev') {
          currentPage = Math.max(1, currentPage - 1);
        } else if (target === 'next') {
          currentPage = Math.min(totalPages, currentPage + 1);
        } else {
          var asNumber = parseInt(target, 10);
          if (!isNaN(asNumber)) {
            currentPage = Math.max(1, Math.min(totalPages, asNumber));
          }
        }

        renderServices(filteredServices);

        if (typeof window.scrollTo === 'function') {
          window.scrollTo({ top: Math.max(0, grid.offsetTop - 130), behavior: 'smooth' });
        }
      });
    }

    // ── Selection bar: chip remove buttons ───────────────────
    chipsScroll.addEventListener('click', function (e) {
      var removeBtn = e.target.closest('.sel-chip-remove');
      if (!removeBtn) return;
      var id = removeBtn.dataset.id;
      var cardEl = grid.querySelector('.service-item[data-service-id="' + id + '"]');
      if (cardEl) {
        toggleService(cardEl);
        return;
      }

      if (selected.has(id)) {
        selected.delete(id);
        renderBar();
        renderServices(filteredServices);
      }
    });

    // ── Clear all ─────────────────────────────────────────────
    clearBtn.addEventListener('click', function () {
      selected.clear();
      renderBar();
      renderServices(filteredServices);
    });

    // ── Loading / error states ────────────────────────────────
    function showGridLoading() {
      grid.innerHTML =
        '<div style="grid-column:1/-1;padding:40px 0;text-align:center;color:var(--muted);">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;vertical-align:middle;margin-right:8px;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>' +
          'Loading services…' +
        '</div>';
    }

    function showGridError(msg) {
      grid.innerHTML =
        '<p class="p-regular" style="color:#dc3545;grid-column:1/-1;padding:24px 0;">' +
          escapeHtml(msg || 'Failed to load services. Please refresh the page.') +
        '</p>';
    }

    // ── Bootstrap: load categories then services ──────────────
    function init() {
      showGridLoading();

      // Load categories for chips
      ServicesAPI.getCategories()
        .then(function (res) {
          var cats = (res && res.data) || [];
          cats.forEach(function (cat) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'service-chip';
            btn.dataset.categoryId = cat.id;
            btn.textContent = cat.name;
            chipsWrap.appendChild(btn);
          });
        })
        .catch(function () {
          // chips stay with just "All" if categories fail
        });

      // Load all active services
      ServicesAPI.getServices({ status: 'ACTIVE' })
        .then(function (res) {
          allServices = (res && res.data) || [];
          applyFilter();
        })
        .catch(function (err) {
          showGridError((err && err.message) || 'Failed to load services.');
        });
    }

    // Add spin keyframe once
    (function () {
      if (!document.getElementById('hlx-spin-style')) {
        var s = document.createElement('style');
        s.id = 'hlx-spin-style';
        s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
      }
    })();

    init();
  })();