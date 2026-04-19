
    document.addEventListener('DOMContentLoaded', async () => {
      // ── Helpers ──────────────────────────────────────────────────
      const fmt = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      };

      const elCode   = document.getElementById('refCode');
      const elUses   = document.getElementById('statUses');
      const elEarned = document.getElementById('statEarned');
      const elBadge  = document.getElementById('histBadge');
      const tbody    = document.getElementById('refTableBody');

      let myCode = '';

      // ── Load referral data ────────────────────────────────────────
      try {
        const res = await APIHelper.request(API_CONFIG.ENDPOINTS.REFERRALS);
        const data = res && res.data ? res.data : res;
        myCode = data.code || '';
        elCode.textContent   = myCode || '—';
        elUses.textContent   = data.totalUses   != null ? data.totalUses   : '0';
        elEarned.textContent = data.totalEarned != null ? fmt(data.totalEarned) : '₦0.00';
      } catch (err) {
        elCode.textContent   = 'N/A';
        elUses.textContent   = '—';
        elEarned.textContent = '—';
        if (typeof UIHelper !== 'undefined') UIHelper.showToast('Could not load referral code.', 'error');
      }

      // ── Load referral history ─────────────────────────────────────
      try {
        const res  = await APIHelper.request(API_CONFIG.ENDPOINTS.REFERRALS_HISTORY);
        const list = Array.isArray(res) ? res : (res && res.data ? res.data : []);
        elBadge.textContent = list.length;

        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No referrals yet — share your code to get started! 🎉</td></tr>';
        } else {
          tbody.innerHTML = list.map(item => {
            const referred = item.referred || {};
            const name  = [(referred.firstName || ''), (referred.lastName || '')].join(' ').trim() || 'Unknown';
            const status = (item.status || 'PENDING').toUpperCase();
            const reward = Number(item.rewardAmount || 0);
            const rewardStr = reward > 0
              ? `<span class="reward-amount">${fmt(reward)}</span>`
              : `<span class="reward-amount zero">—</span>`;
            return `
              <tr>
                <td><strong>${name}</strong></td>
                <td><span class="ref-status-pill ref-status-${status}">${status}</span></td>
                <td>${rewardStr}</td>
                <td>${fmtDate(referred.createdAt || item.createdAt)}</td>
              </tr>`;
          }).join('');
        }
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Could not load referral history.</td></tr>';
      }

      // ── Copy / Share buttons ──────────────────────────────────────
      const toast = (msg, type = 'success') => {
        if (typeof UIHelper !== 'undefined') UIHelper.showToast(msg, type);
      };

      const copyToClipboard = async (text, label) => {
        try {
          await navigator.clipboard.writeText(text);
          toast(`${label} copied to clipboard!`);
        } catch {
          // Fallback for older browsers
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast(`${label} copied!`);
        }
      };

      document.getElementById('btnCopyCode').addEventListener('click', () => {
        if (!myCode) return toast('Referral code not loaded yet.', 'error');
        copyToClipboard(myCode, 'Referral code');
      });

      document.getElementById('btnShare').addEventListener('click', async () => {
        if (!myCode) return toast('Referral code not loaded yet.', 'error');
        const shareUrl  = window.location.origin + '/sign-up.html?code=' + encodeURIComponent(myCode);
        const shareData = {
          title: 'Join me on Hairlux!',
          text:  `Use my referral code ${myCode} to sign up and get a reward on Hairlux — premium mobile beauty services.`,
          url:   shareUrl
        };
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
          try { await navigator.share(shareData); }
          catch (e) { if (e.name !== 'AbortError') toast('Share failed.', 'error'); }
        } else {
          copyToClipboard(shareUrl, 'Signup link');
        }
      });
    });