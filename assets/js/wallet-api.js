/**
 * HairLux Wallet Helper
 * Fetches wallet balance and transactions for authenticated users.
 */

(function () {
  'use strict';

  function extractData(payload) {
    if (!payload) return {};
    return payload.data && typeof payload.data === 'object' ? payload.data : payload;
  }

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function formatNaira(amount) {
    return `₦${toNumber(amount).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return 'Recently';
    }

    return date.toLocaleDateString('en-NG', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const DEPOSIT_PROVIDER_FALLBACK = 'paystack';
  const DEPOSIT_SESSION_KEY = 'hairlux.wallet.deposit.pending';

  function normalizeProvider(provider) {
    const candidate = String(provider || '').trim().toLowerCase();
    return candidate === 'monnify' ? 'monnify' : 'paystack';
  }

  function isFailedDepositStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    return value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled' || value === 'abandoned';
  }

  function normalizeTransactionStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (!value) return 'pending';
    if (value === 'successful' || value === 'success' || value === 'complete' || value === 'completed') {
      return 'completed';
    }
    if (value === 'failed' || value === 'error') return 'failed';
    if (value === 'cancelled' || value === 'canceled') return 'cancelled';
    return value;
  }

  function inferTransactionDirection(transactionType, amount, description) {
    const kind = String(transactionType || '').toUpperCase();
    if (/DEPOSIT|CREDIT|REFUND|REVERSAL|BONUS|TOPUP/.test(kind)) return 'credit';
    if (/WITHDRAWAL|DEBIT|PAYMENT|BOOKING|CHARGE|FEE/.test(kind)) return 'debit';

    if (toNumber(amount, 0) < 0) return 'debit';
    if (toNumber(amount, 0) > 0) return 'credit';

    const text = String(description || '').toLowerCase();
    if (/deposit|credit|refund/.test(text)) return 'credit';
    if (/withdraw|debit|payment|booking|charge|fee/.test(text)) return 'debit';
    return 'debit';
  }

  function normalizeTransaction(tx) {
    const status = normalizeTransactionStatus(tx.status || 'pending');
    const transactionType = String(tx.transactionType || tx.type || '').trim().toUpperCase() || 'TRANSACTION';
    const amount = Math.abs(toNumber(tx.amount));
    const direction = inferTransactionDirection(transactionType, tx.amount, tx.description || tx.title || tx.narration || '');
    const paymentMethod = String(tx.paymentMethod || tx.payment_method || '').trim().toUpperCase();

    return {
      id: tx.id || tx.transactionId || tx.reference || `tx_${Math.random().toString(36).slice(2, 9)}`,
      description: tx.description || tx.title || tx.narration || 'Transaction',
      createdAt: tx.createdAt || tx.date || tx.transactionDate || new Date().toISOString(),
      amount,
      type: direction,
      transactionType,
      status,
      paymentMethod: paymentMethod || '-',
      reference: tx.reference || tx.id || '-'
    };
  }

  function getTransactionRowsFromResponse(response) {
    const data = extractData(response);

    if (Array.isArray(data.transactions)) return data.transactions;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data)) return data;

    return [];
  }

  const WalletAPI = {
    async getBalance() {
      if (typeof APIHelper === 'undefined' || typeof API_CONFIG === 'undefined') {
        throw new Error('Wallet dependencies are not loaded.');
      }

      const response = await APIHelper.request(`${API_CONFIG.ENDPOINTS.WALLET}/balance`, {
        method: 'GET'
      });

      const data = extractData(response);
      const balance = toNumber(
        data.balance ?? data.availableBalance ?? data.walletBalance ?? data.amount ?? 0,
        0
      );

      return {
        balance,
        raw: response
      };
    },

    async getTransactions(options = {}) {
      if (typeof APIHelper === 'undefined' || typeof API_CONFIG === 'undefined') {
        throw new Error('Wallet dependencies are not loaded.');
      }

      const page = Math.max(1, Number(options.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(options.limit) || 5));
      const query = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });

      if (options.status && options.status !== 'all') {
        query.set('status', String(options.status));
      }

      if (options.type && options.type !== 'all') {
        query.set('type', String(options.type));
      }

      if (options.search && String(options.search).trim()) {
        query.set('search', String(options.search).trim());
      }

      const response = await APIHelper.request(
        `${API_CONFIG.ENDPOINTS.WALLET}/transactions?${query.toString()}`,
        { method: 'GET' }
      );

      const rows = getTransactionRowsFromResponse(response).map(normalizeTransaction);
      rows.sort(function (a, b) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return {
        transactions: rows,
        raw: response
      };
    },

    async getRecentTransactions(limit = 5) {
      const result = await this.getTransactions({ page: 1, limit });
      return {
        transactions: result.transactions.slice(0, limit),
        raw: result.raw
      };
    },

    async initializeDeposit(amount, provider) {
      if (typeof APIHelper === 'undefined' || typeof API_CONFIG === 'undefined') {
        throw new Error('Wallet dependencies are not loaded.');
      }

      const numericAmount = Math.round(toNumber(amount, 0));
      const providerName = normalizeProvider(provider || DEPOSIT_PROVIDER_FALLBACK);
      if (!numericAmount || numericAmount < 1) {
        throw new Error('Please enter a valid deposit amount.');
      }

      const response = await APIHelper.request(`${API_CONFIG.ENDPOINTS.WALLET}/deposit/initialize`, {
        method: 'POST',
        body: JSON.stringify({
          amount: numericAmount,
          provider: providerName
        })
      });

      const data = extractData(response);
      const normalizedProvider = normalizeProvider(data.provider || providerName);
      const paymentUrl = normalizedProvider === 'monnify'
        ? (
          data.checkoutUrl ||
          data.checkout_url ||
          data.paymentUrl ||
          data.url ||
          null
        )
        : (
          data.authorization_url ||
          data.authorizationUrl ||
          data.paymentUrl ||
          data.url ||
          null
        );
      const reference = data.reference || data.walletReference || data.wallet_reference || null;

      if (!paymentUrl) {
        throw new Error('Could not start deposit. Payment URL not returned by server.');
      }

      if (!reference) {
        throw new Error('Could not start deposit. Wallet reference not returned by server.');
      }

      return {
        provider: normalizedProvider,
        paymentUrl,
        reference,
        paymentReference: data.paymentReference || data.payment_reference || data.transactionReference || null,
        accessCode: data.access_code || data.accessCode || null,
        raw: response
      };
    },

    async verifyDeposit(reference, provider) {
      if (typeof APIHelper === 'undefined' || typeof API_CONFIG === 'undefined') {
        throw new Error('Wallet dependencies are not loaded.');
      }

      if (!reference) {
        throw new Error('Missing payment reference for verification.');
      }

      return APIHelper.request(`${API_CONFIG.ENDPOINTS.WALLET}/deposit/verify`, {
        method: 'POST',
        body: JSON.stringify({
          reference,
          provider: normalizeProvider(provider || DEPOSIT_PROVIDER_FALLBACK)
        })
      });
    },

    formatNaira,
    formatDate
  };

  const WalletDashboard = {
    activeDepositReference: '',
    activeDepositProvider: DEPOSIT_PROVIDER_FALLBACK,

    getDepositModalEls() {
      return {
        modal: document.getElementById('walletDepositModal'),
        amountInput: document.getElementById('walletDepositAmount'),
        providerInputs: document.querySelectorAll('input[name="walletDepositProvider"]'),
        cancelBtn: document.getElementById('walletDepositCancel'),
        proceedBtn: document.getElementById('walletDepositProceed')
      };
    },

    getSelectedDepositProvider(depositEls) {
      if (!depositEls || !depositEls.providerInputs || !depositEls.providerInputs.length) {
        return DEPOSIT_PROVIDER_FALLBACK;
      }

      const checked = Array.prototype.find.call(depositEls.providerInputs, function (input) {
        return input && input.checked && !input.disabled;
      });

      if (!checked) {
        const firstEnabled = Array.prototype.find.call(depositEls.providerInputs, function (input) {
          return input && !input.disabled;
        });
        if (firstEnabled) {
          firstEnabled.checked = true;
          return normalizeProvider(firstEnabled.value);
        }
      }

      return normalizeProvider(checked ? checked.value : DEPOSIT_PROVIDER_FALLBACK);
    },

    setSelectedDepositProvider(provider, depositEls) {
      if (!depositEls || !depositEls.providerInputs || !depositEls.providerInputs.length) {
        return;
      }

      const normalized = normalizeProvider(provider);
      let selectedInput = null;

      Array.prototype.forEach.call(depositEls.providerInputs, function (input) {
        const shouldSelect = !input.disabled && normalizeProvider(input.value) === normalized;
        input.checked = shouldSelect;
        if (shouldSelect) selectedInput = input;
      });

      if (!selectedInput) {
        const firstEnabled = Array.prototype.find.call(depositEls.providerInputs, function (input) {
          return input && !input.disabled;
        });
        if (firstEnabled) {
          firstEnabled.checked = true;
        }
      }
    },

    savePendingDeposit(reference, provider) {
      if (!reference) return;
      try {
        window.sessionStorage.setItem(DEPOSIT_SESSION_KEY, JSON.stringify({
          reference,
          provider: normalizeProvider(provider),
          createdAt: Date.now()
        }));
      } catch (_) {
        // Ignore storage failures and continue flow.
      }
    },

    readPendingDeposit() {
      try {
        const raw = window.sessionStorage.getItem(DEPOSIT_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.reference) return null;
        return {
          reference: String(parsed.reference),
          provider: normalizeProvider(parsed.provider)
        };
      } catch (_) {
        return null;
      }
    },

    clearPendingDeposit() {
      try {
        window.sessionStorage.removeItem(DEPOSIT_SESSION_KEY);
      } catch (_) {
        // Ignore storage failures.
      }
    },

    getSuccessModalEls() {
      return {
        modal: document.getElementById('walletDepositSuccessModal'),
        closeBtn: document.getElementById('walletSuccessClose'),
        referenceEl: document.getElementById('walletSuccessReference')
      };
    },

    openModal(modal) {
      if (!modal) return;
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    },

    closeModal(modal) {
      if (!modal) return;
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      if (!document.querySelector('.wallet-modal.show')) {
        document.body.style.overflow = '';
      }
    },

    renderBalanceLoading() {
      const balanceEl = document.getElementById('walletBalanceAmount');
      if (!balanceEl) return;
      balanceEl.textContent = '...';
    },

    setDepositLoading(isLoading) {
      const buttons = document.querySelectorAll('[data-wallet-deposit]');
      const depositEls = this.getDepositModalEls();

      buttons.forEach(function (button) {
        if (isLoading) {
          button.setAttribute('aria-disabled', 'true');
          button.classList.add('is-loading');
          if (!button.dataset.originalLabel) {
            button.dataset.originalLabel = button.textContent.trim();
          }
          const textNode = button.querySelector('div');
          if (textNode) {
            textNode.textContent = 'Loading....';
          } else {
            button.textContent = 'Loading....';
          }
          button.style.pointerEvents = 'none';
          button.style.opacity = '0.7';
        } else {
          button.removeAttribute('aria-disabled');
          button.classList.remove('is-loading');
          const original = button.dataset.originalLabel || 'Deposit';
          const textNode = button.querySelector('div');
          if (textNode) {
            textNode.textContent = original;
          } else {
            button.textContent = original;
          }
          button.style.pointerEvents = '';
          button.style.opacity = '';
        }
      });

      if (depositEls.proceedBtn) {
        if (isLoading) {
          depositEls.proceedBtn.setAttribute('aria-disabled', 'true');
          depositEls.proceedBtn.style.pointerEvents = 'none';
          depositEls.proceedBtn.style.opacity = '0.75';
          if (!depositEls.proceedBtn.dataset.originalLabel) {
            depositEls.proceedBtn.dataset.originalLabel = depositEls.proceedBtn.textContent.trim();
          }
          const proceedText = depositEls.proceedBtn.querySelector('div');
          if (proceedText) proceedText.textContent = 'Loading....';
        } else {
          depositEls.proceedBtn.removeAttribute('aria-disabled');
          depositEls.proceedBtn.style.pointerEvents = '';
          depositEls.proceedBtn.style.opacity = '';
          const proceedText = depositEls.proceedBtn.querySelector('div');
          if (proceedText) proceedText.textContent = depositEls.proceedBtn.dataset.originalLabel || 'Deposit';
        }
      }

      if (depositEls.cancelBtn) {
        depositEls.cancelBtn.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
        depositEls.cancelBtn.style.pointerEvents = isLoading ? 'none' : '';
        depositEls.cancelBtn.style.opacity = isLoading ? '0.65' : '';
      }

      if (depositEls.amountInput) {
        depositEls.amountInput.disabled = Boolean(isLoading);
      }

      if (depositEls.providerInputs && depositEls.providerInputs.length) {
        Array.prototype.forEach.call(depositEls.providerInputs, function (input) {
          input.disabled = Boolean(isLoading);
        });
      }
    },

    renderBalance(balance) {
      const balanceEl = document.getElementById('walletBalanceAmount');
      if (!balanceEl) return;
      balanceEl.textContent = WalletAPI.formatNaira(balance);
    },

    renderTransactions(transactions) {
      const listEl = document.getElementById('recentTransactionsList');
      if (!listEl) return;

      if (!transactions.length) {
        listEl.innerHTML = `
          <div class="transaction-item">
            <div class="transaction-info">
              <div class="p-s">No transactions yet</div>
              <div class="p-small">Your latest wallet activity will appear here.</div>
            </div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = transactions.map(function (tx) {
        const statusRaw = (tx.status || '').toLowerCase();
        const statusNormalized = statusRaw === 'successful' ? 'completed' : statusRaw || 'pending';
        const statusLabel = statusNormalized.charAt(0).toUpperCase() + statusNormalized.slice(1);
        const paymentMethod = String(tx.paymentMethod || '').toUpperCase();

        const amountClass = statusNormalized === 'pending'
          ? 'pending'
          : (tx.type === 'credit' ? 'positive' : 'negative');

        const sign = statusNormalized === 'pending'
          ? ''
          : (tx.type === 'debit' ? '-' : '');

        const label = tx.status && statusNormalized !== 'completed'
          ? `${tx.description} (${tx.status})`
          : tx.description;

        return `
          <div class="transaction-item">
            <div class="transaction-info">
              <div class="p-s">${label}</div>
              <div class="p-small transaction-meta">
                <span>${WalletAPI.formatDate(tx.createdAt)}</span>
                ${paymentMethod && paymentMethod !== '-' ? `<span>${paymentMethod}</span>` : ''}
                <span class="tx-status ${statusNormalized}">${statusLabel}</span>
              </div>
            </div>
            <div class="transaction-amount ${amountClass}">${sign}${WalletAPI.formatNaira(tx.amount)}</div>
          </div>
        `;
      }).join('');
    },

    async refreshWalletData() {
      const [balanceResult, txResult] = await Promise.all([
        WalletAPI.getBalance(),
        WalletAPI.getRecentTransactions(5)
      ]);

      this.renderBalance(balanceResult.balance);
      this.renderTransactions(txResult.transactions);
    },

    cleanCallbackQuery() {
      if (window.history && typeof window.history.replaceState === 'function') {
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    },

    handleOpenDepositPrompt() {
      const params = new URLSearchParams(window.location.search);
      const shouldOpen = params.get('openDeposit');
      if (!(shouldOpen === '1' || shouldOpen === 'true')) {
        return;
      }

      const depositEls = this.getDepositModalEls();
      if (!depositEls.modal) {
        return;
      }

      const rawAmount = Number(params.get('amount') || 0);
      if (depositEls.amountInput && Number.isFinite(rawAmount) && rawAmount > 0) {
        depositEls.amountInput.value = String(Math.ceil(rawAmount));
      }

      this.openModal(depositEls.modal);

      const reason = params.get('reason');
      if (reason === 'booking-payment' && typeof UIHelper !== 'undefined' && UIHelper.showToast) {
        UIHelper.showToast('Your wallet balance is low. Please deposit and continue payment.', 'info', 3600);
      }

      this.cleanCallbackQuery();
    },

    showDepositSuccessModal(reference) {
      const els = this.getSuccessModalEls();
      if (!els.modal) {
        if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
          UIHelper.showToast('Deposit successful.', 'success');
        }
        return;
      }

      if (els.referenceEl) {
        els.referenceEl.textContent = reference || '-';
      }

      this.openModal(els.modal);
    },

    async handleDepositCallback() {
      const params = new URLSearchParams(window.location.search);
      const pendingDeposit = this.readPendingDeposit();
      const status = (
        params.get('status') ||
        params.get('paymentStatus') ||
        params.get('payment_status') ||
        params.get('transactionStatus') ||
        ''
      ).toLowerCase();
      const reference =
        params.get('walletReference') ||
        params.get('wallet_reference') ||
        (pendingDeposit && pendingDeposit.reference) ||
        params.get('reference') ||
        params.get('trxref');
      const provider = normalizeProvider(
        params.get('provider') ||
        params.get('paymentProvider') ||
        (pendingDeposit && pendingDeposit.provider) ||
        DEPOSIT_PROVIDER_FALLBACK
      );

      if (!reference) return;

      try {
        if (status && isFailedDepositStatus(status)) {
          if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
            UIHelper.showToast('Deposit was not completed.', 'info');
          }
          this.clearPendingDeposit();
          return;
        }

        const response = await WalletAPI.verifyDeposit(reference, provider);
        const verified = extractData(response);
        const message = response && response.message ? response.message : 'Deposit verified successfully.';
        this.showDepositSuccessModal(verified.reference || reference);
        if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
          UIHelper.showToast(message, 'success', 2000);
        }
      } catch (error) {
        // Verification can fail if already verified; still continue with data refresh.
        if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
          const message = error && error.message ? error.message : 'Could not verify deposit automatically.';
          UIHelper.showToast(message, 'info');
        }
      } finally {
        this.clearPendingDeposit();
        this.cleanCallbackQuery();
      }
    },

    bindDepositActions() {
      const self = this;
      const depositButtons = document.querySelectorAll('[data-wallet-deposit]');
      const depositEls = self.getDepositModalEls();
      const successEls = self.getSuccessModalEls();

      if (depositEls.cancelBtn && depositEls.modal) {
        depositEls.cancelBtn.addEventListener('click', function (event) {
          event.preventDefault();
          self.closeModal(depositEls.modal);
        });
      }

      if (depositEls.modal) {
        depositEls.modal.addEventListener('click', function (event) {
          if (event.target === depositEls.modal) {
            self.closeModal(depositEls.modal);
          }
        });
      }

      if (successEls.closeBtn && successEls.modal) {
        successEls.closeBtn.addEventListener('click', function (event) {
          event.preventDefault();
          self.closeModal(successEls.modal);
        });
      }

      if (successEls.modal) {
        successEls.modal.addEventListener('click', function (event) {
          if (event.target === successEls.modal) {
            self.closeModal(successEls.modal);
          }
        });
      }

      if (depositEls.proceedBtn) {
        depositEls.proceedBtn.addEventListener('click', async function (event) {
          event.preventDefault();

          const rawAmount = depositEls.amountInput ? depositEls.amountInput.value : '';
          const amount = Number(String(rawAmount).replace(/[^\d.]/g, ''));
          const selectedProvider = self.getSelectedDepositProvider(depositEls);
          if (!Number.isFinite(amount) || amount <= 0) {
            if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
              UIHelper.showToast('Please enter a valid deposit amount.', 'error');
            }
            return;
          }

          try {
            self.setDepositLoading(true);
            const initResult = await WalletAPI.initializeDeposit(amount, selectedProvider);
            self.activeDepositReference = initResult.reference || '';
            self.activeDepositProvider = normalizeProvider(initResult.provider || selectedProvider);
            self.savePendingDeposit(self.activeDepositReference, self.activeDepositProvider);
            window.location.href = initResult.paymentUrl;
          } catch (error) {
            if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
              UIHelper.showToast(error && error.message ? error.message : 'Failed to start deposit.', 'error');
            }
            self.setDepositLoading(false);
          }
        });
      }

      depositButtons.forEach(function (button) {
        button.addEventListener('click', async function (event) {
          event.preventDefault();
          if (depositEls.amountInput) {
            depositEls.amountInput.value = '';
          }
          self.setSelectedDepositProvider(DEPOSIT_PROVIDER_FALLBACK, depositEls);
          self.openModal(depositEls.modal);
        });
      });
    },

    async init() {
      this.bindDepositActions();
      this.renderBalanceLoading();

      try {
        await this.handleDepositCallback();
        this.handleOpenDepositPrompt();
        await this.refreshWalletData();
      } catch (error) {
        this.renderBalance(0);
        this.renderTransactions([]);

        if (typeof UIHelper !== 'undefined' && UIHelper.showToast) {
          UIHelper.showToast(error && error.message ? error.message : 'Failed to load wallet data.', 'error');
        }
      }
    }
  };

  window.WalletAPI = WalletAPI;
  window.WalletDashboard = WalletDashboard;
})();
