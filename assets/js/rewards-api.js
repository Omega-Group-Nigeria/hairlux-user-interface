/**
 * HairLux Rewards & Loyalty API Module
 * Handles all customer-facing Rewards & Loyalty self-service API calls.
 * Every call acts on the caller's own account (JWT-scoped) -- staff/admin
 * management of tiers, settings, and other customers' wallets lives in
 * the admin interface, not here.
 */

const RewardsAPI = {
  /**
   * Get the current user's rewards profile: tier, balances, current-period
   * spend, progress to next tier, and rewards expiring within 30 days.
   * @returns {Promise<object>} data object from GET /rewards/profile
   */
  async getProfile() {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.REWARDS_PROGRAM.PROFILE, { method: 'GET' });
    return (res && res.data) ? res.data : res;
  },

  /**
   * Get the current user's reward ledger history (paginated).
   * @param {number} page  - Page number (default 1)
   * @param {number} limit - Page size (default 20)
   * @returns {Promise<object>} { items, total, page, limit }
   */
  async getTransactions(page = 1, limit = 20) {
    const qs = `?page=${page}&limit=${limit}`;
    const res = await APIHelper.request(
      API_CONFIG.ENDPOINTS.REWARDS_PROGRAM.TRANSACTIONS + qs,
      { method: 'GET' }
    );
    const d = (res && res.data) ? res.data : res;
    return {
      items: Array.isArray(d.items) ? d.items : [],
      total: d.total != null ? d.total : 0,
      page:  d.page  != null ? d.page  : page,
      limit: d.limit != null ? d.limit : limit
    };
  },

  /**
   * Transfer cashback balance into the customer's Wallet.
   * Server validates balance and configured transfer/redemption limits;
   * throws (via APIHelper) with the server's message on rejection.
   * @param {number} amount
   * @returns {Promise<object>} the created CashbackTransferRequest
   */
  async transferCashback(amount) {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.REWARDS_PROGRAM.TRANSFER, {
      method: 'PUT',
      body: JSON.stringify({ amount })
    });
    return (res && res.data) ? res.data : res;
  },

  /**
   * Redeem loyalty points into the customer's Wallet at the configured
   * per-point redemption value. Server enforces minimum/maximum limits.
   * @param {number} points
   * @returns {Promise<object>} { pointsRedeemed, valueCredited }
   */
  async redeemPoints(points) {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.REWARDS_PROGRAM.REDEEM_POINTS, {
      method: 'PUT',
      body: JSON.stringify({ points })
    });
    return (res && res.data) ? res.data : res;
  },

  /**
   * Get the customer's saved birthday (day+month, no year), or null if
   * never set.
   * @returns {Promise<object|null>}
   */
  async getBirthday() {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.REWARDS_PROGRAM.BIRTHDAY, { method: 'GET' });
    return (res && res.data !== undefined) ? res.data : res;
  },

  /**
   * Set or update the customer's birthday. The server enforces a 365-day
   * edit lock regardless of what is sent here -- a rejection surfaces as
   * a thrown error with the server's "can next be changed on ..." message.
   * @param {number} day   - 1-31
   * @param {number} month - 1-12
   * @returns {Promise<object>} the saved BirthdayProfile
   */
  async setBirthday(day, month) {
    const res = await APIHelper.request(API_CONFIG.ENDPOINTS.REWARDS_PROGRAM.BIRTHDAY, {
      method: 'PUT',
      body: JSON.stringify({ day, month })
    });
    return (res && res.data) ? res.data : res;
  }
};

// Export for non-browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RewardsAPI;
}
