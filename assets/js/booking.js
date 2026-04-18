(function () {
  // ── Param decoder (XOR + base64, mirrors services.html encoder) ──
  const _KEY = 'hlx2024';
  const BOOKING_GATEWAY_STATE_KEY = 'hairlux.booking.gateway.pending';
  const BOOKING_GATEWAY_PROVIDER = 'monnify';

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
  function getServicePriceForType(service, type) {
    const targetType = type || bookingType;
    const walkIn = Number(service && service.walkInPrice);
    const home = Number(service && service.homeServicePrice);
    const hasWalk = (service && service.isWalkInAvailable !== false) && Number.isFinite(walkIn) && walkIn >= 0;
    const hasHome = (service && service.isHomeServiceAvailable !== false) && Number.isFinite(home) && home >= 0;

    if (targetType === 'WALK_IN') {
      if (hasWalk) return walkIn;
      if (hasHome) return home;
    } else {
      if (hasHome) return home;
      if (hasWalk) return walkIn;
    }

    const fallback = Number((service && (service.price || service.basePrice || service.amount)) || 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }
  function getTotalPrice()       { return allSelectedServices.reduce((s, x) => s + getServicePriceForType(x), 0); }
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
  const guestEmailEl     = document.getElementById('guestEmail');

  // Booking type
  const homeServiceCard  = document.getElementById('homeServiceCard');
  const walkInCard       = document.getElementById('walkInCard');

  const newFullAddress = document.getElementById('newFullAddress');
  const newAddressSuggestions = document.getElementById('newAddressSuggestions');
  const bookingAddressMapEl = document.getElementById('bookingAddressMap');
  const bookingMapStatusEl = document.getElementById('bookingMapStatus');
  const newStreetAddress = document.getElementById('newStreetAddress');
  const newCity        = document.getElementById('newCity');
  const newState       = document.getElementById('newState');
  const newCountry     = document.getElementById('newCountry');
  const newPlaceId     = document.getElementById('newPlaceId');

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
  let pendingBookingAmountDue = 0;
  let walletBalance = 0;
  let bookingPaymentReference = '';
  let bookingPaymentProvider = BOOKING_GATEWAY_PROVIDER;
  let bookingType    = 'HOME_SERVICE'; // 'HOME_SERVICE' | 'WALK_IN'
  let bookingTypeCapabilities = { home: true, walk: true };
  let bookingForSelf = true;
  let mapsLoaderPromise = null;
  let bookingMapInstance = null;
  let bookingMapMarker = null;
  let bookingMapGeocoder = null;
  let bookingAutocompleteService = null;
  let bookingPlacesService = null;
  let bookingPredictionDebounceTimer = null;
  const defaultMapCenter = { lat: 6.5244, lng: 3.3792 };

  function getBookingType()   { return bookingType; }
  function getPaymentMethod() { return 'WALLET'; }
  function isBookingForSelf() { return bookingForSelf; }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
  }

  function hasModePricingShape(service) {
    return Boolean(
      service && (
        hasOwn(service, 'walkInPrice') ||
        hasOwn(service, 'homeServicePrice') ||
        service.walkInPrice != null ||
        service.homeServicePrice != null
      )
    );
  }

  function isServiceModeAvailable(service, mode) {
    if (!service || typeof service !== 'object') return false;

    const fallbackPrice = Number(service.price != null ? service.price : (service.basePrice != null ? service.basePrice : service.amount));
    const hasFallbackPrice = Number.isFinite(fallbackPrice) && fallbackPrice >= 0;

    const walkPrice = Number(service.walkInPrice);
    const homePrice = Number(service.homeServicePrice);
    const hasWalkPrice = Number.isFinite(walkPrice) && walkPrice >= 0;
    const hasHomePrice = Number.isFinite(homePrice) && homePrice >= 0;

    const hasExplicitWalkFlag = typeof service.isWalkInAvailable === 'boolean';
    const hasExplicitHomeFlag = typeof service.isHomeServiceAvailable === 'boolean';
    const walkEnabled = hasExplicitWalkFlag ? service.isWalkInAvailable : true;
    const homeEnabled = hasExplicitHomeFlag ? service.isHomeServiceAvailable : true;
    const hasModePrices = hasModePricingShape(service);

    if (mode === 'WALK_IN') {
      if (!walkEnabled) return false;
      if (hasModePrices) return hasWalkPrice;
      return hasFallbackPrice;
    }

    if (!homeEnabled) return false;
    if (hasModePrices) return hasHomePrice;
    return hasFallbackPrice;
  }

  function getModeBlockers(mode) {
    return getSelectedServices().filter(function (svc) {
      return !isServiceModeAvailable(svc, mode);
    });
  }

  function computeBookingTypeCapabilities() {
    const services = getSelectedServices();
    if (!services.length) {
      return { home: true, walk: true };
    }

    return {
      home: services.every(function (svc) { return isServiceModeAvailable(svc, 'HOME_SERVICE'); }),
      walk: services.every(function (svc) { return isServiceModeAvailable(svc, 'WALK_IN'); })
    };
  }

  function setBookingTypeCardState(card, enabled) {
    if (!card) return;
    card.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    card.style.opacity = enabled ? '' : '0.75';
    card.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  function updateBookingTypeHelper(message, tone) {
    const card = homeServiceCard || walkInCard;
    const field = card ? card.closest('.field.full') : null;
    if (!field) return;

    let helper = document.getElementById('bookingTypeHelper');
    if (!helper) {
      helper = document.createElement('div');
      helper.id = 'bookingTypeHelper';
      helper.className = 'helper-text';
      helper.style.marginTop = '8px';
      field.appendChild(helper);
    }

    helper.textContent = message || '';
    helper.style.color = tone === 'error' ? '#dc3545' : '';
  }

  function applyBookingTypeAvailability() {
    bookingTypeCapabilities = computeBookingTypeCapabilities();
    const canHome = bookingTypeCapabilities.home;
    const canWalk = bookingTypeCapabilities.walk;
    const homeBlockers = getModeBlockers('HOME_SERVICE');
    const walkBlockers = getModeBlockers('WALK_IN');

    if (homeServiceCard) homeServiceCard.style.display = canHome ? '' : 'none';
    if (walkInCard) walkInCard.style.display = canWalk ? '' : 'none';

    if (canHome && canWalk) {
      if (bookingType !== 'HOME_SERVICE' && bookingType !== 'WALK_IN') {
        bookingType = 'HOME_SERVICE';
      }
      setBookingTypeCardState(homeServiceCard, true);
      setBookingTypeCardState(walkInCard, true);
      updateBookingTypeHelper('Some services support both modes. Choose your preferred booking type.', 'info');
    } else if (canHome) {
      bookingType = 'HOME_SERVICE';
      setBookingTypeCardState(homeServiceCard, false);
      setBookingTypeCardState(walkInCard, false);
      updateBookingTypeHelper(
        walkBlockers.length
          ? ('Walk-in is unavailable for: ' + walkBlockers.map(function (s) { return s.name; }).join(', ') + '.')
          : 'Selected services are available only for mobile service.',
        'info'
      );
    } else if (canWalk) {
      bookingType = 'WALK_IN';
      setBookingTypeCardState(homeServiceCard, false);
      setBookingTypeCardState(walkInCard, false);
      updateBookingTypeHelper(
        homeBlockers.length
          ? ('Mobile service is unavailable for: ' + homeBlockers.map(function (s) { return s.name; }).join(', ') + '.')
          : 'Selected services are available only for walk-in bookings.',
        'info'
      );
    } else {
      bookingType = 'HOME_SERVICE';
      setBookingTypeCardState(homeServiceCard, false);
      setBookingTypeCardState(walkInCard, false);
      updateBookingTypeHelper('Selected services have no valid booking type available. Please change your service selection.', 'error');
    }

    selectOptionCard([homeServiceCard, walkInCard], bookingType === 'HOME_SERVICE' ? homeServiceCard : walkInCard);
    const isHome = bookingType === 'HOME_SERVICE';
    if (addressSection) addressSection.classList.toggle('visible', isHome);
    if (!isHome) {
      addAddressWrap.style.display = 'none';
      if (savedAddressEl) savedAddressEl.value = '';
    }
  }

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

  function escAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function normalizeGatewayProvider(provider) {
    const candidate = String(provider || '').trim().toLowerCase();
    return candidate === 'monnify' ? 'monnify' : 'monnify';
  }

  function isFailedGatewayStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    return value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled' || value === 'abandoned';
  }

  function saveGatewayPendingState(payload) {
    try {
      window.sessionStorage.setItem(BOOKING_GATEWAY_STATE_KEY, JSON.stringify(payload));
    } catch (_) {
      // Ignore storage failures and continue with gateway flow.
    }
  }

  function readGatewayPendingState() {
    try {
      const raw = window.sessionStorage.getItem(BOOKING_GATEWAY_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.createdAt && (Date.now() - Number(parsed.createdAt)) > (6 * 60 * 60 * 1000)) {
        clearGatewayPendingState();
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function clearGatewayPendingState() {
    try {
      window.sessionStorage.removeItem(BOOKING_GATEWAY_STATE_KEY);
    } catch (_) {
      // Ignore storage failures.
    }
  }

  function cleanGatewayCallbackQuery() {
    if (window.history && typeof window.history.replaceState === 'function') {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  function createBookingPaymentIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'bookpay-' + window.crypto.randomUUID();
    }
    return 'bookpay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  async function hydrateSelectedServicesPricing() {
    const services = getSelectedServices();
    if (!services.length) return;

    const tasks = services.map(async function (svc) {
      if (!svc || !svc.id) return;
      try {
        const res = await APIHelper.request(
          API_CONFIG.ENDPOINTS.SERVICES + '/' + encodeURIComponent(svc.id)
        );
        const data = getApiData(res) || {};
        if (data && typeof data === 'object') {
          svc.walkInPrice = data.walkInPrice != null ? Number(data.walkInPrice) : svc.walkInPrice;
          svc.homeServicePrice = data.homeServicePrice != null ? Number(data.homeServicePrice) : svc.homeServicePrice;
          if (data.isWalkInAvailable != null) svc.isWalkInAvailable = Boolean(data.isWalkInAvailable);
          if (data.isHomeServiceAvailable != null) svc.isHomeServiceAvailable = Boolean(data.isHomeServiceAvailable);
          if (data.duration != null && Number.isFinite(Number(data.duration))) svc.duration = Number(data.duration);
        }
      } catch (e) {
        // Keep decoded/stored pricing when service lookup fails.
      }
    });

    await Promise.all(tasks);
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
      const servicePrice = getServicePriceForType(svc);
      const supportsWalk = isServiceModeAvailable(svc, 'WALK_IN');
      const supportsHome = isServiceModeAvailable(svc, 'HOME_SERVICE');
      const modeLabel = supportsWalk && supportsHome
        ? 'Both modes'
        : (supportsWalk
          ? 'Walk-In only'
          : (supportsHome ? 'Mobile only' : 'Unavailable'));
      html += `
        <div class="service-list-row">
          <span class="service-list-name">${escHtml(svc.name)}</span>
          <div class="service-list-badges">
            <span class="selected-service-chip">${modeLabel}</span>
            <span class="selected-service-chip">${formatMoney(servicePrice)}</span>
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
  function setBookingMapStatus(message, tone) {
    if (!bookingMapStatusEl) return;
    bookingMapStatusEl.textContent = message || '';
    bookingMapStatusEl.classList.remove('is-error', 'is-success');
    if (tone === 'error') bookingMapStatusEl.classList.add('is-error');
    if (tone === 'success') bookingMapStatusEl.classList.add('is-success');
  }

  function clearBookingAddressSuggestions() {
    if (!newAddressSuggestions) return;
    newAddressSuggestions.innerHTML = '';
    newAddressSuggestions.classList.remove('is-open');
  }

  function renderBookingAddressSuggestions(predictions) {
    if (!newAddressSuggestions) return;

    if (!Array.isArray(predictions) || !predictions.length) {
      clearBookingAddressSuggestions();
      return;
    }

    newAddressSuggestions.innerHTML = predictions.map(function (prediction) {
      const structured = prediction.structured_formatting || {};
      const main = structured.main_text || prediction.description || '';
      const sub = structured.secondary_text || '';

      return '' +
        '<button type="button" class="address-suggestion-item" ' +
        'data-place-id="' + escAttr(prediction.place_id || '') + '" ' +
        'data-description="' + escAttr(prediction.description || '') + '">' +
        '<div class="address-suggestion-main">' + escHtml(main) + '</div>' +
        (sub ? '<div class="address-suggestion-sub">' + escHtml(sub) + '</div>' : '') +
        '</button>';
    }).join('');

    newAddressSuggestions.classList.add('is-open');
  }

  function toLatLngLiteral(position) {
    if (!position) return null;
    if (typeof position.lat === 'function' && typeof position.lng === 'function') {
      return { lat: Number(position.lat()), lng: Number(position.lng()) };
    }
    if (typeof position.lat === 'number' && typeof position.lng === 'number') {
      return { lat: position.lat, lng: position.lng };
    }
    return null;
  }

  function pickAddressComponent(components, types) {
    if (!Array.isArray(components)) return '';
    for (let i = 0; i < components.length; i += 1) {
      const comp = components[i];
      if (!comp || !Array.isArray(comp.types)) continue;
      const matched = types.some(function (type) { return comp.types.indexOf(type) !== -1; });
      if (matched) return String(comp.long_name || comp.short_name || '').trim();
    }
    return '';
  }

  function parseAddressComponents(components) {
    const streetNumber = pickAddressComponent(components, ['street_number']);
    const route = pickAddressComponent(components, ['route']);
    return {
      streetAddress: [streetNumber, route].filter(Boolean).join(' ').trim(),
      city: pickAddressComponent(components, ['locality', 'postal_town', 'sublocality', 'sublocality_level_1']),
      state: pickAddressComponent(components, ['administrative_area_level_1']),
      country: pickAddressComponent(components, ['country']) || 'Nigeria'
    };
  }

  function syncOneTimeAddressFields(meta) {
    if (newStreetAddress) newStreetAddress.value = meta.streetAddress || '';
    if (newCity) newCity.value = meta.city || '';
    if (newState) newState.value = meta.state || '';
    if (newCountry) newCountry.value = meta.country || 'Nigeria';
    if (newPlaceId) newPlaceId.value = meta.placeId || '';
  }

  function applyBookingGeocodeResult(result, keepManualInput) {
    if (!result) return;

    const parsed = parseAddressComponents(result.address_components || []);
    const formattedAddress = String(result.formatted_address || '').trim();

    if (newFullAddress && (!keepManualInput || !newFullAddress.value.trim())) {
      newFullAddress.value = formattedAddress;
    }

    syncOneTimeAddressFields({
      placeId: String(result.place_id || '').trim(),
      streetAddress: parsed.streetAddress || formattedAddress,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country || 'Nigeria'
    });

    if (result.geometry && result.geometry.location && bookingMapInstance && bookingMapMarker) {
      const latLng = toLatLngLiteral(result.geometry.location);
      if (latLng) {
        bookingMapMarker.setPosition(latLng);
        bookingMapInstance.panTo(latLng);
        bookingMapInstance.setZoom(16);
      }
    }
  }

  function getGoogleMapsPublicKey() {
    const key = API_CONFIG && API_CONFIG.MAPS ? API_CONFIG.MAPS.GOOGLE_PUBLIC_KEY : '';
    return String(key || '').trim();
  }

  function loadGoogleMapsScript() {
    if (window.google && window.google.maps && window.google.maps.places) {
      return Promise.resolve();
    }

    if (mapsLoaderPromise) return mapsLoaderPromise;

    mapsLoaderPromise = new Promise(function (resolve, reject) {
      const key = getGoogleMapsPublicKey();
      if (!key) {
        reject(new Error('Google Maps key is missing. Set window.__HAIRLUX_PUBLIC_CONFIG__.googleMapsKey before loading this page.'));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&libraries=places&v=weekly';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-maps-loader', 'hairlux-booking');
      script.onload = function () {
        if (window.google && window.google.maps && window.google.maps.places) {
          resolve();
          return;
        }
        reject(new Error('Google Maps loaded, but Places library is unavailable.'));
      };
      script.onerror = function () {
        reject(new Error('Unable to load Google Maps. Check key restrictions and billing setup.'));
      };
      document.head.appendChild(script);
    });

    return mapsLoaderPromise;
  }

  function geocodeBookingAddressText(addressText, keepManualInput) {
    return new Promise(function (resolve, reject) {
      if (!bookingMapGeocoder) {
        reject(new Error('Geocoder is not initialized yet.'));
        return;
      }

      bookingMapGeocoder.geocode({ address: addressText }, function (results, status) {
        if (status !== 'OK' || !results || !results.length) {
          reject(new Error('Could not locate this address on the map.'));
          return;
        }
        const topResult = results[0];
        applyBookingGeocodeResult(topResult, keepManualInput);
        resolve(topResult);
      });
    });
  }

  function reverseGeocodeBookingLatLng(latLng) {
    return new Promise(function (resolve, reject) {
      if (!bookingMapGeocoder) {
        reject(new Error('Geocoder is not initialized yet.'));
        return;
      }

      bookingMapGeocoder.geocode({ location: latLng }, function (results, status) {
        if (status !== 'OK' || !results || !results.length) {
          reject(new Error('Could not resolve this map position to an address.'));
          return;
        }
        const topResult = results[0];
        applyBookingGeocodeResult(topResult, false);
        resolve(topResult);
      });
    });
  }

  function requestBookingAddressPredictions(inputValue) {
    const query = String(inputValue || '').trim();
    if (!query || query.length < 3) {
      clearBookingAddressSuggestions();
      return;
    }

    if (!bookingAutocompleteService || !window.google || !window.google.maps || !window.google.maps.places) {
      clearBookingAddressSuggestions();
      return;
    }

    bookingAutocompleteService.getPlacePredictions({
      input: query,
      types: ['geocode']
    }, function (predictions, status) {
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions || !predictions.length) {
        clearBookingAddressSuggestions();
        return;
      }
      renderBookingAddressSuggestions(predictions.slice(0, 6));
    });
  }

  function selectBookingAddressPrediction(placeId, fallbackDescription) {
    return new Promise(function (resolve, reject) {
      if (!bookingPlacesService) {
        reject(new Error('Places service is not initialized yet.'));
        return;
      }

      bookingPlacesService.getDetails({
        placeId: placeId,
        fields: ['address_components', 'formatted_address', 'geometry', 'place_id']
      }, function (place, status) {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place || !place.geometry || !place.geometry.location) {
          reject(new Error('Unable to load details for this address suggestion.'));
          return;
        }

        applyBookingGeocodeResult({
          place_id: place.place_id,
          formatted_address: place.formatted_address || fallbackDescription || '',
          address_components: place.address_components,
          geometry: place.geometry
        }, false);
        clearBookingAddressSuggestions();
        setBookingMapStatus('Address selected. You can drag the pin to refine it.', 'success');
        refreshSummary();
        resolve(place);
      });
    });
  }

  async function ensureBookingMapReady() {
    if (!bookingAddressMapEl) return;
    if (!bookingMapInstance) {
      await loadGoogleMapsScript();

      bookingMapGeocoder = new window.google.maps.Geocoder();
      bookingAutocompleteService = new window.google.maps.places.AutocompleteService();
      bookingPlacesService = new window.google.maps.places.PlacesService(document.createElement('div'));

      bookingMapInstance = new window.google.maps.Map(bookingAddressMapEl, {
        center: defaultMapCenter,
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      bookingMapMarker = new window.google.maps.Marker({
        position: defaultMapCenter,
        map: bookingMapInstance,
        draggable: true
      });

      bookingMapMarker.addListener('dragend', function () {
        const position = bookingMapMarker.getPosition();
        const latLng = toLatLngLiteral(position);
        if (!latLng) return;
        reverseGeocodeBookingLatLng(latLng)
          .then(function () {
            setBookingMapStatus('Pin moved. Address updated.', 'success');
            refreshSummary();
          })
          .catch(function (error) {
            setBookingMapStatus((error && error.message) || 'Could not resolve the map pin location.', 'error');
          });
      });

      bookingMapInstance.addListener('click', function (event) {
        if (!event || !event.latLng || !bookingMapMarker) return;
        bookingMapMarker.setPosition(event.latLng);
        reverseGeocodeBookingLatLng(event.latLng)
          .then(function () {
            setBookingMapStatus('Address updated from map click.', 'success');
            refreshSummary();
          })
          .catch(function (error) {
            setBookingMapStatus((error && error.message) || 'Could not resolve the selected location.', 'error');
          });
      });

      setBookingMapStatus('Search an address to place your booking pin.', '');
    }

    if (window.google && window.google.maps && bookingMapInstance) {
      window.google.maps.event.trigger(bookingMapInstance, 'resize');
      const currentMarker = bookingMapMarker && bookingMapMarker.getPosition();
      bookingMapInstance.panTo(currentMarker || defaultMapCenter);
    }
  }

  function getOneTimeAddress() {
    if (savedAddressEl.value !== '__add_new__') return null;
    const fullAddress = (newFullAddress && newFullAddress.value ? newFullAddress.value : '').trim();
    if (!fullAddress) return null;

    return {
      id: '',
      label: 'One-time address',
      fullAddress: fullAddress,
      streetAddress: (newStreetAddress && newStreetAddress.value ? newStreetAddress.value : '').trim(),
      city: (newCity && newCity.value ? newCity.value : '').trim(),
      state: (newState && newState.value ? newState.value : '').trim(),
      country: (newCountry && newCountry.value ? newCountry.value : 'Nigeria').trim() || 'Nigeria',
      placeId: (newPlaceId && newPlaceId.value ? newPlaceId.value : '').trim(),
      isOneTime: true
    };
  }

  async function ensureOneTimeAddressMetadata() {
    if (!newFullAddress || !newFullAddress.value.trim()) return;
    if (newPlaceId && newPlaceId.value.trim()) return;

    try {
      await ensureBookingMapReady();
      await geocodeBookingAddressText(newFullAddress.value.trim(), true);
    } catch (_) {
      // Continue with manual full address when geocoding is unavailable.
    }
  }

  function buildOneTimeAddressPayload() {
    const oneTime = getOneTimeAddress();
    if (!oneTime) return null;

    const components = {
      streetAddress: oneTime.streetAddress || undefined,
      city: oneTime.city || undefined,
      state: oneTime.state || undefined,
      country: oneTime.country || 'Nigeria'
    };

    Object.keys(components).forEach(function (key) {
      if (!components[key]) delete components[key];
    });

    return {
      label: 'New Address',
      fullAddress: oneTime.fullAddress,
      streetAddress: oneTime.streetAddress || undefined,
      city: oneTime.city || undefined,
      state: oneTime.state || undefined,
      country: oneTime.country || 'Nigeria',
      placeId: oneTime.placeId || undefined,
      addressComponents: Object.keys(components).length ? components : undefined,
      isDefault: false
    };
  }

  function upsertSavedAddressOption(address) {
    if (!address || !address.id) return;

    let option = null;
    for (let i = 0; i < savedAddressEl.options.length; i += 1) {
      if (savedAddressEl.options[i].value === address.id) {
        option = savedAddressEl.options[i];
        break;
      }
    }

    if (!option) {
      option = document.createElement('option');
      option.value = address.id;
      const addNewOption = savedAddressEl.querySelector('option[value="__add_new__"]');
      if (addNewOption) {
        savedAddressEl.insertBefore(option, addNewOption);
      } else {
        savedAddressEl.appendChild(option);
      }
    }

    option.textContent = address.label
      ? address.label + ' — ' + (address.fullAddress || '')
      : (address.fullAddress || 'Saved address');
    option.dataset.label = address.label || '';
    option.dataset.fullAddress = address.fullAddress || '';
    option.dataset.streetAddress = address.streetAddress || '';
    option.dataset.city = address.city || '';
    option.dataset.state = address.state || '';
    option.dataset.country = address.country || 'Nigeria';
    option.dataset.placeId = address.placeId || '';
  }

  async function persistOneTimeAddress(opts) {
    const options = opts || {};
    const payload = buildOneTimeAddressPayload();
    if (!payload) {
      throw new Error('Please enter a valid address before saving.');
    }

    const created = await BookingAPI.createAddress(payload);
    if (!created || !created.id) {
      throw new Error('Address was not saved correctly. Please try again.');
    }

    upsertSavedAddressOption(created);
    savedAddressEl.value = created.id;
    addAddressWrap.style.display = 'none';
    clearBookingAddressSuggestions();
    setBookingMapStatus('Address saved and selected for booking.', 'success');
    refreshSummary();

    if (!options.silentToast) {
      showToast('Address saved successfully.', 'success', 2200);
    }

    return created;
  }

  function getSelectedAddress() {
    const value = savedAddressEl.value;
    if (!value) return null;
    if (value === '__add_new__') return getOneTimeAddress();
    const option = savedAddressEl.options[savedAddressEl.selectedIndex];
    const fullAddress = option.dataset.fullAddress || option.textContent || '';
    return {
      id: value,
      label: option.dataset.label || '',
      fullAddress: fullAddress.trim(),
      streetAddress: (option.dataset.streetAddress || '').trim(),
      city: (option.dataset.city || '').trim(),
      state: (option.dataset.state || '').trim(),
      country: (option.dataset.country || 'Nigeria').trim(),
      placeId: (option.dataset.placeId || '').trim()
    };
  }

  function refreshSummary() {
    const services = getSelectedServices();
    const address  = getSelectedAddress();
    const serviceLabel = services.length > 1
      ? `${services.length} services`
      : (services[0] ? services[0].name : '-');
    const btLabel = bookingType === 'HOME_SERVICE' ? '🏠 Mobile Serivice' : '🏪 Walk-In (Store)';
    const addrLabel = bookingType === 'HOME_SERVICE'
      ? (address ? escHtml(address.fullAddress || address.streetAddress || '-') : '-')
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
          <span class="review-svc-price">${formatMoney(getServicePriceForType(svc))}</span>
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
      ? (address ? escHtml(address.fullAddress || address.streetAddress || '-') : '-')
      : '<span class="btype-badge walkin">🏪 Walk-In at salon</span>';
    const btBadge   = isHomeService
      ? '<span class="btype-badge home">🏠 Mobile Serivice</span>'
      : '<span class="btype-badge walkin">🏪 Walk-In (Store)</span>';
    const gEmail   = guestEmailEl ? guestEmailEl.value.trim() : '';
    const guestVal  = bookingForSelf
      ? 'Myself'
      : (gName ? `${escHtml(gName)}${gPhone ? ' &middot; ' + escHtml(gPhone) : ''}${gEmail ? '<br><span style="font-size:11px;color:var(--muted);font-weight:400;">' + escHtml(gEmail) + '</span>' : ''}` : '—');
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

    const nextBtnLabel = nextStepBtn.querySelector('div');
    if (nextBtnLabel) {
      nextBtnLabel.textContent = step === 3 ? 'Create Booking' : 'Continue';
    }

    if (step === 3) {
      const agreeCheckbox = document.getElementById('agreeTerms');
      const isAgreed = agreeCheckbox && agreeCheckbox.checked;
      nextStepBtn.style.pointerEvents = isAgreed ? 'auto' : 'none';
      nextStepBtn.style.opacity       = isAgreed ? '1' : '0.5';
      buildReview();
    } else {
      nextStepBtn.style.pointerEvents = 'auto';
      nextStepBtn.style.opacity       = '1';
    }
  }

  function validateStep(currentStep) {
    if (currentStep === 1) {
      const hasServices = getSelectedServices().length > 0;
      const hasValidMode = bookingTypeCapabilities.home || bookingTypeCapabilities.walk;
      return hasServices && hasValidMode;
    }
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
  function getAmountDueForPendingBooking() {
    const fallback = getDiscountedTotal();
    const amount = Number(pendingBookingAmountDue || fallback || 0);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  }

  function buildGatewayBookingPayload() {
    const source = pendingBookingPayload || {};
    const bookingPayload = {
      services: Array.isArray(source.services) ? source.services : [],
      date: source.date,
      time: source.time,
      bookingType: source.bookingType,
      addressId: source.addressId,
      guestName: source.guestName,
      guestPhone: source.guestPhone,
      guestEmail: source.guestEmail,
      discountCode: source.discountCode
    };

    Object.keys(bookingPayload).forEach(function (key) {
      if (bookingPayload[key] == null || bookingPayload[key] === '') {
        delete bookingPayload[key];
      }
    });

    return bookingPayload;
  }

  function showBookingSuccessModal(result, fallbackAmount) {
    const booking = (result && result.booking) || {};
    const reservationCode = (result && result.reservationCode) || booking.reservationCode || booking.id || '-';
    const bookingDate = (booking.bookingDate || bookingDateEl.value || '').split('T')[0];
    const bookingTime = booking.bookingTime || bookingTimeEl.value || '-';
    const amountPaid = Number(
      (result && result.totalAmount) ||
      booking.totalAmount ||
      fallbackAmount ||
      getAmountDueForPendingBooking() ||
      getTotalPrice()
    );

    paidModalBookingId.textContent = reservationCode;
    paidModalService.textContent   = getServiceNames();
    paidModalDateTime.textContent  = `${bookingDate} at ${bookingTime}`;
    paidModalAmount.textContent    = formatMoney(amountPaid);
    openPaidModal();

    sessionStorage.removeItem('selectedServices');
    clearGatewayPendingState();
    pendingBookingPayload = null;
    pendingBookingAmountDue = 0;
    bookingPaymentReference = '';
  }

  function updateConfirmModalUI() {
    const baseTotal     = getTotalPrice();
    const total         = getAmountDueForPendingBooking();
    const isHomeService = bookingType === 'HOME_SERVICE';
    const addr          = getSelectedAddress();
    const gName         = guestNameEl && guestNameEl.value.trim();
    const gPhone        = guestPhoneEl && guestPhoneEl.value.trim();
    const gEmail        = guestEmailEl && guestEmailEl.value.trim();

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
      ? '<span class="btype-badge home">🏠 Mobile Serivice</span>'
      : '<span class="btype-badge walkin">🏪 Walk-In (Store)</span>';

    // Address row
    if (isHomeService) {
      modalAddressRow.style.display = '';
      modalAddress.textContent = addr ? (addr.fullAddress || addr.streetAddress || '-') : '-';
    } else {
      modalAddressRow.style.display = 'none';
    }

    // Guest row
    if (!bookingForSelf && gName) {
      modalGuestRow.style.display = '';
      modalGuest.textContent = gName + (gPhone ? ` · ${gPhone}` : '') + (gEmail ? ` · ${gEmail}` : '');
    } else {
      modalGuestRow.style.display = 'none';
    }

    // WALLET — check balance
    const lowBalance = walletBalance < total;
    modalSubtext.textContent = 'Your wallet will be charged immediately upon confirmation.';
    modalWalletRow.style.display   = '';
    modalStatusRow.style.display   = '';
    modalWalletBalance.textContent = formatMoney(walletBalance);

    const makePaymentLabel = makePaymentBtn && makePaymentBtn.querySelector('div');
    if (lowBalance) {
      modalSubtext.textContent = 'Complete payment directly with Monnify and we will finalize your booking automatically.';
      modalStatus.textContent = `Wallet balance is low — pay ${formatMoney(total)} with Monnify for this booking.`;
      modalStatus.style.color = '#dc3545';
      if (makePaymentLabel) {
        makePaymentLabel.textContent = 'Pay with Monnify';
        makePaymentBtn.dataset.originalLabel = 'Pay with Monnify';
      }
      makePaymentBtn.style.pointerEvents = '';
      makePaymentBtn.style.opacity = '';
      if (payLaterBtn) payLaterBtn.style.display = 'none';
    } else {
      modalSubtext.textContent = 'Your wallet will be charged immediately upon confirmation.';
      modalStatus.textContent = 'Balance sufficient — ready to book.';
      modalStatus.style.color = '#1f7a3f';
      if (makePaymentLabel) {
        makePaymentLabel.textContent = 'Confirm & Book';
        makePaymentBtn.dataset.originalLabel = 'Confirm & Book';
      }
      makePaymentBtn.style.pointerEvents = '';
      makePaymentBtn.style.opacity = '';
      if (payLaterBtn) payLaterBtn.style.display = 'none';
    }

  }

  // Show confirmation modal BEFORE calling the API
  async function prepareConfirmModal() {
    let address = getSelectedAddress();
    const bType   = getBookingType();
    const bMethod = getPaymentMethod();
    const gName   = guestNameEl  ? guestNameEl.value.trim()  : '';
    const gPhone  = guestPhoneEl ? guestPhoneEl.value.trim() : '';

    if (bType === 'HOME_SERVICE') {
      if (!address) {
        throw new Error('Please provide a delivery address before continuing.');
      }

      if (!address.id) {
        await ensureOneTimeAddressMetadata();
        address = await persistOneTimeAddress({ silentToast: true });
      }

      if (!address || !address.id) {
        throw new Error('Address must be saved before booking. Please try again.');
      }
    }

    const payload = {
      services:      getSelectedServices().map(s => ({ serviceId: s.id })),
      date:          bookingDateEl.value,
      time:          bookingTimeEl.value,
      bookingType:   bType,
      guestName:     gName  || undefined,
      guestPhone:    gPhone || undefined,
      guestEmail:    guestEmailEl ? (guestEmailEl.value.trim() || undefined) : undefined,
      paymentMethod: bMethod,
      notes:         notesEl.value.trim() || undefined,
      discountCode:  discountInfo ? discountInfo.code : undefined
    };

    if (bType === 'HOME_SERVICE' && address && address.id) {
      payload.addressId = address.id;
    }

    pendingBookingPayload = payload;
    pendingBookingAmountDue = getDiscountedTotal();
    bookingPaymentReference = '';
    bookingPaymentProvider = BOOKING_GATEWAY_PROVIDER;

    // Only fetch wallet balance when paying with WALLET
    walletBalance = bMethod === 'WALLET' ? await BookingAPI.getWalletBalance() : 0;
    updateConfirmModalUI();
    openPayModal();
  }

  async function submitBookingRequest() {
    const result  = await BookingAPI.create(pendingBookingPayload);
    showBookingSuccessModal(result, getAmountDueForPendingBooking());
  }

  async function startGatewayCheckoutForBooking(amountDue) {
    const total = Number(amountDue || getAmountDueForPendingBooking() || 0);
    const paymentAmount = Math.max(1, Math.ceil(total));

    if (!BookingAPI || typeof BookingAPI.initializeBookingPayment !== 'function') {
      showToast('Booking payment is currently unavailable. Please try again later.', 'error');
      return false;
    }

    setButtonState(makePaymentBtn, 'Redirecting…', true);
    try {
      const idempotencyKey = createBookingPaymentIdempotencyKey();
      const initResult = await BookingAPI.initializeBookingPayment({
        bookingPayload: buildGatewayBookingPayload(),
        amount: paymentAmount,
        provider: BOOKING_GATEWAY_PROVIDER,
        idempotencyKey: idempotencyKey
      });

      bookingPaymentReference = initResult.bookingPaymentReference || '';
      bookingPaymentProvider = normalizeGatewayProvider(initResult.provider || BOOKING_GATEWAY_PROVIDER);

      saveGatewayPendingState({
        bookingPaymentReference: bookingPaymentReference,
        provider: bookingPaymentProvider,
        amountDue: total,
        idempotencyKey: idempotencyKey,
        createdAt: Date.now()
      });

      window.location.href = initResult.checkoutUrl || initResult.paymentUrl;
      return true;
    } catch (error) {
      const msg = (error && error.message) || 'Could not start Monnify checkout. Please try again.';
      showToast(msg, 'error');
      updateConfirmModalUI();
      return false;
    } finally {
      setButtonState(makePaymentBtn, 'Redirecting…', false);
    }
  }

  async function finalizeGatewayBookingAfterReturn() {
    const pendingState = readGatewayPendingState();
    const query = new URLSearchParams(window.location.search);
    const status = (
      query.get('status') ||
      query.get('paymentStatus') ||
      query.get('payment_status') ||
      query.get('transactionStatus') ||
      ''
    ).toLowerCase();
    const paymentReference =
      query.get('bookingPaymentReference') ||
      query.get('booking_payment_reference') ||
      query.get('paymentReference') ||
      query.get('reference') ||
      query.get('trxref') ||
      (pendingState && pendingState.bookingPaymentReference) ||
      '';
    const provider = normalizeGatewayProvider(
      query.get('provider') ||
      query.get('paymentProvider') ||
      (pendingState && pendingState.provider) ||
      BOOKING_GATEWAY_PROVIDER
    );

    const hasCallbackSignal = Boolean(
      pendingState ||
      paymentReference ||
      status ||
      query.get('paymentStatus') ||
      query.get('payment_status')
    );

    if (!hasCallbackSignal) return;

    if (status && isFailedGatewayStatus(status)) {
      cleanGatewayCallbackQuery();
      clearGatewayPendingState();
      showToast('Payment was not completed. Please try again.', 'info');
      return;
    }

    cleanGatewayCallbackQuery();

    if (!paymentReference) {
      clearGatewayPendingState();
      showToast('Booking payment reference is missing. Please contact support.', 'error');
      return;
    }

    bookingPaymentReference = paymentReference;
    bookingPaymentProvider = normalizeGatewayProvider((pendingState && pendingState.provider) || provider);
    pendingBookingAmountDue = Number((pendingState && pendingState.amountDue) || pendingBookingAmountDue || 0);

    let verifiedResult = null;
    try {
      verifiedResult = await BookingAPI.verifyBookingPayment(bookingPaymentReference, bookingPaymentProvider);
    } catch (verifyError) {
      try {
        const statusResult = await BookingAPI.getBookingPaymentStatus(bookingPaymentReference);
        const paymentStatus = String(statusResult.status || '').toUpperCase();

        if (paymentStatus === 'COMPLETED' && statusResult.booking && statusResult.booking.id) {
          verifiedResult = {
            booking: statusResult.booking,
            reservationCode: statusResult.reservationCode || (statusResult.booking && statusResult.booking.reservationCode) || '',
            totalAmount: Number(statusResult.amount || (statusResult.booking && statusResult.booking.totalAmount) || 0),
            message: 'Booking payment verified and booking created.'
          };
        } else if (paymentStatus === 'PENDING') {
          showToast('Payment is still pending. Please wait a moment and try again.', 'info', 4200);
          return;
        } else if (paymentStatus === 'FAILED') {
          clearGatewayPendingState();
          showToast('Payment failed. Please start again.', 'error');
          return;
        } else {
          throw verifyError;
        }
      } catch (statusError) {
        const msg = (verifyError && verifyError.message) || (statusError && statusError.message) || 'Could not verify booking payment.';
        showToast(msg, 'error', 5000);
        return;
      }
    }

    if (!verifiedResult || !verifiedResult.booking || !verifiedResult.booking.id) {
      showToast('Payment verified but booking details were not returned. Please contact support.', 'error', 5000);
      return;
    }

    showToast((verifiedResult && verifiedResult.message) || 'Payment successful. Booking confirmed.', 'success', 1800);
    showBookingSuccessModal(verifiedResult, getAmountDueForPendingBooking());
  }

  // Called when user clicks "Confirm & Book" / "Reserve Slot" in the modal
  async function createAndPayBooking() {
    if (!pendingBookingPayload) {
      showToast('Missing booking details. Please try again.', 'error');
      return;
    }
    const total = getAmountDueForPendingBooking();
    if (walletBalance < total) {
      await startGatewayCheckoutForBooking(total);
      return;
    }

    setButtonState(makePaymentBtn, 'Booking…', true);
    try {
      await submitBookingRequest();
    } catch (error) {
      const msg = (error && error.message) || 'Booking failed. Please try again.';
      if (/insufficient balance/i.test(msg)) {
        try {
          walletBalance = await BookingAPI.getWalletBalance();
        } catch (_) {
          // Keep previous balance when refresh fails.
        }
        await startGatewayCheckoutForBooking(total);
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
      if (err && err.status === 401) {
        statusEl.textContent = 'The code cannot be used as it is yours (influencers cannot use their code).';
      } else {
        statusEl.textContent = (err && err.message) || 'Invalid or expired discount code.';
      }
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

  // Booking-type cards (Mobile Serivice / Walk-In)
  [homeServiceCard, walkInCard].forEach(card => {
    if (!card) return;
    card.addEventListener('click', function () {
      const nextType = this === homeServiceCard ? 'HOME_SERVICE' : 'WALK_IN';
      const canChoose = bookingTypeCapabilities.home && bookingTypeCapabilities.walk;
      if (!canChoose) return;
      if (nextType === 'HOME_SERVICE' && !bookingTypeCapabilities.home) return;
      if (nextType === 'WALK_IN' && !bookingTypeCapabilities.walk) return;

      bookingType = nextType;
      selectOptionCard([homeServiceCard, walkInCard], this);
      const isHome = bookingType === 'HOME_SERVICE';
      if (addressSection) addressSection.classList.toggle('visible', isHome);
      if (!isHome) {
        addAddressWrap.style.display = 'none';
        savedAddressEl.value = '';
      }
      hydrateSelectedServiceUI();
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
    const isOneTimeAddress = this.value === '__add_new__';
    addAddressWrap.style.display = isOneTimeAddress ? 'block' : 'none';
    if (isOneTimeAddress) {
      ensureBookingMapReady().catch(function (error) {
        setBookingMapStatus((error && error.message) || 'Unable to load Google Maps.', 'error');
      });
    }
    if (!isOneTimeAddress) clearBookingAddressSuggestions();
    refreshSummary();
  });

  saveAddressBtn.addEventListener('click', async function (e) {
    e.preventDefault();
    if (!newFullAddress.value.trim()) {
      showToast('Please enter the full address.', 'error');
      return;
    }

    setButtonState(saveAddressBtn, 'Saving\u2026', true);
    try {
      await ensureOneTimeAddressMetadata();
      await persistOneTimeAddress();
    } catch (err) {
      const msg = (err && err.message) || 'Could not save this address. Please try again.';
      setBookingMapStatus(msg, 'error');
      showToast(msg, 'error');
    } finally {
      setButtonState(saveAddressBtn, 'Saving\u2026', false);
    }
  });

  if (newFullAddress) {
    newFullAddress.addEventListener('focus', function () {
      if (savedAddressEl.value === '__add_new__') {
        ensureBookingMapReady().then(function () {
          requestBookingAddressPredictions(newFullAddress.value);
        }).catch(function () {
          // Map initialization error is shown elsewhere.
        });
      }
    });

    newFullAddress.addEventListener('input', function () {
      syncOneTimeAddressFields({
        placeId: '',
        streetAddress: '',
        city: '',
        state: '',
        country: (newCountry && newCountry.value ? newCountry.value : 'Nigeria') || 'Nigeria'
      });

      if (bookingPredictionDebounceTimer) {
        window.clearTimeout(bookingPredictionDebounceTimer);
      }

      bookingPredictionDebounceTimer = window.setTimeout(function () {
        requestBookingAddressPredictions(newFullAddress.value);
      }, 250);

      refreshSummary();
    });

    newFullAddress.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') event.preventDefault();
    });
  }

  if (newAddressSuggestions) {
    newAddressSuggestions.addEventListener('click', function (event) {
      const target = event.target.closest('.address-suggestion-item');
      if (!target) return;

      event.preventDefault();
      const placeId = target.getAttribute('data-place-id') || '';
      const description = target.getAttribute('data-description') || '';
      if (!placeId) return;

      ensureBookingMapReady()
        .then(function () { return selectBookingAddressPrediction(placeId, description); })
        .catch(function (error) {
          const msg = (error && error.message) || 'Unable to apply this suggestion.';
          setBookingMapStatus(msg, 'error');
          showToast(msg, 'error');
        });
    });
  }

  document.addEventListener('click', function (event) {
    if (!newAddressSuggestions || !newFullAddress) return;
    if (newAddressSuggestions.contains(event.target) || event.target === newFullAddress) return;
    clearBookingAddressSuggestions();
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
          ? addr.label + ' \u2014 ' + addr.fullAddress
          : addr.fullAddress;
        opt.dataset.label = addr.label || '';
        opt.dataset.fullAddress = addr.fullAddress || '';
        opt.dataset.streetAddress = addr.streetAddress || '';
        opt.dataset.city  = addr.city  || '';
        opt.dataset.state = addr.state || '';
        opt.dataset.country = addr.country || 'Nigeria';
        opt.dataset.placeId = addr.placeId || '';
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

  // ── Terms Logic ──────────────────────────────────────────────────
  const agreeCheckbox = document.getElementById('agreeTerms');
  const termsLink     = document.getElementById('termsLink');
  const termsModal    = document.getElementById('termsModal');
  const closeTermsBtn = document.getElementById('closeTermsModal');

  if (agreeCheckbox) {
    agreeCheckbox.checked = false;
    agreeCheckbox.addEventListener('change', function() {
      if (step === 3) {
        nextStepBtn.style.pointerEvents = this.checked ? 'auto' : 'none';
        nextStepBtn.style.opacity       = this.checked ? '1' : '0.5';
      }
    });
  }

  if (termsLink && termsModal) {
    termsLink.addEventListener('click', function(e) {
      e.preventDefault();
      termsModal.classList.add('show');
    });
    termsModal.addEventListener('click', function(e) {
      if (e.target === termsModal) termsModal.classList.remove('show');
    });
  }

  if (closeTermsBtn && termsModal) {
    closeTermsBtn.addEventListener('click', function(e) {
      e.preventDefault();
      termsModal.classList.remove('show');
    });
  }

  // ── Init ──────────────────────────────────────────────────────────
  (async function initBookingPage() {
    await hydrateSelectedServicesPricing();
    applyBookingTypeAvailability();
    hydrateSelectedServiceUI();
    refreshSummary();
    setStep(1);
    await loadAddresses();
    await finalizeGatewayBookingAfterReturn();
  })();
})();
