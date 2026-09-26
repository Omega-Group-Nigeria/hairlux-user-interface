
    document.addEventListener('DOMContentLoaded', async () => {
      // ── Helpers ──────────────────────────────────────────────────
      const fmtNaira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtDate  = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      };
      const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const fmtDayMonth = (day, month) => (day && month) ? `${day} ${MONTH_NAMES[month - 1]}` : '—';

      const toast = (msg, type = 'success') => {
        if (typeof UIHelper !== 'undefined') UIHelper.showToast(msg, type);
      };

      const errMsg = (err, fallback) => (err && err.message) ? err.message : fallback;

      let currentProfile = null;

      // ── Load profile (hero, progress, expiring rewards) ────────────
      async function loadProfile() {
        try {
          const p = await RewardsAPI.getProfile();
          currentProfile = p;

          const tier = p.currentTier;
          document.getElementById('tierName').textContent = tier ? tier.name : 'No Tier Yet';
          document.getElementById('tierSub').textContent = tier
            ? `${Number(tier.cashbackPercentage)}% cashback on bookings · ${Number(tier.pointsMultiplier)}x points`
            : 'Book a service to start earning cashback and points.';

          document.getElementById('statCashback').textContent = fmtNaira(p.cashbackBalance);
          document.getElementById('statPoints').textContent   = Number(p.loyaltyPoints || 0).toLocaleString('en-NG');

          const progressWrap = document.getElementById('progressWrap');
          if (p.nextTier) {
            const target = Number(p.nextTier.minSpend);
            const current = Number(p.currentPeriodSpend || 0);
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            progressWrap.style.display = '';
            document.getElementById('progressCurrentLabel').textContent = `${fmtNaira(current)} spent`;
            document.getElementById('progressTargetLabel').textContent  = `Next: ${p.nextTier.name}`;
            document.getElementById('progressFill').style.width = pct + '%';
            document.getElementById('progressNote').textContent =
              p.spendNeededForNextTier > 0
                ? `Spend ${fmtNaira(p.spendNeededForNextTier)} more within the qualifying period to reach ${p.nextTier.name}.`
                : `You qualify for ${p.nextTier.name} — it will apply on your next review.`;
          } else {
            progressWrap.style.display = 'none';
          }

          const expiringBanner = document.getElementById('expiringBanner');
          const expiringList   = document.getElementById('expiringList');
          if (Array.isArray(p.expiringRewards) && p.expiringRewards.length) {
            expiringBanner.classList.add('is-visible');
            expiringList.innerHTML = p.expiringRewards.map(r => {
              const label = r.rewardType === 'POINTS' ? `${Number(r.amount)} points` : fmtNaira(r.amount);
              return `${label} expires ${fmtDate(r.expiresAt)}`;
            }).join(' &nbsp;·&nbsp; ');
          } else {
            expiringBanner.classList.remove('is-visible');
          }

          // Keep the modal hints in sync with the freshest balances.
          document.getElementById('transferHint').textContent = `Available: ${fmtNaira(p.cashbackBalance)}`;
          document.getElementById('redeemHint').textContent   = `Available: ${Number(p.loyaltyPoints || 0).toLocaleString('en-NG')} points`;
        } catch (err) {
          document.getElementById('tierName').textContent = 'N/A';
          document.getElementById('tierSub').textContent  = 'Could not load your rewards profile.';
          toast(errMsg(err, 'Could not load your rewards profile.'), 'error');
        }
      }

      // ── Load birthday card ──────────────────────────────────────────
      async function loadBirthday() {
        const body = document.getElementById('birthdayBody');
        try {
          const bday = await RewardsAPI.getBirthday();
          renderBirthday(bday);
        } catch (err) {
          body.innerHTML = '<div class="empty-state">Could not load your birthday reward settings.</div>';
        }
      }

      function renderBirthday(bday) {
        const body = document.getElementById('birthdayBody');
        const now = new Date();
        const locked = bday && bday.nextPermittedEditDate && new Date(bday.nextPermittedEditDate) > now;

        let html = '';
        if (bday && bday.day && bday.month) {
          html += `
            <div class="rwd-birthday-current">
              <div class="rwd-birthday-icon">🎂</div>
              <div>
                <div class="rwd-birthday-date">${fmtDayMonth(bday.day, bday.month)}</div>
                <div class="rwd-birthday-lock-note">${locked ? `Can next be changed on ${fmtDate(bday.nextPermittedEditDate)}` : 'You can update this whenever you like.'}</div>
              </div>
            </div>`;
        } else {
          html += `<p class="p-regular" style="margin:0 0 14px;color:var(--muted);font-size:13px;">Add your birthday to receive a birthday reward once a year. Once saved, it can only be changed every 365 days.</p>`;
        }

        if (!locked) {
          const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)
            .map(d => `<option value="${d}" ${bday && bday.day === d ? 'selected' : ''}>${d}</option>`).join('');
          const monthOptions = MONTH_NAMES
            .map((m, i) => `<option value="${i + 1}" ${bday && bday.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');

          html += `
            <form class="rwd-birthday-form" id="birthdayForm" novalidate>
              <div class="form-group">
                <label for="bdayDay">Day</label>
                <select id="bdayDay" required><option value="">Day</option>${dayOptions}</select>
              </div>
              <div class="form-group">
                <label for="bdayMonth">Month</label>
                <select id="bdayMonth" required><option value="">Month</option>${monthOptions}</select>
              </div>
              <button type="submit" class="btn-save" id="bdaySave">${bday && bday.day ? 'Update Birthday' : 'Save Birthday'}</button>
            </form>`;
        }

        body.innerHTML = html;

        const form = document.getElementById('birthdayForm');
        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const day   = Number(document.getElementById('bdayDay').value);
            const month = Number(document.getElementById('bdayMonth').value);
            if (!day || !month) return toast('Please choose both a day and a month.', 'error');

            const btn = document.getElementById('bdaySave');
            UIHelper.setButtonLoading(btn, true);
            try {
              const saved = await RewardsAPI.setBirthday(day, month);
              toast('Birthday saved!');
              renderBirthday(saved);
            } catch (err) {
              toast(errMsg(err, 'Could not save your birthday.'), 'error');
              UIHelper.setButtonLoading(btn, false);
            }
          });
        }
      }

      // ── Transaction history (paginated) ──────────────────────────
      const tbody     = document.getElementById('historyTableBody');
      const badge     = document.getElementById('historyBadge');
      const pagEl     = document.getElementById('historyPagination');
      const pageInfo  = document.getElementById('pageInfo');
      const pagePrev  = document.getElementById('pagePrev');
      const pageNext  = document.getElementById('pageNext');
      const PAGE_SIZE = 20;
      let currentPage = 1;

      async function loadHistory(page) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
        try {
          const { items, total, limit } = await RewardsAPI.getTransactions(page, PAGE_SIZE);
          badge.textContent = total;

          if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No reward activity yet — book a service to start earning! 💰</td></tr>';
            pagEl.style.display = 'none';
            return;
          }

          tbody.innerHTML = items.map(item => {
            const isPoints  = item.rewardType === 'POINTS';
            const amountNum = Number(item.amount || 0);
            const amountStr = isPoints
              ? `${amountNum >= 0 ? '+' : ''}${amountNum.toLocaleString('en-NG')} pts`
              : `${amountNum >= 0 ? '+' : ''}${fmtNaira(amountNum)}`;
            const balanceStr = isPoints
              ? `${Number(item.newBalance || 0).toLocaleString('en-NG')} pts`
              : fmtNaira(item.newBalance);
            const typeClass = `rwd-type-${item.transactionType || 'EARNED'}`;

            return `
              <tr>
                <td>${fmtDate(item.createdAt)}</td>
                <td><span class="rwd-type-pill ${typeClass}">${(item.transactionType || '').replace(/_/g, ' ')}</span></td>
                <td><span class="rwd-reward-kind">${isPoints ? 'Points' : 'Cashback'}</span></td>
                <td><span class="rwd-amount ${amountNum >= 0 ? 'positive' : 'negative'}">${amountStr}</span></td>
                <td>${balanceStr}</td>
                <td>${item.reason || '—'}</td>
              </tr>`;
          }).join('');

          const totalPages = Math.max(1, Math.ceil(total / (limit || PAGE_SIZE)));
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
          tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Could not load reward history.</td></tr>';
        }
      }

      pagePrev.addEventListener('click', () => { if (currentPage > 1) loadHistory(currentPage - 1); });
      pageNext.addEventListener('click', () => loadHistory(currentPage + 1));

      // ── Transfer Cashback modal ────────────────────────────────────
      const transferOverlay = document.getElementById('transferOverlay');
      const transferForm    = document.getElementById('transferForm');
      const transferAmount  = document.getElementById('transferAmount');
      const transferError   = document.getElementById('transferError');
      const transferSubmit  = document.getElementById('transferSubmit');

      function openTransfer() {
        transferForm.reset();
        transferError.classList.remove('is-visible');
        if (currentProfile) {
          document.getElementById('transferHint').textContent = `Available: ${fmtNaira(currentProfile.cashbackBalance)}`;
        }
        transferOverlay.classList.add('open');
      }
      function closeTransfer() { transferOverlay.classList.remove('open'); }

      document.getElementById('btnTransfer').addEventListener('click', openTransfer);
      document.getElementById('transferClose').addEventListener('click', closeTransfer);
      document.getElementById('transferCancel').addEventListener('click', closeTransfer);
      transferOverlay.addEventListener('click', (e) => { if (e.target === transferOverlay) closeTransfer(); });

      transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        transferError.classList.remove('is-visible');
        const amount = Number(transferAmount.value);
        const available = currentProfile ? Number(currentProfile.cashbackBalance) : 0;

        if (!amount || amount <= 0) {
          transferError.textContent = 'Enter an amount greater than zero.';
          transferError.classList.add('is-visible');
          return;
        }
        if (amount > available) {
          transferError.textContent = `You only have ${fmtNaira(available)} in cashback available.`;
          transferError.classList.add('is-visible');
          return;
        }

        UIHelper.setButtonLoading(transferSubmit, true);
        try {
          await RewardsAPI.transferCashback(amount);
          toast(`${fmtNaira(amount)} transferred to your Wallet!`);
          closeTransfer();
          await loadProfile();
          await loadHistory(1);
        } catch (err) {
          transferError.textContent = errMsg(err, 'Could not complete the transfer.');
          transferError.classList.add('is-visible');
        } finally {
          UIHelper.setButtonLoading(transferSubmit, false);
        }
      });

      // ── Redeem Points modal ────────────────────────────────────────
      const redeemOverlay = document.getElementById('redeemOverlay');
      const redeemForm    = document.getElementById('redeemForm');
      const redeemPoints  = document.getElementById('redeemPoints');
      const redeemError   = document.getElementById('redeemError');
      const redeemSubmit  = document.getElementById('redeemSubmit');

      function openRedeem() {
        redeemForm.reset();
        redeemError.classList.remove('is-visible');
        if (currentProfile) {
          document.getElementById('redeemHint').textContent = `Available: ${Number(currentProfile.loyaltyPoints || 0).toLocaleString('en-NG')} points`;
        }
        redeemOverlay.classList.add('open');
      }
      function closeRedeem() { redeemOverlay.classList.remove('open'); }

      document.getElementById('btnRedeem').addEventListener('click', openRedeem);
      document.getElementById('redeemClose').addEventListener('click', closeRedeem);
      document.getElementById('redeemCancel').addEventListener('click', closeRedeem);
      redeemOverlay.addEventListener('click', (e) => { if (e.target === redeemOverlay) closeRedeem(); });

      redeemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        redeemError.classList.remove('is-visible');
        const points = Math.floor(Number(redeemPoints.value));
        const available = currentProfile ? Number(currentProfile.loyaltyPoints || 0) : 0;

        if (!points || points <= 0) {
          redeemError.textContent = 'Enter a whole number of points greater than zero.';
          redeemError.classList.add('is-visible');
          return;
        }
        if (points > available) {
          redeemError.textContent = `You only have ${available.toLocaleString('en-NG')} points available.`;
          redeemError.classList.add('is-visible');
          return;
        }

        UIHelper.setButtonLoading(redeemSubmit, true);
        try {
          const result = await RewardsAPI.redeemPoints(points);
          toast(`${points.toLocaleString('en-NG')} points redeemed for ${fmtNaira(result.valueCredited)}!`);
          closeRedeem();
          await loadProfile();
          await loadHistory(1);
        } catch (err) {
          redeemError.textContent = errMsg(err, 'Could not complete the redemption.');
          redeemError.classList.add('is-visible');
        } finally {
          UIHelper.setButtonLoading(redeemSubmit, false);
        }
      });

      // ── Init ─────────────────────────────────────────────────────
      loadProfile();
      loadBirthday();
      loadHistory(1);
    });
