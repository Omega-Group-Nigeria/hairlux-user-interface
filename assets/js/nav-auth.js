/**
 * Navigation Authentication Handler
 * Updates navbar buttons based on login state for public pages
 */
(function() {
  function updateNavAuth() {
    if (typeof APIHelper === 'undefined') {
      console.warn('APIHelper not defined. Ensure config.js and auth-api.js are loaded.');
      return;
    }

    const user = APIHelper.getUserData();
    const token = APIHelper.getToken();

    if (user && token) {
      // Update public homepage CTA to dashboard for authenticated users.
      const authCta = document.querySelector('[data-auth-cta="hero"]');
      if (authCta) {
        authCta.setAttribute('href', 'app/index.html');
        const authCtaLabel = authCta.querySelector('div');
        if (authCtaLabel) {
          authCtaLabel.textContent = 'Go to Dashboard';
        }
      }

      // 1. Prepare user data
      const first = (user.firstName || '').trim();
      const last  = (user.lastName  || '').trim();
      const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || (user.email || '?')[0].toUpperCase();
      const fullName = (first + ' ' + last).trim() || user.email || 'My Account';
      const isInfluencer = !!(user.influencer && user.influencer.isActive === true);

      // 2. Hide existing Login/Signup elements
      // Desktop button wrapper
      const btnWrapper = document.querySelector('.button-wrapper');
      if (btnWrapper) btnWrapper.style.display = 'none';

      // Mobile menu link - we remove this so it doesn't take up space in the hamburger menu
      const mobileLogin = document.querySelector('.login-nav-mobile');
      if (mobileLogin) mobileLogin.style.display = 'none';

      // 3. Find the container to inject the new structure
      // We want to replicate the structure from app/index.html which uses a .mobile-nav-tools wrapper 
      // containing the menu button and the profile dropdown.
      // Currently index.html usually has .menu-button directly in .container-nav.
      
      const containerNav = document.querySelector('.container-nav');
      const menuButton = document.querySelector('.menu-button.w-nav-button');

      if (containerNav && menuButton) {
        // Create the wrapper if it doesn't already exist
        let toolsWrapper = containerNav.querySelector('.mobile-nav-tools');
        
        if (!toolsWrapper) {
          toolsWrapper = document.createElement('div');
          toolsWrapper.className = 'mobile-nav-tools';
            
          // Insert the wrapper where the button wrapper was, usually at the end of container-nav
          // If we appendChild, it goes to the end, which is correct for flex layout usually.
          containerNav.appendChild(toolsWrapper);
            
          // Move the existing menu button inside the wrapper so they sit together
          toolsWrapper.appendChild(menuButton);
        }

        // 4. Create the Profile Dropdown HTML
        // Note: We use app/ paths for links since we are in root
        const dropdownHtml = `
          <div data-hover="false" data-delay="0" class="profile-dropdown w-dropdown">
            <div class="profile-toggle w-dropdown-toggle">
              <div class="top-profile">
                <div class="top-profile-avatar" id="navAvatar">${initials}</div>
                <div>
                  <div class="top-profile-name" id="navName">${fullName}</div>
                  <div class="top-profile-link">View profile</div>
                </div>
              </div>
            </div>
            <nav class="profile-list w-dropdown-list">
              <a href="app/index.html" class="dropdown-link w-dropdown-link">Dashboard</a>
              <a href="app/services.html" class="dropdown-link w-dropdown-link">Services</a>
              <a href="app/my-bookings.html" class="dropdown-link w-dropdown-link">My Bookings</a>
              <a href="app/transactions.html" class="dropdown-link w-dropdown-link">Transactions</a>
              <a href="app/address.html" class="dropdown-link w-dropdown-link">My Addresses</a>
              <a href="app/referrals.html" class="dropdown-link w-dropdown-link">Referrals</a>
              ${isInfluencer ? '<a href="app/discounts.html" class="dropdown-link w-dropdown-link">Discount Rewards</a>' : ''}
              <a href="app/profile.html" class="dropdown-link w-dropdown-link">My Profile</a>
              <a href="#" id="navLogoutBtn" class="dropdown-link w-dropdown-link">Logout</a>
            </nav>
          </div>
        `;

        // Parse HTML string into DOM element
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = dropdownHtml.trim();
        const dropdownEl = tempContainer.firstChild;

        // Append to the tools wrapper
        toolsWrapper.appendChild(dropdownEl);

        // 5. Initialize simple dropdown usage (since likely injected after Webflow init)
        const toggle = dropdownEl.querySelector('.profile-toggle');
        const list = dropdownEl.querySelector('.profile-list');
        
        if (toggle && list) {
          toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = dropdownEl.classList.contains('w--open');
            if (isOpen) {
              dropdownEl.classList.remove('w--open');
              toggle.classList.remove('w--open');
              list.classList.remove('w--open');
            } else {
              dropdownEl.classList.add('w--open');
              toggle.classList.add('w--open');
              list.classList.add('w--open');
            }
          });

          // Close when clicking outside
          document.addEventListener('click', function(e) {
            if (!dropdownEl.contains(e.target)) {
              dropdownEl.classList.remove('w--open');
              toggle.classList.remove('w--open');
              list.classList.remove('w--open');
            }
          });
        }

        // 6. Handle Logout
        const logoutBtn = dropdownEl.querySelector('#navLogoutBtn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            AuthAPI.logout();
            window.location.reload();
          });
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNavAuth);
  } else {
    updateNavAuth();
  }
})();
