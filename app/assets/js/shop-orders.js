/**
 * Hairlux web shop: the customer's shop orders (shop-orders.html).
 * Shows each order's deliveries, what was paid, any Pay on Delivery balance
 * (payable from the wallet) and the 6-digit delivery code.
 */
(function () {
  'use strict';
  var K = ShopKit, esc = K.esc;
  var $ = function (id) { return document.getElementById(id); };

  function overall(o) {
    // A mixed order can be part delivered; show the furthest-behind delivery.
    var s = (o.shipments || []).map(function (x) { return x.status; }).filter(function (x) { return x !== 'CANCELLED'; });
    if (o.status === 'CANCELLED' || !s.length) return o.status;
    var order = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
    return s.reduce(function (a, b) { return order.indexOf(a) <= order.indexOf(b) ? a : b; });
  }

  function card(o) {
    var count = (o.items || []).reduce(function (s, i) { return s + (i.quantity || 1); }, 0);
    var names = (o.items || []).map(function (i) { return i.name; }).join(', ');
    return '<a class="ocard" href="shop-orders.html?id=' + esc(o.id) + '"><div class="top"><span class="code">' + esc(o.orderCode) + '</span>' + K.pill(overall(o)) + '</div>' +
      '<div class="small muted">' + esc(names) + '</div>' +
      '<div class="top small"><span class="muted">' + K.dateTime(o.createdAt) + ' &middot; ' + count + ' item' + (count === 1 ? '' : 's') + '</span><strong>' + K.ngn(o.totalAmount) + '</strong></div>' +
      (o.balanceDue > 0 && o.status !== 'CANCELLED' ? '<div class="note warn" style="margin:0">Balance of ' + K.ngn(o.balanceDue) + ' to pay before delivery</div>' : '') + '</a>';
  }

  async function loadList() {
    try {
      var list = await K.api('/shop/orders');
      $('orders').innerHTML = list && list.length
        ? '<div class="olist">' + list.map(card).join('') + '</div>'
        : '<div class="panel empty-box"><h3>No shop orders yet</h3><p>When you buy from the shop, your orders appear here.</p><a class="btn-shop" href="shop.html">Go to the shop</a></div>';
    } catch (e) {
      $('orders').innerHTML = '<div class="note bad">' + esc(K.errMsg(e)) + '</div>';
    }
  }

  function codeBox(o) {
    switch (o.deliveryCodeStatus) {
      case 'AVAILABLE':
        return '<div class="dcode"><div class="small">Your delivery code</div><div class="digits">' + esc(o.deliveryCode) + '</div>' +
          '<div class="small muted">Give this code to the rider only when you have your items in hand. Do not share it before.</div></div>';
      case 'PAY_BALANCE_FIRST':
        return '<div class="note warn"><strong>Pay the balance to get your delivery code</strong>You owe ' + K.ngn(o.balanceDue) + '. The rider can only hand over your order with your code.' +
          '<div style="margin-top:12px"><button class="btn-shop sm" id="pay-bal" type="button">Pay ' + K.ngn(o.balanceDue) + ' from wallet</button></div>' +
          '<div class="small" style="margin-top:8px">Paid Hairlux another way? Your code appears once we confirm it.</div></div>';
      default:
        return '';
    }
  }

  function renderDetail(o) {
    var byShip = {};
    (o.items || []).forEach(function (i) { var k = i.shipment || 1; (byShip[k] = byShip[k] || []).push(i); });
    var ships = (o.shipments || []).length ? o.shipments : [{ number: 1, status: o.status, itemCount: 0 }];
    var many = ships.length > 1;
    var shipHtml = ships.map(function (s) {
      return '<div class="ship"><div class="hd"><span>' + (many ? 'Delivery ' + s.number : 'Delivery') + '</span>' + K.pill(s.status) + '</div><ul>' +
        (byShip[s.number] || []).map(function (i) { return '<li>' + i.quantity + ' x ' + esc(i.name) + '</li>'; }).join('') + '</ul>' +
        (s.deliveredAt ? '<div class="small muted" style="margin-top:6px">Delivered ' + K.dateTime(s.deliveredAt) + '</div>' : '') +
        (s.status === 'CANCELLED' ? '<div class="small muted" style="margin-top:6px">These items were cancelled and refunded to your wallet.</div>' : '') + '</div>';
    }).join('');
    var a = o.deliveryAddress || {};
    var placed = new URLSearchParams(location.search).get('placed') === '1';
    $('detail-view').innerHTML =
      '<a class="back-link" href="shop-orders.html">&larr; All shop orders</a>' +
      (placed ? '<div class="note ok"><strong>Order placed</strong>Thank you. We have emailed your order details.</div>' : '') +
      '<div class="shop-head"><div><h1 class="h-l" style="font-size:30px">' + esc(o.orderCode) + '</h1><p>Placed ' + K.dateTime(o.createdAt) + '</p></div>' + K.pill(overall(o)) + '</div>' +
      codeBox(o) +
      '<div class="co-grid" style="margin-top:16px"><div><div class="panel"><h3>' + (many ? 'Your deliveries' : 'Your items') + '</h3>' + shipHtml + '</div>' +
      '<div class="panel"><h3>Delivery address</h3><div>' + esc(a.fullAddress || [a.streetAddress, a.city, a.state].filter(Boolean).join(', ') || '-') + '</div></div></div>' +
      '<div><div class="panel"><h3>Payment</h3>' +
      '<div class="sum-row"><span>Items</span><span>' + K.ngn(o.subtotal) + '</span></div>' +
      '<div class="sum-row"><span>Delivery</span><span>' + K.ngn(o.deliveryFee) + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span>' + K.ngn(o.totalAmount) + '</span></div>' +
      '<div class="sum-row"><span>Method</span><span>' + (o.paymentMethod === 'PAY_ON_DELIVERY' ? 'Pay on Delivery' : 'Wallet') + '</span></div>' +
      '<div class="sum-row"><span>Paid</span><span>' + K.ngn(o.amountPaid) + '</span></div>' +
      (o.balanceDue > 0 ? '<div class="sum-row" style="font-weight:700"><span>Balance due</span><span>' + K.ngn(o.balanceDue) + '</span></div>' : '') +
      (o.refundedAmount > 0 ? '<div class="sum-row"><span>Refunded to wallet</span><span>' + K.ngn(o.refundedAmount) + '</span></div>' : '') +
      '</div></div></div>';
    var pay = $('pay-bal');
    if (pay) pay.addEventListener('click', async function () {
      if (!confirm('Pay ' + K.ngn(o.balanceDue) + ' from your wallet now?')) return;
      pay.disabled = true; pay.textContent = 'Paying...';
      try {
        var updated = await K.api('/shop/orders/' + encodeURIComponent(o.id) + '/pay-balance', { method: 'POST' });
        K.toast('Balance paid. Your delivery code is ready.', 'success');
        renderDetail(updated);
      } catch (e) {
        K.toast(K.errMsg(e), 'error');
        pay.disabled = false; pay.textContent = 'Pay ' + K.ngn(o.balanceDue) + ' from wallet';
      }
    });
  }

  async function openDetail(id) {
    $('list-view').hidden = true;
    $('detail-view').hidden = false;
    $('detail-view').innerHTML = '<div class="spin"></div>';
    try { renderDetail(await K.api('/shop/orders/' + encodeURIComponent(id))); }
    catch (e) { $('detail-view').innerHTML = '<a class="back-link" href="shop-orders.html">&larr; All shop orders</a><div class="note bad">' + esc(K.errMsg(e)) + '</div>'; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof APIHelper === 'undefined' || !APIHelper.isAuthenticated()) return;
    var id = new URLSearchParams(location.search).get('id');
    if (id) openDetail(id); else loadList();
  });
})();
