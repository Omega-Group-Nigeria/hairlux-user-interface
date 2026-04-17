/**
 * HairLux Address API Helper
 * CRUD wrappers around APIHelper.request() for the /user/addresses domain.
 * Depends on: config.js, auth-api.js (APIHelper)
 */
var AddressAPI = (function () {
  'use strict';

  var BASE = API_CONFIG.ENDPOINTS.USER.ADDRESSES;

  function firstNonEmpty(values, fallback) {
    var i;
    for (i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (value == null) continue;
      var text = String(value).trim();
      if (text) return text;
    }
    return fallback;
  }

  function sanitizePayload(payload) {
    var body = {
      label:         firstNonEmpty([payload && payload.label], undefined),
      fullAddress:   firstNonEmpty([payload && payload.fullAddress, payload && payload.addressLine], ''),
      streetAddress: firstNonEmpty([payload && payload.streetAddress], undefined),
      city:          firstNonEmpty([payload && payload.city], undefined),
      state:         firstNonEmpty([payload && payload.state], undefined),
      country:       firstNonEmpty([payload && payload.country], 'Nigeria'),
      placeId:       firstNonEmpty([payload && payload.placeId, payload && payload.place_id], undefined),
      isDefault:     Boolean(payload && payload.isDefault)
    };

    if (payload && payload.addressComponents && typeof payload.addressComponents === 'object') {
      body.addressComponents = payload.addressComponents;
    }

    Object.keys(body).forEach(function (key) {
      if (body[key] === undefined || body[key] === '') {
        delete body[key];
      }
    });

    return body;
  }

  /**
   * Normalise a raw address object from the server into a consistent shape.
   * @param {Object} raw
   * @returns {Object}
   */
  function normalize(raw) {
    raw = raw || {};
    var components = raw.addressComponents && typeof raw.addressComponents === 'object'
      ? raw.addressComponents
      : {};

    var fullAddress = firstNonEmpty([
      raw.fullAddress,
      raw.formattedAddress,
      raw.address,
      raw.addressLine
    ], '');

    var city = firstNonEmpty([
      raw.city,
      raw.locality,
      components.city,
      components.locality
    ], '');

    var state = firstNonEmpty([
      raw.state,
      raw.region,
      components.state,
      components.region,
      components.administrativeArea
    ], '');

    var country = firstNonEmpty([
      raw.country,
      components.country
    ], 'Nigeria');

    return {
      id:            raw.id || '',
      label:         firstNonEmpty([raw.label], ''),
      fullAddress:   fullAddress,
      addressLine:   fullAddress,
      streetAddress: firstNonEmpty([
        raw.streetAddress,
        components.streetAddress,
        fullAddress
      ], ''),
      city: city,
      state: state,
      country: country,
      placeId: firstNonEmpty([
        raw.placeId,
        raw.place_id,
        components.placeId
      ], ''),
      isDefault: Boolean(raw.isDefault),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  /**
   * Extract the data array/object from a standard { success, message, data } envelope.
   * @param {Object} response
   * @returns {*}
   */
  function unwrap(response) {
    if (response && response.data !== undefined) return response.data;
    return response;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Fetch all saved addresses for the authenticated user.
   * GET /user/addresses
   * @returns {Promise<Object[]>}
   */
  async function getAll() {
    var response = await APIHelper.request(BASE, { method: 'GET' });
    var data = unwrap(response);
    var list = Array.isArray(data) ? data : (Array.isArray(data && data.addresses) ? data.addresses : []);
    return list.map(normalize);
  }

  /**
   * Create a new address.
   * POST /user/addresses
   * @param {Object} payload
   * @param {string}  payload.fullAddress        - Required
   * @param {string}  [payload.label]            - e.g. "Home", "Office"
   * @param {string}  [payload.placeId]          - Google Place ID
   * @param {string}  [payload.streetAddress]
   * @param {string}  [payload.city]
   * @param {string}  [payload.state]
   * @param {string}  [payload.country]          - Defaults to "Nigeria"
   * @param {Object}  [payload.addressComponents]
   * @param {boolean} [payload.isDefault]
   * @returns {Promise<Object>} Normalised address object
   */
  async function create(payload) {
    var response = await APIHelper.request(BASE, {
      method: 'POST',
      body: JSON.stringify(sanitizePayload(payload))
    });
    var data = unwrap(response);
    return normalize(data);
  }

  /**
   * Update an existing address by ID.
  * PATCH /user/addresses/:id
   * @param {string} id
   * @param {Object} payload - Any subset of address fields
   * @returns {Promise<Object>} Normalised updated address
   */
  async function update(id, payload) {
    var response = await APIHelper.request(BASE + '/' + id, {
      method: 'PATCH',
      body: JSON.stringify(sanitizePayload(payload))
    });
    var data = unwrap(response);
    return normalize(data);
  }

  /**
   * Delete an address by ID.
   * DELETE /user/addresses/:id
   * @param {string} id
   * @returns {Promise<{ message: string }>}
   */
  async function remove(id) {
    var response = await APIHelper.request(BASE + '/' + id, { method: 'DELETE' });
    return {
      message: (response && response.message) || 'Address deleted successfully'
    };
  }

  // Expose public interface
  return {
    getAll:  getAll,
    create:  create,
    update:  update,
    remove:  remove
  };

})();
