/**
 * Hairlux web shop: shared helpers for shop.html, checkout.html and
 * shop-orders.html (Marketplace Phase 2, 2026-10-18).
 * Hairlux is the seller of everything here; the API never says otherwise.
 * Depends on: config.js, auth-api.js (APIHelper)
 */
var ShopKit = (function () {
  'use strict';

  var CART_KEY = 'hairlux.shop.cart';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ngn(n) {
    var v = Number(n || 0);
    return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function dateTime(v) {
    return v ? new Date(v).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  }
  function toast(msg, type) {
    if (typeof UIHelper !== 'undefined' && UIHelper.showToast) UIHelper.showToast(msg, type || 'info', type === 'error' ? 6000 : 3200);
    else alert(msg);
  }
  function errMsg(e) {
    var m = e && (e.message || (e.data && e.data.message));
    if (Array.isArray(m)) m = m.join('. ');
    return m || 'Something went wrong. Please try again.';
  }

  async function api(path, options) {
    var res = await APIHelper.request(path, options || { method: 'GET' });
    return res && res.data !== undefined ? res.data : res;
  }

  // ------------------------------------------------------------- cart
  // Kept in this browser only. Prices and stock are always rechecked by the
  // server at checkout, so a stale cart can never undercharge.
  function readCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(function (l) { return l && l.productId && l.quantity > 0; }) : [];
    } catch (_) { return []; }
  }
  function writeCart(lines) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch (_) { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent('shop:cart'));
  }
  function addToCart(p, qty) {
    var lines = readCart();
    var line = lines.find(function (l) { return l.productId === p.id; });
    var max = Math.min(99, Number(p.stock) || 99);
    if (line) line.quantity = Math.min(max, line.quantity + qty);
    else lines.push({ productId: p.id, quantity: Math.min(max, qty), name: p.name, price: p.price, imageUrl: p.imageUrl || null, stock: p.stock });
    writeCart(lines);
  }
  function setQty(productId, qty) {
    var lines = readCart();
    var line = lines.find(function (l) { return l.productId === productId; });
    if (!line) return;
    if (qty <= 0) lines = lines.filter(function (l) { return l.productId !== productId; });
    else line.quantity = Math.min(99, line.stock ? Math.min(line.stock, qty) : qty);
    writeCart(lines);
  }
  function clearCart() { writeCart([]); }
  function cartCount() { return readCart().reduce(function (s, l) { return s + l.quantity; }, 0); }
  function cartSubtotal() { return readCart().reduce(function (s, l) { return s + l.price * l.quantity; }, 0); }

  // ------------------------------------------------------------- statuses
  var ORDER_STATUS = {
    CONFIRMED: { label: 'Order placed', cls: 'gold' },
    PROCESSING: { label: 'Being prepared', cls: 'gold' },
    SHIPPED: { label: 'On the way', cls: 'gold' },
    DELIVERED: { label: 'Delivered', cls: 'ok' },
    CANCELLED: { label: 'Cancelled', cls: 'bad' },
  };
  function pill(status) {
    var m = ORDER_STATUS[status] || { label: status, cls: '' };
    return '<span class="pill ' + m.cls + '">' + esc(m.label) + '</span>';
  }

  return {
    esc: esc, ngn: ngn, dateTime: dateTime, toast: toast, errMsg: errMsg, api: api,
    readCart: readCart, addToCart: addToCart, setQty: setQty, clearCart: clearCart, cartCount: cartCount, cartSubtotal: cartSubtotal,
    pill: pill, ORDER_STATUS: ORDER_STATUS,
  };
})();
