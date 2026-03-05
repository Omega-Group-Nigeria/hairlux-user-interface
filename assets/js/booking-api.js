/**
 * booking-api.js
 * Thin wrappers around APIHelper.request() for the bookings domain.
 * Depends on: config.js, auth-api.js (APIHelper)
 */
var BookingAPI = (function () {

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
    return Array.isArray(response && response.data) ? response.data : [];
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
    return {
      id:          data.id          || '',
      label:       data.label       || '',
      addressLine: data.addressLine || '',
      city:        data.city        || '',
      state:       data.state       || '',
      country:     data.country     || 'Nigeria',
      latitude:    data.latitude  != null ? Number(data.latitude)  : null,
      longitude:   data.longitude != null ? Number(data.longitude) : null,
      isDefault:   Boolean(data.isDefault)
    };
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

  return { create: create, getWalletBalance: getWalletBalance, getAddresses: getAddresses, createAddress: createAddress, reschedule: reschedule };
})();
