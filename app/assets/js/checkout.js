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
  var PAY_REF_KEY = 'hairlux.shop.payref';
  // payWith: when the wallet is short, the rest is paid by card/bank (Paystack or Monnify).
  var st = { addresses: [], addressId: '', method: 'WALLET', payWith: 'paystack', quote: null, wallet: null, error: '', busy: false, confirming: null };

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

  function gatewayOption(key, title, desc) {
    return '<label class="opt"><input type="radio" name="gw" value="' + key + '"' + (st.payWith === key ? ' checked' : '') + '>' +
      '<div><div class="t">' + title + '</div><div class="d">' + desc + '</div></div></label>';
  }

  function render() {
    if (st.confirming) {
      $('co').innerHTML = '<div class="panel" style="max-width:560px;margin:0 auto;text-align:center">' +
        (st.confirming.done ? '' : '<div class="spin"></div>') +
        '<h3 style="margin-top:12px">' + esc(st.confirming.title) + '</h3><p class="muted">' + esc(st.confirming.text) + '</p>' +
        (st.confirming.done ? '<a class="btn-shop" href="' + esc(st.confirming.href || 'checkout.html') + '">' + esc(st.confirming.cta || 'Back to checkout') + '</a>' : '') +
        '</div>';
      return;
    }
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
        (short
          ? '<div class="note warn"><strong>Pay the rest by card or bank</strong>' +
            (st.wallet > 0 ? 'Your wallet covers ' + K.ngn(st.wallet) + '. ' : '') +
            'Pay the remaining ' + K.ngn(remaining(payNow)) + ' with:</div>' +
            gatewayOption('paystack', 'Paystack', 'Card, bank transfer or USSD.') +
            gatewayOption('monnify', 'Monnify', 'Card, bank transfer or USSD.')
          : '') +
        '<button class="btn-shop block" id="place" type="button"' + (st.busy ? ' disabled' : '') + '>' +
        (st.busy ? (short ? 'Opening payment...' : 'Placing order...') : short ? 'Pay ' + K.ngn(remaining(payNow)) + ' and place order' : 'Place order') + '</button>' +
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
    document.querySelectorAll('input[name=gw]').forEach(function (r) {
      r.addEventListener('change', function () { st.payWith = r.value; });
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

  /** What the card/bank payment will charge: the shortfall, ₦100 at least (the gateways' minimum). */
  function remaining(payNow) {
    return Math.max(100, Math.ceil(payNow - (st.wallet || 0)));
  }

  function orderPlaced(order) {
    try { sessionStorage.removeItem(IDEM_KEY); sessionStorage.removeItem(PAY_REF_KEY); } catch (_) { /* blocked */ }
    K.clearCart();
    location.href = 'shop-orders.html?id=' + encodeURIComponent(order.id) + '&placed=1';
  }

  async function place() {
    if (st.busy) return;
    var q = st.quote;
    var pod = q && q.payment && q.payment.payOnDelivery;
    var payNow = q ? (st.method === 'PAY_ON_DELIVERY' && pod && pod.available ? pod.payNow : q.payment.wallet.payNow) : 0;
    var short = st.wallet !== null && payNow > st.wallet;
    st.busy = true; render();
    try {
      var res = await K.api('/shop/orders', {
        method: 'POST',
        body: JSON.stringify({
          addressId: st.addressId, channel: 'web', paymentMethod: st.method, items: items(), idempotencyKey: idemKey(),
          payWith: short ? st.payWith : 'wallet',
          redirectUrl: location.origin + location.pathname + '?paid=1',
        }),
      });
      if (res && res.paymentRequired) {
        // The order is placed once the payment is confirmed; the cart stays until then.
        try { sessionStorage.setItem(PAY_REF_KEY, res.reference); } catch (_) { /* blocked */ }
        location.href = res.checkoutUrl;
        return;
      }
      orderPlaced(res.order);
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

  /** Back from Paystack/Monnify: wait for the payment to be confirmed and the order placed. */
  async function confirmPayment(reference) {
    st.confirming = { title: 'Confirming your payment', text: 'Please wait, this can take a minute for bank transfers.' };
    render();
    for (var i = 0; i < 20; i++) {
      try {
        var r = await K.api('/shop/orders/payment/' + encodeURIComponent(reference));
        if (r.status === 'PLACED' && r.order) { orderPlaced(r.order); return true; }
        if (r.status === 'FAILED') {
          try { sessionStorage.removeItem(PAY_REF_KEY); } catch (_) { /* blocked */ }
          st.confirming = { done: true, title: 'Payment received', text: r.message + ' You can place the order again with your wallet.', cta: 'Back to checkout' };
          render();
          return true;
        }
      } catch (e) {
        if (e && e.status === 404) break;
      }
      await new Promise(function (res) { setTimeout(res, 3000); });
    }
    st.confirming = {
      done: true, title: 'Still confirming your payment',
      text: 'Your order will be placed automatically as soon as the payment is confirmed. Check My Orders in a few minutes. If the payment did not go through, nothing was charged.',
      href: 'shop-orders.html', cta: 'Go to My Orders',
    };
    render();
    return true;
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof APIHelper === 'undefined' || !APIHelper.isAuthenticated()) return;
    var params = new URLSearchParams(location.search);
    var payRef = null;
    try { payRef = sessionStorage.getItem(PAY_REF_KEY); } catch (_) { /* blocked */ }
    payRef = payRef || params.get('paymentReference') || params.get('reference');
    if (params.get('paid') === '1' && payRef) {
      history.replaceState(null, '', location.pathname);
      if (await confirmPayment(payRef)) return;
    }
    if (!K.readCart().length) { render(); return; }
    try { st.addresses = await AddressAPI.getAll(); } catch (_) { st.addresses = []; }
    var def = st.addresses.find(function (a) { return a.isDefault; }) || st.addresses[0];
    st.addressId = def ? def.id : '';
    await loadWallet();
    if (st.addressId) quote(); else render();
  });
})();
