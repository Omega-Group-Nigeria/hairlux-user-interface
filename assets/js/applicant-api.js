const ApplicantAPI = (function () {

  async function request(endpoint, options) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };

    let response, data;
    try {
      response = await fetch(url, config);
    } catch (e) {
      throw { status: 0, message: 'Network error. Please check your connection.', data: null };
    }

    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok) {
      throw { status: response.status, message: data.message || 'An error occurred', data };
    }

    return data;
  }

  return {
    async requestOtp(applicationCode, email) {
      return request(API_CONFIG.ENDPOINTS.APPLICATIONS + '/request-otp', {
        method: 'POST',
        body: JSON.stringify({ applicationCode, email }),
      });
    },

    async verifyOtp(applicationCode, otp) {
      const response = await request(API_CONFIG.ENDPOINTS.APPLICATIONS + '/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ applicationCode, otp }),
      });

      const token = response && response.data && response.data.accessToken;
      if (token) {
        localStorage.setItem(API_CONFIG.STORAGE_KEYS.APPLICANT_TOKEN, token);
      }

      return response;
    },

    async getMe() {
      const token = this.getToken();
      if (!token) {
        throw { status: 401, message: 'Not authenticated', data: null };
      }
      return request(API_CONFIG.ENDPOINTS.APPLICATIONS + '/me', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
      });
    },

    getToken() {
      return localStorage.getItem(API_CONFIG.STORAGE_KEYS.APPLICANT_TOKEN);
    },

    isAuthenticated() {
      return !!this.getToken();
    },

    logout() {
      localStorage.removeItem(API_CONFIG.STORAGE_KEYS.APPLICANT_TOKEN);
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApplicantAPI };
}