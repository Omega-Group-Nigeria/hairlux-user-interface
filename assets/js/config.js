function getRuntimeGoogleMapsKey() {
  if (typeof window === 'undefined') return '';

  var publicConfig = window.__HAIRLUX_PUBLIC_CONFIG__;
  if (publicConfig && typeof publicConfig.googleMapsKey === 'string') {
    var runtimeKey = publicConfig.googleMapsKey.trim();
    if (runtimeKey) return runtimeKey;
  }

  var meta = document.querySelector('meta[name="hairlux-google-maps-key"]');
  return meta ? String(meta.getAttribute('content') || '').trim() : '';
}

// API Configuration
const API_CONFIG = {
  BASE_URL: 'https://hairlux-api.up.railway.app',
  
  // Local storage keys
  STORAGE_KEYS: {
    ACCESS_TOKEN: 'hairlux_access_token',
    REFRESH_TOKEN: 'hairlux_refresh_token',
    USER_DATA: 'hairlux_user_data'
  },

  // API Endpoints
  ENDPOINTS: {
    AUTH: {
      REGISTER: '/auth/register',
      LOGIN: '/auth/login',
      REFRESH_TOKEN: '/auth/refresh-token',
      FORGOT_PASSWORD: '/auth/forgot-password',
      RESET_PASSWORD: '/auth/reset-password',
      VERIFY_OTP: '/auth/verify-otp',
      RESEND_OTP: '/auth/resend-otp'
    },
    USER: {
      PROFILE: '/user/profile',
      PASSWORD: '/user/password',
      ADDRESSES: '/user/addresses'
    },
    SERVICES: '/services',
    JOBS: '/jobs',
    SERVICES_CATEGORIES: '/services/categories',
    BOOKINGS: '/bookings',
    BOOKING_PAYMENTS: {
      BASE: '/bookings/payments',
      INITIALIZE: '/bookings/payments/initialize',
      VERIFY: '/bookings/payments/verify'
    },
    REFERRALS: '/referrals/me',
    REFERRALS_HISTORY: '/referrals/me/history',
    BOOKINGS_BUSINESS_HOURS: '/bookings/business-hours',
    BOOKINGS_BUSINESS_EXCEPTIONS: '/bookings/business-exceptions',
    DISCOUNTS_VALIDATE: '/discounts/validate',
    WALLET: '/wallet',
    INFLUENCER: {
      ME:      '/influencer/me',
      CODES:   '/influencer/me/codes',
      REWARDS: '/influencer/me/rewards'
    }
  },

  // Public browser key for Maps JavaScript API.
  // Set at runtime via window.__HAIRLUX_PUBLIC_CONFIG__.googleMapsKey
  // or <meta name="hairlux-google-maps-key" content="...">.
  MAPS: {
    GOOGLE_PUBLIC_KEY: getRuntimeGoogleMapsKey()
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API_CONFIG;
}
