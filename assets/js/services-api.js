/**
 * HairLux Services API Helper
 * Handles service catalog and category fetching.
 *
 * Endpoints used:
 *   GET /services/categories  — all categories with service counts
 *   GET /services             — all services (filterable by categoryId / search / status)
 *   GET /services/{id}        — single service detail (available for future use)
 */

/* global API_CONFIG, APIHelper */

var ServicesAPI = (function () {
  'use strict';

  /**
   * Fetch all service categories.
   * @returns {Promise<{ success: boolean, data: Array }>}
   */
  function getCategories() {
    return APIHelper.request(API_CONFIG.ENDPOINTS.SERVICES_CATEGORIES);
  }

  /**
   * Fetch services with optional filters.
   * @param {object} [params]
   * @param {string} [params.categoryId]  Filter by category ID
   * @param {string} [params.search]      Search services by name
   * @param {string} [params.status]      ACTIVE | INACTIVE (default: ACTIVE)
   * @returns {Promise<{ success: boolean, data: Array }>}
   */
  function getServices(params) {
    var p = params || {};
    var query = new URLSearchParams();
    if (p.categoryId) query.set('categoryId', p.categoryId);
    if (p.search)     query.set('search', p.search);
    query.set('status', p.status || 'ACTIVE');
    var qs = query.toString();
    return APIHelper.request(
      API_CONFIG.ENDPOINTS.SERVICES + (qs ? '?' + qs : '')
    );
  }

  /**
   * Fetch a single service by its UUID.
   * @param {string} id
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  function getServiceById(id) {
    if (!id) return Promise.reject(new Error('Service ID is required'));
    return APIHelper.request(API_CONFIG.ENDPOINTS.SERVICES + '/' + encodeURIComponent(id));
  }

  return {
    getCategories: getCategories,
    getServices: getServices,
    getServiceById: getServiceById
  };
})();

// CommonJS compat
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServicesAPI;
}
