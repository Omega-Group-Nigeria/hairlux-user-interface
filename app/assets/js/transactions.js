    document.addEventListener('DOMContentLoaded', function () {
      const state = {
        all: [],
        filtered: [],
        page: 1,
        pageSize: 8,
        search: '',
        type: 'all',
        status: 'all'
      };

      const txSearch = document.getElementById('txSearch');
      const txTypeFilter = document.getElementById('txTypeFilter');
      const txStatusFilter = document.getElementById('txStatusFilter');
      const txTableBody = document.getElementById('txTableBody');
      const txPaginationInfo = document.getElementById('txPaginationInfo');
      const txPrevPage = document.getElementById('txPrevPage');
      const txNextPage = document.getElementById('txNextPage');
      const txPageNumbers = document.getElementById('txPageNumbers');

      function formatAmount(value, type) {
        const sign = type === 'debit' ? '-' : '';
        return `${sign}₦${Number(value || 0).toLocaleString()}`;
      }

      function normalizeStatus(value) {
        const status = String(value || '').trim().toLowerCase();
        if (!status) return 'pending';
        if (status === 'successful' || status === 'success' || status === 'complete' || status === 'completed') {
          return 'completed';
        }
        if (status === 'failed' || status === 'error') return 'failed';
        if (status === 'cancelled' || status === 'canceled') return 'cancelled';
        return status;
      }

      function inferDirection(transactionType, amount, description) {
        const kind = String(transactionType || '').toUpperCase();
        if (/DEPOSIT|CREDIT|REFUND|REVERSAL|BONUS|TOPUP/.test(kind)) return 'credit';
        if (/WITHDRAWAL|DEBIT|PAYMENT|BOOKING|CHARGE|FEE/.test(kind)) return 'debit';

        const nAmount = Number(amount || 0);
        if (Number.isFinite(nAmount) && nAmount < 0) return 'debit';
        if (Number.isFinite(nAmount) && nAmount > 0) return 'credit';

        const text = String(description || '').toLowerCase();
        if (/deposit|credit|refund/.test(text)) return 'credit';
        if (/withdraw|debit|payment|booking|charge|fee/.test(text)) return 'debit';
        return 'debit';
      }

      function titleCase(value) {
        return String(value || '')
          .replace(/[_-]+/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      }

      function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleString('en-NG', {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
      }

      function normalizeTx(tx) {
        const transactionType = String(tx.transactionType || tx.type || '').trim().toUpperCase() || 'TRANSACTION';
        const direction = (tx.type === 'credit' || tx.type === 'debit')
          ? tx.type
          : inferDirection(transactionType, tx.amount, tx.description || tx.title || tx.narration || '');
        const paymentMethod = String(tx.paymentMethod || tx.payment_method || '').trim().toUpperCase() || '-';
        const isBookingPayment = transactionType === 'BOOKING_PAYMENT';
        return {
          id: tx.id || tx.transactionId || `tx_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: tx.createdAt || tx.date || new Date().toISOString(),
          description: tx.description || tx.title || tx.narration || 'Transaction',
          type: direction,
          transactionType,
          isBookingPayment,
          paymentMethod,
          status: normalizeStatus(tx.status || 'pending'),
          amount: Number(tx.amount || 0),
          reference: tx.reference || tx.id || '-'
        };
      }

      function populateTypeOptions() {
        const currentValue = txTypeFilter.value;
        const uniqueTypes = Array.from(new Set(
          state.all
            .map(function (tx) { return String(tx.transactionType || '').trim().toUpperCase(); })
            .filter(Boolean)
        )).sort();

        const options = ['<option value="all">All Types</option>']
          .concat(uniqueTypes.map(function (txType) {
            return `<option value="${txType.toLowerCase()}">${titleCase(txType)}</option>`;
          }));

        txTypeFilter.innerHTML = options.join('');

        if (currentValue && txTypeFilter.querySelector(`option[value="${currentValue}"]`)) {
          txTypeFilter.value = currentValue;
        } else {
          txTypeFilter.value = 'all';
          state.type = 'all';
        }
      }

      async function loadTransactions() {
        try {
          if (typeof WalletAPI === 'undefined') {
            state.all = [];
            if (typeof UIHelper !== 'undefined') {
              UIHelper.showToast('Wallet helper not loaded.', 'error');
            }
            return;
          }

          const result = await WalletAPI.getTransactions({ page: 1, limit: 20 });
          const rows = Array.isArray(result.transactions) ? result.transactions : [];

          state.all = rows.length ? rows.map(normalizeTx) : [];
          populateTypeOptions();
        } catch (error) {
          state.all = [];
          populateTypeOptions();
          if (typeof UIHelper !== 'undefined') {
            const message = Array.isArray(error && error.message)
              ? error.message.join(', ')
              : ((error && error.message) || 'Unable to load transactions from server.');
            UIHelper.showToast(message, 'error');
          }
        }
      }

      function applyFilters() {
        const q = state.search.trim().toLowerCase();

        state.filtered = state.all.filter((tx) => {
          const matchType = state.type === 'all' || String(tx.transactionType || '').toLowerCase() === state.type;
          const matchStatus = state.status === 'all' || tx.status === state.status;
          const hay = `${tx.description} ${tx.reference} ${tx.paymentMethod} ${tx.transactionType} ${formatDate(tx.createdAt)}`.toLowerCase();
          const matchSearch = !q || hay.includes(q);
          return matchType && matchStatus && matchSearch;
        });

        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;
      }

      function renderRows() {
        if (!state.filtered.length) {
          txTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No transactions....</td></tr>`;
          return;
        }

        const start = (state.page - 1) * state.pageSize;
        const pageRows = state.filtered.slice(start, start + state.pageSize);

        txTableBody.innerHTML = pageRows.map((tx) => {
          const bookingPaymentClass = tx.isBookingPayment ? ' booking-payment' : '';
          return `
          <tr>
            <td>
              <div class="tx-description">${tx.description}</div>
            </td>
            <td>${tx.reference}</td>
            <td><span class="tx-pill type-${tx.type}${bookingPaymentClass}">${titleCase(tx.transactionType)}</span></td>
            <td><span class="tx-pill method-${String(tx.paymentMethod || '').toLowerCase()}">${tx.paymentMethod}</span></td>
            <td><span class="tx-pill status-${tx.status}">${titleCase(tx.status)}</span></td>
            <td class="tx-amount ${tx.type}${bookingPaymentClass}">${formatAmount(tx.amount, tx.type)}</td>
            <td>${formatDate(tx.createdAt)}</td>
          </tr>
        `;
        }).join('');
      }

      function renderPagination() {
        const total = state.filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
        const start = total ? ((state.page - 1) * state.pageSize) + 1 : 0;
        const end = Math.min(state.page * state.pageSize, total);

        txPaginationInfo.textContent = `Showing ${start}-${end} of ${total} transactions`;

        txPrevPage.disabled = state.page <= 1;
        txNextPage.disabled = state.page >= totalPages;

        const pages = [];
        const from = Math.max(1, state.page - 1);
        const to = Math.min(totalPages, state.page + 1);
        for (let p = from; p <= to; p += 1) {
          pages.push(`<button type="button" class="page-btn ${p === state.page ? 'active' : ''}" data-page="${p}">${p}</button>`);
        }
        txPageNumbers.innerHTML = pages.join('');
      }

      function render() {
        applyFilters();
        renderRows();
        renderPagination();
      }

      txSearch.addEventListener('input', function () {
        state.search = this.value || '';
        state.page = 1;
        render();
      });

      txTypeFilter.addEventListener('change', function () {
        state.type = this.value;
        state.page = 1;
        render();
      });

      txStatusFilter.addEventListener('change', function () {
        state.status = this.value;
        state.page = 1;
        render();
      });

      txPrevPage.addEventListener('click', function () {
        if (state.page > 1) {
          state.page -= 1;
          render();
        }
      });

      txNextPage.addEventListener('click', function () {
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        if (state.page < totalPages) {
          state.page += 1;
          render();
        }
      });

      txPageNumbers.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-page]');
        if (!btn) return;
        const page = Number(btn.getAttribute('data-page'));
        if (!Number.isNaN(page)) {
          state.page = page;
          render();
        }
      });

      txTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading transactions...</td></tr>';
      loadTransactions().then(render);
    });