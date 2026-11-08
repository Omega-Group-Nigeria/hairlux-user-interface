/**
 * Hairlux web shop checkout (checkout.html): address, payment choice
 * (wallet, or Pay on Delivery: downpayment plus the full delivery fee now,
 * balance before delivery) and order placement. Every amount comes from
 * the server quote; the cart's own prices are only a preview.
 */
(function () {
  'use strict';
  var K = ShopKit, esc = K.esc;
  var $ = function (id) { return document.getElementById(id); };
  var IDEM_KEY = 'hairlux.shop.idem';
  var st = { addresses: [], addressId: '', method: 'WALLET', quote: null, wallet: null, error: '', busy: false };

  function items() {
    return K.readCart().map(function (l) { return { productId: l.productId, quantity: l.quantity }; });
  }

  function idemKey() {
    var k = null;
    try { k = sessionStorage.getItem(IDEM_KEY); } catch (_) { /* blocked */ }
    if (!k) {
      k = 'web-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      try { sessionStorage.setItem(IDEM_KEY, k); } catch (_) { /* blocked */ }
    }
    return k;
  }

  function addressLabel(a) {
    return (a.label ? a.label + ': ' : '') + (a.fullAddress || [a.streetAddress, a.city, a.state].filter(Boolean).join(', '));
  }

  function payOption(key, title, desc, enabled) {
    return '<label class="opt' + (enabled ? '' : ' disabled') + '"><input type="radio" name="pay" value="' + key + '"' + (st.method === key ? ' checked' : '') + (enabled ? '' : ' disabled') + '>' +
      '<div><div class="t">' + title + '</div><div class="d">' + desc + '</div></div></label>';
  }

  function render() {
    var lines = K.readCart();
    if (!lines.length) {
      $('co').innerHTML = '<div class="panel empty-box"><h3>Your cart is empty</h3><p>Add something from the shop first.</p><a class="btn-shop" href="shop.html">Go to the shop</a></div>';
      return;
    }
    var q = st.quote;
    var pod = q && q.payment && q.payment.payOnDelivery;
    if (pod && !pod.available && st.method === 'PAY_ON_DELIVERY') st.method = 'WALLET';
    var payNow = q ? (st.method === 'PAY_ON_DELIVERY' && pod && pod.available ? pod.payNow : q.payment.wallet.payNow) : null;
    var short = q && st.wallet !== null && payNow > st.wallet;

    var addr = st.addresses.length
      ? st.addresses.map(function (a) {
          return '<label class="opt"><input type="radio" name="addr" value="' + esc(a.id) + '"' + (st.addressId === a.id ? ' checked' : '') + '><div><div class="t">' + esc(a.label || 'Address') + '</div><div class="d">' + esc(a.fullAddress || addressLabel(a)) + '</div></div></label>';
        }).join('') + '<a class="small" href="address.html" style="color:var(--gold)">Add or edit addresses</a>'
      : '<div class="note warn"><strong>No delivery address yet</strong>Add one to continue.</div><a class="btn-shop ghost sm" href="address.html">Add an address</a>';

    var cartHtml = lines.map(function (l) {
      var ql = q && q.items ? q.items.find(function (x) { return x.productId === l.productId; }) : null;
      return '<div class="cart-line"><div class="img" style="' + (l.imageUrl ? "background-image:url('" + esc(l.imageUrl) + "')" : '') + '"></div>' +
        '<div><div class="nm">' + esc(ql ? ql.name : l.name) + '</div><div class="meta">' + l.quantity + ' x ' + K.ngn(ql ? ql.price : l.price) + '</div></div>' +
        '<div class="side"><strong>' + K.ngn(ql ? ql.lineTotal : l.price * l.quantity) + '</strong></div></div>';
    }).join('');

    var summary = '';
    if (st.error) {
      summary = '<div class="note bad">' + esc(st.error) + '</div><a class="btn-shop ghost block" href="shop.html">Edit cart</a>';
    } else if (!q) {
      summary = st.addressId ? '<div class="spin"></div>' : '<div class="small muted">Choose a delivery address to see delivery and payment options.</div>';
    } else {
      summary =
        payOption('WALLET', 'Pay now from wallet', 'Pay ' + K.ngn(q.payment.wallet.payNow) + ' now.', true) +
        payOption('PAY_ON_DELIVERY', 'Pay on Delivery',
          pod.available
            ? 'Pay ' + K.ngn(pod.payNow) + ' now (' + pod.downpaymentPercent + '% of items plus delivery). Pay the balance of ' + K.ngn(pod.balanceDue) + ' before your order is handed over.'
            : esc(pod.reason || 'Not available for this order.'), !!pod.available) +
        '<div style="margin-top:14px">' +
        '<div class="sum-row"><span>Items</span><span>' + K.ngn(q.subtotal) + '</span></div>' +
        '<div class="sum-row"><span>Delivery' + (q.shipments > 1 ? ' (' + q.shipments + ' deliveries)' : '') + '</span><span>' + K.ngn(q.deliveryFee) + '</span></div>' +
        '<div class="sum-row total"><span>Total</span><span>' + K.ngn(q.totalAmount) + '</span></div>' +
        '<div class="sum-row" style="font-weight:600"><span>Pay now</span><span>' + K.ngn(payNow) + '</span></div>' +
        (st.method === 'PAY_ON_DELIVERY' && pod.available ? '<div class="sum-row"><span>Pay before delivery</span><span>' + K.ngn(pod.balanceDue) + '</span></div>' : '') +
        '</div>' +
        (q.shipments > 1 ? '<div class="small muted" style="margin:8px 0">Your items may arrive in ' + q.shipments + ' separate deliveries.</div>' : '') +
        '<div class="small muted" style="margin:10px 0">Wallet balance: <strong>' + (st.wallet === null ? '-' : K.ngn(st.wallet)) + '</strong></div>' +
        (short ? '<div class="note warn"><strong>Not enough in your wallet</strong>Fund your wallet with at least ' + K.ngn(payNow - st.wallet) + ' to place this order. <a href="index.html" style="color:inherit;text-decoration:underline">Fund wallet</a></div>' : '') +
        '<button class="btn-shop block" id="place" type="button"' + (short || st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Placing order...' : 'Place order') + '</button>' +
        '<div class="small muted" style="margin-top:10px">You will get a 6-digit delivery code. Give it to the rider only when you receive your items.</div>';
    }

    $('co').innerHTML = '<div class="co-grid"><div>' +
      '<div class="panel"><h3>Delivery address</h3>' + addr + '</div>' +
      '<div class="panel"><h3>Items</h3>' + cartHtml + '<a class="small" href="shop.html" style="color:var(--gold)">Edit cart</a></div>' +
      '</div><div class="sticky"><div class="panel"><h3>Payment</h3>' + summary + '</div></div></div>';

    document.querySelectorAll('input[name=addr]').forEach(function (r) {
      r.addEventListener('change', function () { st.addressId = r.value; quote(); });
    });
    document.querySelectorAll('input[name=pay]').forEach(function (r) {
      r.addEventListener('change', function () { st.method = r.value; render(); });
    });
    if ($('place')) $('place').addEventListener('click', place);
  }

  async function quote() {
    st.quote = null; st.error = '';
    render();
    try {
      st.quote = await K.api('/shop/orders/quote', { method: 'POST', body: JSON.stringify({ addressId: st.addressId, channel: 'web', items: items() }) });
    } catch (e) {
      st.error = K.errMsg(e);
    }
    render();
  }

  async function place() {
    if (st.busy) return;
    st.busy = true; render();
    try {
      var res = await K.api('/shop/orders', {
        method: 'POST',
        body: JSON.stringify({ addressId: st.addressId, channel: 'web', paymentMethod: st.method, items: items(), idempotencyKey: idemKey() }),
      });
      try { sessionStorage.removeItem(IDEM_KEY); } catch (_) { /* blocked */ }
      K.clearCart();
      location.href = 'shop-orders.html?id=' + encodeURIComponent(res.order.id) + '&placed=1';
    } catch (e) {
      st.busy = false;
      K.toast(K.errMsg(e), 'error');
      // Prices, stock or the wallet may have changed: refresh the quote and balance.
      loadWallet().then(quote);
    }
  }

  async function loadWallet() {
    try { st.wallet = (await WalletAPI.getBalance()).balance; } catch (_) { st.wallet = null; }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof APIHelper === 'undefined' || !APIHelper.isAuthenticated()) return;
    if (!K.readCart().length) { render(); return; }
    try { st.addresses = await AddressAPI.getAll(); } catch (_) { st.addresses = []; }
    var def = st.addresses.find(function (a) { return a.isDefault; }) || st.addresses[0];
    st.addressId = def ? def.id : '';
    await loadWallet();
    if (st.addressId) quote(); else render();
  });
})();
