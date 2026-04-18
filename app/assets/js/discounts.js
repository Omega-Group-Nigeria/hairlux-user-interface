
    document.addEventListener('DOMContentLoaded', async () => {
      const fmt     = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      };
      const toast = (msg, type = 'success') => {
        if (typeof UIHelper !== 'undefined') UIHelper.showToast(msg, type);
      };
      const copyText = async (text, label) => {
        try {
          await navigator.clipboard.writeText(text);
          toast(`${label} copied!`);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast(`${label} copied!`);
        }
      };

      // ── Load profile ─────────────────────────────────────────────
      try {
        const profile = await InfluencerAPI.getProfile();
        const user = profile.user || {};
        document.getElementById('inflName').textContent =
          [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
        document.getElementById('inflEmail').textContent = user.email || '—';
        document.getElementById('statTotalEarned').textContent =
          profile.totalEarned != null ? fmt(profile.totalEarned) : '₦0.00';
        document.getElementById('statWalletBalance').textContent =
          profile.walletBalance != null ? fmt(profile.walletBalance) : '₦0.00';
        document.getElementById('statCodeCount').textContent =
          (profile._count && profile._count.discountCodes != null) ? profile._count.discountCodes : '0';
        document.getElementById('statRewardCount').textContent =
          (profile._count && profile._count.influencerRewards != null) ? profile._count.influencerRewards : '0';
      } catch (err) {
        toast('Could not load influencer profile.', 'error');
      }

      // ── Load discount codes ───────────────────────────────────────
      try {
        const codes = await InfluencerAPI.getCodes();
        const badge = document.getElementById('codesBadge');
        const container = document.getElementById('codesContainer');
        badge.textContent = codes.length;

        if (!codes.length) {
          container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No discount codes yet — check back soon! 🎟️</div>';
        } else {
          container.innerHTML = codes.map(c => {
            const isActive = c.isActive !== false;
            const statusLabel = isActive ? 'Active' : 'Inactive';
            const statusClass = isActive ? 'active' : 'inactive';
            const maxUsesStr  = c.maxUses != null ? `/ ${c.maxUses}` : '';
            const expiresStr  = c.expiresAt ? `Expires ${fmtDate(c.expiresAt)}` : 'No expiry';
            const name = c.name || c.code;
            return `
              <div class="code-card">
                <span class="code-card-status ${statusClass}">${statusLabel}</span>
                <div class="code-card-label">${name}</div>
                <div class="code-card-code">${c.code}</div>
                <div class="code-card-meta">
                  <strong>${c.percentage}% off</strong> &middot; ${expiresStr}
                </div>
                <div class="code-card-footer">
                  <button class="btn-code-copy" data-code="${c.code}">
                    <span>📋</span> Copy Code
                  </button>
                  <span class="code-uses-pill">${c.usedCount || 0}${maxUsesStr} uses</span>
                </div>
              </div>`;
          }).join('');

          // Attach copy listeners
          container.querySelectorAll('.btn-code-copy').forEach(btn => {
            btn.addEventListener('click', () => copyText(btn.dataset.code, 'Discount code'));
          });
        }
      } catch (err) {
        document.getElementById('codesContainer').innerHTML =
          '<div class="empty-state" style="grid-column:1/-1;">Could not load discount codes.</div>';
      }

      // ── Load reward history (paginated) ───────────────────────────
      const tbody    = document.getElementById('rewardsTableBody');
      const pagEl    = document.getElementById('rewardsPagination');
      const pageInfo = document.getElementById('pageInfo');
      const pagePrev = document.getElementById('pagePrev');
      const pageNext = document.getElementById('pageNext');
      const badge    = document.getElementById('rewardsBadge');

      let currentPage = 1;
      const PAGE_SIZE = 20;

      async function loadRewards(page) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading…</td></tr>';
        try {
          const { rewards, totalEarned, pagination } = await InfluencerAPI.getRewards(page, PAGE_SIZE);
          const total = pagination.total || rewards.length;
          const totalPages = pagination.totalPages || 1;
          badge.textContent = total;

          if (!rewards.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No rewards yet — share your codes to start earning! 💰</td></tr>';
            pagEl.style.display = 'none';
            return;
          }

          tbody.innerHTML = rewards.map(r => {
            const usage = r.usage || {};
            const dc    = usage.discountCode || {};
            const codeName  = dc.code || '—';
            const discAmt   = usage.discountAmount != null ? fmt(usage.discountAmount) : '—';
            const reward    = Number(r.rewardAmount || 0);
            const rewardStr = reward > 0
              ? `<span class="reward-amount">${fmt(reward)}</span>`
              : `<span class="reward-amount zero">—</span>`;
            return `
              <tr>
                <td>
                  <strong style="font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:0.04em;">${codeName}</strong>
                  ${dc.name ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${dc.name}</div>` : ''}
                </td>
                <td>${discAmt}</td>
                <td>${rewardStr}</td>
                <td><span class="reward-status-pill">${r.status || 'REWARDED'}</span></td>
                <td>${fmtDate(r.createdAt)}</td>
              </tr>`;
          }).join('');

          // Pagination controls
          if (totalPages > 1) {
            pagEl.style.display = 'flex';
            pageInfo.textContent = `Page ${page} of ${totalPages}`;
            pagePrev.disabled = page <= 1;
            pageNext.disabled = page >= totalPages;
            currentPage = page;
          } else {
            pagEl.style.display = 'none';
          }
        } catch (err) {
          tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Could not load reward history.</td></tr>';
        }
      }

      pagePrev.addEventListener('click', () => { if (currentPage > 1) loadRewards(currentPage - 1); });
      pageNext.addEventListener('click', () => loadRewards(currentPage + 1));

      loadRewards(1);
    });