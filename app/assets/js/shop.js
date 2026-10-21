/**
 * Hairlux web shop: product list, product details and cart (shop.html).
 * Lists the web catalogue (channel=web): Hairlux stock plus approved
 * marketplace products, all sold by Hairlux.
 */
(function () {
  'use strict';
  var K = ShopKit, esc = K.esc;
  var $ = function (id) { return document.getElementById(id); };
  var state = { cat: '', q: '', sort: '', page: 1, items: [], meta: null };
  var timer = null;

  function sorted(list) {
    var l = list.slice();
    if (state.sort === 'price-asc') l.sort(function (a, b) { return a.price - b.price; });
    if (state.sort === 'price-desc') l.sort(function (a, b) { return b.price - a.price; });
    return l;
  }

  function flag(p) {
    if (!p.inStock) return 'Out of stock';
    if (p.deliveryAvailable === false) return 'Delivery unavailable';
    return '';
  }

  function card(p) {
    var f = flag(p);
    return '<button class="pcard" type="button" data-id="' + esc(p.id) + '">' +
      '<div class="ph" style="' + (p.imageUrl ? "background-image:url('" + esc(p.imageUrl) + "')" : '') + '">' + (f ? '<span class="flag">' + esc(f) + '</span>' : '') + '</div>' +
      '<div class="body"><div class="cat">' + esc(p.category ? p.category.name : '') + '</div><div class="name">' + esc(p.name) + '</div>' +
      '<div class="price">' + K.ngn(p.price) + '</div></div></button>';
  }

  async function load(more) {
    if (!more) { state.page = 1; state.items = []; $('grid').innerHTML = '<div class="spin"></div>'; }
    try {
      var q = new URLSearchParams({ channel: 'web', page: state.page, limit: 24 });
      if (state.cat) q.set('categoryId', state.cat);
      if (state.q) q.set('search', state.q);
      var res = await K.api('/shop/products?' + q.toString());
      state.items = state.items.concat(res.data || []);
      state.meta = res.meta;
      $('more').hidden = !res.meta || res.meta.page >= res.meta.totalPages;
      if (!state.items.length) {
        $('grid').innerHTML = '<div class="empty-box"><h3>No products found</h3><p>Try another search or category.</p></div>';
        return;
      }
      $('grid').innerHTML = '<div class="pgrid">' + sorted(state.items).map(card).join('') + '</div>';
    } catch (e) {
      $('grid').innerHTML = '<div class="note bad">' + esc(K.errMsg(e)) + '</div>';
    }
  }

  async function loadCategories() {
    try {
      var cats = await K.api('/shop/categories');
      $('cats').innerHTML = '<button class="chip active" data-cat="">All</button>' + (cats || []).map(function (c) {
        return '<button class="chip" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('');
    } catch (_) { /* categories are optional */ }
  }

  // ------------------------------------------------------------- overlay
  function openOverlay() { $('overlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeAll() {
    $('overlay').classList.remove('open'); $('pmodal').classList.remove('open'); $('drawer').classList.remove('open');
    document.body.style.overflow = '';
  }

  function openProduct(id) {
    var p = state.items.find(function (x) { return x.id === id; });
    if (!p) return;
    var imgs = (p.images || []).map(function (i) { return i.url; }).filter(Boolean);
    if (!imgs.length && p.imageUrl) imgs = [p.imageUrl];
    var f = flag(p);
    var qty = 1;
    var max = Math.max(1, Math.min(99, p.stock || 1));
    $('pmodal').innerHTML = '<div style="display:flex;justify-content:flex-end;padding:10px 12px 0"><button class="x-btn" data-close aria-label="Close">&times;</button></div>' +
      '<div class="pdetail"><div><div class="main-img" id="main-img" style="' + (imgs[0] ? "background-image:url('" + esc(imgs[0]) + "')" : '') + '"></div>' +
      (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (u, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-img="' + esc(u) + '" style="background-image:url(\'' + esc(u) + '\')" aria-label="Photo ' + (i + 1) + '"></button>'; }).join('') + '</div>' : '') + '</div>' +
      '<div><div class="small muted">' + esc(p.category ? p.category.name : '') + '</div><h2>' + esc(p.name) + '</h2><div class="price">' + K.ngn(p.price) + '</div>' +
      (p.description ? '<div class="desc">' + esc(p.description) + '</div>' : '') +
      (f ? '<div class="note warn"><strong>' + esc(f) + '</strong>' + (p.inStock ? 'We cannot deliver this item yet. Please check back soon.' : 'This item will be back soon.') + '</div>' :
        (p.payOnDeliveryAllowed === false ? '<div class="small muted" style="margin-bottom:12px">Pay with your wallet. Pay on Delivery is not available for this item.</div>' : '') +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div class="qty"><button type="button" id="q-minus" aria-label="Less">&minus;</button><span id="q-val">1</span><button type="button" id="q-plus" aria-label="More">+</button></div>' +
        '<button class="btn-shop" id="add" type="button">Add to cart</button></div>' +
        (p.stock <= 5 ? '<div class="small muted" style="margin-top:8px">Only ' + p.stock + ' left</div>' : '')) +
      '</div></div>';
    openOverlay();
    $('pmodal').classList.add('open');
    $('pmodal').querySelectorAll('[data-img]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('main-img').style.backgroundImage = "url('" + b.dataset.img + "')";
        $('pmodal').querySelectorAll('[data-img]').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
    if ($('add')) {
      $('q-minus').addEventListener('click', function () { qty = Math.max(1, qty - 1); $('q-val').textContent = qty; });
      $('q-plus').addEventListener('click', function () { qty = Math.min(max, qty + 1); $('q-val').textContent = qty; });
      $('add').addEventListener('click', function () {
        K.addToCart(p, qty);
        closeAll();
        K.toast(p.name + ' added to your cart', 'success');
      });
    }
  }

  function renderCart() {
    var lines = K.readCart();
    var n = K.cartCount();
    $('cart-n').textContent = n;
    $('cart-fab').hidden = n === 0;
    $('cart-sub').textContent = K.ngn(K.cartSubtotal());
    $('go-checkout').style.pointerEvents = n ? '' : 'none';
    $('go-checkout').style.opacity = n ? '' : '.5';
    $('cart-lines').innerHTML = lines.length ? lines.map(function (l) {
      return '<div class="cart-line"><div class="img" style="' + (l.imageUrl ? "background-image:url('" + esc(l.imageUrl) + "')" : '') + '"></div>' +
        '<div><div class="nm">' + esc(l.name) + '</div><div class="meta">' + K.ngn(l.price) + ' each</div></div>' +
        '<div class="side"><div class="qty sm"><button type="button" data-dec="' + esc(l.productId) + '" aria-label="Less">&minus;</button><span>' + l.quantity + '</span><button type="button" data-inc="' + esc(l.productId) + '" aria-label="More">+</button></div>' +
        '<button class="link-btn" type="button" data-rm="' + esc(l.productId) + '">Remove</button></div></div>';
    }).join('') : '<div class="empty-box">Your cart is empty.</div>';
  }

  // ------------------------------------------------------------- events
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof APIHelper === 'undefined' || !APIHelper.isAuthenticated()) return;
    // Lift the cart and product layers out of the page wrapper so they sit above the site navbar.
    ['overlay', 'pmodal', 'drawer', 'cart-fab'].forEach(function (id) { document.body.appendChild($(id)); });
    $('grid').addEventListener('click', function (e) {
      var c = e.target.closest('.pcard');
      if (c) openProduct(c.dataset.id);
    });
    $('cats').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      state.cat = c.dataset.cat;
      $('cats').querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('active', x === c); });
      load();
    });
    $('q').addEventListener('input', function () {
      clearTimeout(timer);
      var v = this.value.trim();
      timer = setTimeout(function () { state.q = v; load(); }, 350);
    });
    $('sort').addEventListener('change', function () {
      state.sort = this.value;
      if (state.items.length) $('grid').innerHTML = '<div class="pgrid">' + sorted(state.items).map(card).join('') + '</div>';
    });
    $('more').addEventListener('click', function () { state.page++; load(true); });
    $('cart-fab').addEventListener('click', function () { renderCart(); openOverlay(); $('drawer').classList.add('open'); });
    $('overlay').addEventListener('click', closeAll);
    document.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
    $('cart-lines').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var line = function (id) { return K.readCart().find(function (l) { return l.productId === id; }); };
      if (b.dataset.inc) { var a = line(b.dataset.inc); if (a) K.setQty(a.productId, a.quantity + 1); }
      if (b.dataset.dec) { var d = line(b.dataset.dec); if (d) K.setQty(d.productId, d.quantity - 1); }
      if (b.dataset.rm) K.setQty(b.dataset.rm, 0);
    });
    document.addEventListener('shop:cart', renderCart);
    renderCart();
    loadCategories();
    load();
  });
})();
