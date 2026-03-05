/**
 * HairLux Influencer API Module
 * Handles all influencer self-service API calls (user endpoints).
 * All endpoints require an active influencer JWT — returns 403 if not an influencer.
 */

const InfluencerAPI = {
  /**
   * Get the current user's influencer profile.
   * Includes totalEarned, walletBalance, discount code count, reward count.
   * @returns {Promise<object>} data object from /influencer/me
   */
  async getProfile() {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.INFLUENCER.ME, { method: 'GET' });
    return (res && res.data) ? res.data : res;
  },

  /**
   * Get the influencer's discount codes.
   * @returns {Promise<Array>} array of discount code objects
   */
  async getCodes() {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.INFLUENCER.CODES, { method: 'GET' });
    const d = (res && res.data) ? res.data : res;
    return Array.isArray(d) ? d : (Array.isArray(d && d.codes) ? d.codes : []);
  },

  /**
   * Get the influencer's reward history.
   * @param {number} page  - Page number (default 1)
   * @param {number} limit - Page size (default 20, max 100)
   * @returns {Promise<object>} { rewards, totalEarned, pagination }
   */
  async getRewards(page = 1, limit = 20) {
    const qs = `?page=${page}&limit=${limit}`;
    const res = await APIHelper.request(
      API_CONFIG.ENDPOINTS.INFLUENCER.REWARDS + qs,
      { method: 'GET' }
    );
    const d = (res && res.data) ? res.data : res;
    return {
      rewards:    Array.isArray(d.rewards)    ? d.rewards    : [],
      totalEarned: d.totalEarned != null      ? d.totalEarned : 0,
      pagination: d.pagination || {}
    };
  },

  /**
   * Check if a user object (from stored auth data) is an active influencer.
   * @param {object} user - User object from APIHelper.getUserData()
   * @returns {boolean}
   */
  isActiveInfluencer(user) {
    if (!user) return false;
    return !!(user.influencer && user.influencer.isActive === true);
  }
};

// Export for non-browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfluencerAPI;
}
