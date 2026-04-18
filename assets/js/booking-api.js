/**
 * booking-api.js
 * Thin wrappers around APIHelper.request() for the bookings domain.
 * Depends on: config.js, auth-api.js (APIHelper)
 */
var BookingAPI = (function () {

  function firstNonEmpty(values, fallback) {
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value == null) continue;
      var txt = String(value).trim();
      if (txt) return txt;
    }
    return fallback;
  }

  function normalizeAddress(data) {
    data = data || {};
    var fullAddress = firstNonEmpty([
      data.fullAddress,
      data.formattedAddress,
      data.address
    ], '');

    return {
      id:            data.id || '',
      label:         firstNonEmpty([data.label], ''),
      fullAddress:   fullAddress,
      streetAddress: firstNonEmpty([data.streetAddress], ''),
      city:          firstNonEmpty([data.city], ''),
      state:         firstNonEmpty([data.state], ''),
      country:       firstNonEmpty([data.country], 'Nigeria'),
      placeId:       firstNonEmpty([data.placeId, data.place_id], ''),
      addressComponents: data.addressComponents && typeof data.addressComponents === 'object'
        ? data.addressComponents
        : undefined,
      isDefault:     Boolean(data.isDefault)
    };
  }

  /**
   * Create and pay for one or more services in a single appointment.
   * POST /bookings
   * All services are booked under ONE record with a single reservation code.
   * WALLET payment deducts the full total immediately;
   * CASH reserves the slot (payment collected on the day).
   *
   * @param {Object}   payload
   * @param {Array<{serviceId:string}>} payload.services      - Services to book
   * @param {string}   payload.date                          - Date (YYYY-MM-DD)
   * @param {string}   payload.time                          - Time (HH:mm)
   * @param {string}   payload.bookingType                    - 'HOME_SERVICE' | 'WALK_IN'
   * @param {string}   [payload.addressId]                    - Required for HOME_SERVICE
   * @param {string}   [payload.guestName]                    - Name of person being booked for (optional)
   * @param {string}   [payload.guestPhone]                   - Phone of guest (optional)
   * @param {string}   [payload.paymentMethod]                - 'WALLET' (default) | 'CASH'
   * @param {string}   [payload.notes]                        - Optional notes
   * @param {string}   [payload.discountCode]                 - Optional discount code
   * @returns {Promise<{ booking: Object, reservationCode: string, totalAmount: number, paymentMethod: string, message: string }>}
   */
  async function create(payload) {
    var response = await APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    // Response shape: { success, message, data: { booking: {...}, reservationCode, totalAmount, paymentMethod, message } }
    var data = (response && response.data) || {};
    return {
      booking:         data.booking         || {},
      reservationCode: data.reservationCode || (data.booking && data.booking.reservationCode) || '',
      totalAmount:     Number(data.totalAmount || (data.booking && data.booking.totalAmount) || 0),
      paymentMethod:   data.paymentMethod   || 'WALLET',
      message:         data.message        || (response && response.message) || 'Booking confirmed.'
    };
  }

  function bookingPaymentsEndpoints() {
    var defaults = {
      BASE: '/bookings/payments',
      INITIALIZE: '/bookings/payments/initialize',
      VERIFY: '/bookings/payments/verify'
    };

    var source = API_CONFIG && API_CONFIG.ENDPOINTS && API_CONFIG.ENDPOINTS.BOOKING_PAYMENTS
      ? API_CONFIG.ENDPOINTS.BOOKING_PAYMENTS
      : {};

    return {
      BASE: firstNonEmpty([source.BASE], defaults.BASE),
      INITIALIZE: firstNonEmpty([source.INITIALIZE], defaults.INITIALIZE),
      VERIFY: firstNonEmpty([source.VERIFY], defaults.VERIFY)
    };
  }

  /**
   * Initialize a booking payment intent.
   * POST /bookings/payments/initialize
   *
   * @param {{ bookingPayload: Object, amount: number, provider?: string, idempotencyKey: string }} payload
   * @returns {Promise<{ paymentUrl: string, checkoutUrl: string, bookingPaymentReference: string, gatewayReference: string, expiresAt: string, provider: string, raw: Object }>}
   */
  async function initializeBookingPayment(payload) {
    var endpoints = bookingPaymentsEndpoints();
    var response = await APIHelper.request(endpoints.INITIALIZE, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });

    var data = (response && response.data) || {};
    var paymentUrl = firstNonEmpty([
      data.checkoutUrl,
      data.checkout_url,
      data.paymentUrl,
      data.url
    ], '');
    var bookingPaymentReference = firstNonEmpty([
      data.bookingPaymentReference,
      data.booking_payment_reference,
      data.paymentReference,
      data.reference
    ], '');

    if (!paymentUrl) {
      throw new Error('Could not start booking payment. Checkout URL was not returned.');
    }
    if (!bookingPaymentReference) {
      throw new Error('Could not start booking payment. Reference was not returned.');
    }

    return {
      paymentUrl: paymentUrl,
      checkoutUrl: firstNonEmpty([data.checkoutUrl, data.paymentUrl], paymentUrl),
      bookingPaymentReference: bookingPaymentReference,
      gatewayReference: firstNonEmpty([data.gatewayReference], ''),
      expiresAt: firstNonEmpty([data.expiresAt], ''),
      provider: firstNonEmpty([data.provider, payload && payload.provider], 'monnify'),
      raw: response
    };
  }

  /**
   * Verify a booking payment and create booking if paid.
   * POST /bookings/payments/verify
   *
   * @param {string} bookingPaymentReference
   * @param {string} provider
   * @returns {Promise<{ booking: Object, reservationCode: string, totalAmount: number, message: string, raw: Object }>}
   */
  async function verifyBookingPayment(bookingPaymentReference, provider) {
    if (!bookingPaymentReference) {
      throw new Error('Missing booking payment reference for verification.');
    }

    var endpoints = bookingPaymentsEndpoints();
    var response = await APIHelper.request(endpoints.VERIFY, {
      method: 'POST',
      body: JSON.stringify({
        bookingPaymentReference: bookingPaymentReference,
        provider: provider || 'monnify'
      })
    });

    var data = (response && response.data) || {};
    return {
      booking: data.booking || {},
      reservationCode: firstNonEmpty([data.reservationCode, data.booking && data.booking.reservationCode], ''),
      totalAmount: Number(data.totalAmount || (data.booking && data.booking.totalAmount) || 0),
      message: firstNonEmpty([data.message, response && response.message], 'Booking payment verified successfully.'),
      raw: response
    };
  }

  /**
   * Get booking payment status for recovery/polling.
   * GET /bookings/payments/:bookingPaymentReference
   *
   * @param {string} bookingPaymentReference
   * @returns {Promise<{ bookingPaymentReference: string, provider: string, status: string, amount: number, gatewayReference: string, paymentReference: string, expiresAt: string, booking: Object, reservationCode: string, raw: Object }>}
   */
  async function getBookingPaymentStatus(bookingPaymentReference) {
    if (!bookingPaymentReference) {
      throw new Error('Missing booking payment reference for status lookup.');
    }

    var endpoints = bookingPaymentsEndpoints();
    var response = await APIHelper.request(
      endpoints.BASE + '/' + encodeURIComponent(bookingPaymentReference),
      { method: 'GET' }
    );

    var data = (response && response.data) || {};
    var booking = data.booking || {};
    return {
      bookingPaymentReference: firstNonEmpty([
        data.bookingPaymentReference,
        data.paymentReference,
        bookingPaymentReference
      ], bookingPaymentReference),
      provider: firstNonEmpty([data.provider], 'monnify'),
      status: firstNonEmpty([data.status], ''),
      amount: Number(data.amount || booking.totalAmount || 0),
      gatewayReference: firstNonEmpty([data.gatewayReference], ''),
      paymentReference: firstNonEmpty([data.paymentReference], ''),
      expiresAt: firstNonEmpty([data.expiresAt], ''),
      booking: booking,
      reservationCode: firstNonEmpty([booking.reservationCode], ''),
      raw: response
    };
  }

  /**
   * Fetch the authenticated user's wallet balance.
   * GET /wallet/balance
   * @returns {Promise<number>}
   */
  async function getWalletBalance() {
    var response = await APIHelper.request(API_CONFIG.ENDPOINTS.WALLET + '/balance', {
      method: 'GET'
    });
    var data = (response && response.data) || response || {};
    var balance = Number(
      data.balance !== undefined ? data.balance :
      data.walletBalance !== undefined ? data.walletBalance :
      data.availableBalance !== undefined ? data.availableBalance : 0
    );
    return Number.isFinite(balance) ? balance : 0;
  }

  /**
   * Fetch all saved addresses for the authenticated user.
   * GET /user/addresses
   * @returns {Promise<Object[]>}
   */
  async function getAddresses() {
    var response = await APIHelper.request(API_CONFIG.ENDPOINTS.USER.ADDRESSES, { method: 'GET' });
    var list = Array.isArray(response && response.data) ? response.data : [];
    return list.map(normalizeAddress);
  }

  /**
   * Create a new address for the authenticated user.
   * POST /user/addresses
   * @param {Object} payload
   * @returns {Promise<Object>} The created address object (with real UUID id)
   */
  async function createAddress(payload) {
    var response = await APIHelper.request(API_CONFIG.ENDPOINTS.USER.ADDRESSES, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    var data = (response && response.data) || response || {};
    return normalizeAddress(data);
  }

  /**
   * Reschedule an existing booking.
   * PUT /bookings/{id}
   * @param {string} id - Booking ID
   * @param {{ date: string, time: string }} payload
   * @returns {Promise<Object>}
   */
  async function reschedule(id, payload) {
    var response = await APIHelper.request(
      API_CONFIG.ENDPOINTS.BOOKINGS + '/' + encodeURIComponent(id),
      { method: 'PUT', body: JSON.stringify(payload) }
    );
    return (response && response.data) || response || {};
  }

  return {
    create: create,
    initializeBookingPayment: initializeBookingPayment,
    verifyBookingPayment: verifyBookingPayment,
    getBookingPaymentStatus: getBookingPaymentStatus,
    getWalletBalance: getWalletBalance,
    getAddresses: getAddresses,
    createAddress: createAddress,
    reschedule: reschedule
  };
})();
