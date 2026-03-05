/**
 * HairLux Address API Helper
 * CRUD wrappers around APIHelper.request() for the /user/addresses domain.
 * Depends on: config.js, auth-api.js (APIHelper)
 */
var AddressAPI = (function () {
  'use strict';

  var BASE = API_CONFIG.ENDPOINTS.USER.ADDRESSES;

  /**
   * Normalise a raw address object from the server into a consistent shape.
   * @param {Object} raw
   * @returns {Object}
   */
  function normalize(raw) {
    return {
      id:          raw.id          || '',
      label:       raw.label       || '',
      addressLine: raw.addressLine || '',
      city:        raw.city        || '',
      state:       raw.state       || '',
      country:     raw.country     || 'Nigeria',
      postalCode:  raw.postalCode  || '',
      latitude:    raw.latitude    != null ? Number(raw.latitude)  : null,
      longitude:   raw.longitude   != null ? Number(raw.longitude) : null,
      isDefault:   Boolean(raw.isDefault),
      createdAt:   raw.createdAt   || new Date().toISOString(),
      updatedAt:   raw.updatedAt   || new Date().toISOString()
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
   * @param {string}  payload.addressLine  - Required
   * @param {string}  payload.city         - Required
   * @param {string}  payload.state        - Required
   * @param {string}  [payload.label]      - e.g. "Home", "Office"
   * @param {string}  [payload.country]    - Defaults to "Nigeria"
   * @param {string}  [payload.postalCode]
   * @param {number}  [payload.latitude]
   * @param {number}  [payload.longitude]
   * @param {boolean} [payload.isDefault]
   * @returns {Promise<Object>} Normalised address object
   */
  async function create(payload) {
    var response = await APIHelper.request(BASE, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    var data = unwrap(response);
    return normalize(data);
  }

  /**
   * Update an existing address by ID.
   * PUT /user/addresses/:id
   * @param {string} id
   * @param {Object} payload - Any subset of address fields
   * @returns {Promise<Object>} Normalised updated address
   */
  async function update(id, payload) {
    var response = await APIHelper.request(BASE + '/' + id, {
      method: 'PUT',
      body: JSON.stringify(payload)
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
