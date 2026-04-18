    document.addEventListener('DOMContentLoaded', async function () {

      // ── Refs ───────────────────────────────────────────────────────
      const heroAvatar    = document.getElementById('heroAvatar');
      const heroName      = document.getElementById('heroName');
      const heroEmail     = document.getElementById('heroEmail');
      const heroStatus    = document.getElementById('heroStatus');
      const profileInfoRows = document.getElementById('profileInfoRows');

      const profileViewMode = document.getElementById('profileViewMode');
      const profileEditMode = document.getElementById('profileEditMode');
      const btnEditProfile  = document.getElementById('btnEditProfile');
      const btnCancelEdit   = document.getElementById('btnCancelEdit');
      const profileForm     = document.getElementById('profileForm');
      const btnSaveProfile  = document.getElementById('btnSaveProfile');

      const fieldFirstName  = document.getElementById('fieldFirstName');
      const fieldLastName   = document.getElementById('fieldLastName');
      const fieldEmail      = document.getElementById('fieldEmail');
      const fieldPhone      = document.getElementById('fieldPhone');

      const passwordForm    = document.getElementById('passwordForm');
      const btnSavePw       = document.getElementById('btnSavePw');
      const fieldCurrentPw  = document.getElementById('fieldCurrentPw');
      const fieldNewPw      = document.getElementById('fieldNewPw');
      const fieldConfirmPw  = document.getElementById('fieldConfirmPw');
      const pwStrengthFill  = document.getElementById('pwStrengthFill');
      const pwStrengthLabel = document.getElementById('pwStrengthLabel');

      let currentProfile = null;

      // ── Utilities ──────────────────────────────────────────────────
      function initials(first, last, email) {
        const f = (first  || '')[0] || '';
        const l = (last   || '')[0] || '';
        return (f + l).toUpperCase() || (email || '?')[0].toUpperCase();
      }

      function setButtonLoading(btn, loading, loadingText) {
        if (loading) {
          btn._origText = btn.querySelector('div') ? btn.querySelector('div').textContent : btn.textContent;
          if (btn.querySelector('div')) btn.querySelector('div').textContent = loadingText || 'Saving…';
          else btn.textContent = loadingText || 'Saving…';
          btn.disabled = true;
        } else {
          if (btn.querySelector('div')) btn.querySelector('div').textContent = btn._origText || btn.querySelector('div').textContent;
          else btn.textContent = btn._origText || btn.textContent;
          btn.disabled = false;
        }
      }

      // ── Password strength ──────────────────────────────────────────
      fieldNewPw.addEventListener('input', function () {
        const pw = this.value;
        let score = 0;
        if (pw.length >= 8)  score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        const configs = [
          { pct: '0%',   color: '#e5e5e5', label: '',        tColor: 'var(--muted)' },
          { pct: '25%',  color: '#dc3545', label: 'Weak',    tColor: '#dc3545' },
          { pct: '50%',  color: '#fd7e14', label: 'Fair',    tColor: '#fd7e14' },
          { pct: '75%',  color: '#ffc107', label: 'Good',    tColor: '#8a6208' },
          { pct: '100%', color: '#28a745', label: 'Strong',  tColor: '#28a745' },
        ];

        const cfg = pw.length === 0 ? configs[0] : configs[score] || configs[score - 1];
        pwStrengthFill.style.width      = cfg.pct;
        pwStrengthFill.style.background = cfg.color;
        pwStrengthLabel.textContent     = cfg.label;
        pwStrengthLabel.style.color     = cfg.tColor;
      });

      // ── Render profile view ────────────────────────────────────────
      function renderProfileView(user) {
        // Hero
        const inits = initials(user.firstName, user.lastName, user.email);
        heroAvatar.textContent = inits;
        heroName.textContent   = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
        heroEmail.textContent  = user.email || '';
        heroStatus.style.display = 'inline-flex';

        // Info rows
        profileInfoRows.innerHTML = [
          { label: 'First Name', value: user.firstName || '—' },
          { label: 'Last Name',  value: user.lastName  || '—' },
          { label: 'Email',      value: user.email     || '—' },
          { label: 'Phone',      value: user.phone     || '—' },
        ].map(r => `
          <div class="info-row">
            <span class="info-label">${r.label}</span>
            <span class="info-value">${r.value}</span>
          </div>`).join('');

        // Populate edit fields
        fieldFirstName.value = user.firstName || '';
        fieldLastName.value  = user.lastName  || '';
        fieldEmail.value     = user.email     || '';
        fieldPhone.value     = user.phone     || '';
      }

      // ── Load profile ───────────────────────────────────────────────
      async function loadProfile() {
        try {
          const res  = await APIHelper.request(API_CONFIG.ENDPOINTS.USER.PROFILE);
          const user = (res && res.data) ? res.data : res;
          currentProfile = user;
          renderProfileView(user);
          // Update cached user data so the navbar initials are fresh
          try { localStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(user)); } catch (_) {}
        } catch (err) {
          const msg = Array.isArray(err && err.message) ? err.message.join(', ') : ((err && err.message) || 'Could not load profile.');
          if (typeof UIHelper !== 'undefined') UIHelper.showToast(msg, 'error');
        }
      }

      // ── Edit toggle ────────────────────────────────────────────────
      btnEditProfile.addEventListener('click', function () {
        profileViewMode.style.display = 'none';
        profileEditMode.style.display = 'block';
      });

      btnCancelEdit.addEventListener('click', function () {
        profileEditMode.style.display = 'none';
        profileViewMode.style.display = 'block';
        if (currentProfile) renderProfileView(currentProfile);
      });

      // ── Save profile ───────────────────────────────────────────────
      profileForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const firstName = fieldFirstName.value.trim();
        const lastName  = fieldLastName.value.trim();
        const phone     = fieldPhone.value.trim();

        if (!firstName || !lastName) {
          if (typeof UIHelper !== 'undefined') UIHelper.showToast('First and last name are required.', 'error');
          return;
        }

        btnSaveProfile.disabled = true;
        btnSaveProfile.textContent = 'Saving…';

        try {
          const res  = await APIHelper.request(API_CONFIG.ENDPOINTS.USER.PROFILE, {
            method: 'PUT',
            body: JSON.stringify({ firstName, lastName, phone: phone || undefined })
          });
          const updated = (res && res.data) ? res.data : res;
          currentProfile = { ...currentProfile, ...updated };
          renderProfileView(currentProfile);
          try { localStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(currentProfile)); } catch (_) {}

          profileEditMode.style.display = 'none';
          profileViewMode.style.display = 'block';

          if (typeof UIHelper !== 'undefined') UIHelper.showToast('Profile updated successfully.', 'success');
        } catch (err) {
          const msg = Array.isArray(err && err.message) ? err.message.join(', ') : ((err && err.message) || 'Could not update profile.');
          if (typeof UIHelper !== 'undefined') UIHelper.showToast(msg, 'error');
        } finally {
          btnSaveProfile.disabled = false;
          btnSaveProfile.textContent = 'Save Changes';
        }
      });

      // ── Change password ────────────────────────────────────────────
      passwordForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const currentPassword     = fieldCurrentPw.value;
        const newPassword         = fieldNewPw.value;
        const confirmPassword     = fieldConfirmPw.value;

        if (!currentPassword) {
          if (typeof UIHelper !== 'undefined') UIHelper.showToast('Please enter your current password.', 'error');
          return;
        }
        if (newPassword.length < 8) {
          if (typeof UIHelper !== 'undefined') UIHelper.showToast('New password must be at least 8 characters.', 'error');
          return;
        }
        if (newPassword !== confirmPassword) {
          if (typeof UIHelper !== 'undefined') UIHelper.showToast('Passwords do not match.', 'error');
          return;
        }

        btnSavePw.disabled = true;
        btnSavePw.textContent = 'Updating…';

        try {
          await APIHelper.request(API_CONFIG.ENDPOINTS.USER.PASSWORD, {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
          });

          passwordForm.reset();
          pwStrengthFill.style.width = '0%';
          pwStrengthLabel.textContent = '';

          if (typeof UIHelper !== 'undefined') UIHelper.showToast('Password updated successfully.', 'success');
        } catch (err) {
          const msg = Array.isArray(err && err.message) ? err.message.join(', ') : ((err && err.message) || 'Could not update password.');
          if (typeof UIHelper !== 'undefined') UIHelper.showToast(msg, 'error');
        } finally {
          btnSavePw.disabled = false;
          btnSavePw.textContent = 'Update Password';
        }
      });

      // ── Init ───────────────────────────────────────────────────────
      await loadProfile();
    });