/* ===========================
   ZUMBOO APP.JS — V7 FULL PLATFORM
   Auth + Payments + WhatsApp
   =========================== */

const API = '/api';

/* ===== PRODUCTS (client-side catalog) ===== */
const PRODUCTS = [
    { id: 'p1', name: 'Zumboo Flame Hoodie', cat: 'Hoodies', price: 1999, badge: 'Bestseller', img: 'assets/zumboo_hoodie.png', sizes: ['XS','S','M','L','XL'] },
    { id: 'p2', name: 'High-Rise Power Leggings', cat: 'Bottoms', price: 1499, badge: 'New Arrival', img: 'assets/zumboo_leggings.png', sizes: ['XS','S','M','L'] },
    { id: 'p3', name: 'Rhythm Sports Bra', cat: 'Tops', price: 999, badge: '', img: 'assets/zumboo_hoodie.png', sizes: ['XS','S','M','L'] },
    { id: 'p4', name: 'Studio Mesh Tank Top', cat: 'Tops', price: 799, badge: 'Limited', img: 'assets/zumboo_leggings.png', sizes: ['XS','S','M','L','XL'] },
    { id: 'p5', name: 'Zumboo Water Bottle (1L)', cat: 'Accessories', price: 599, badge: '', img: 'assets/zumboo_hoodie.png', sizes: ['One Size'] },
    { id: 'p6', name: 'Pro Dance Shorts', cat: 'Bottoms', price: 1199, badge: 'Sale', img: 'assets/zumboo_leggings.png', sizes: ['XS','S','M','L'] },
    { id: 'p7', name: 'Zip-Up Track Jacket', cat: 'Hoodies', price: 2499, badge: '', img: 'assets/zumboo_hoodie.png', sizes: ['S','M','L','XL'] },
    { id: 'p8', name: 'Neon Grip Socks', cat: 'Accessories', price: 399, badge: '', img: 'assets/zumboo_leggings.png', sizes: ['S/M','L/XL'] },
];

/* ===== API HELPER ===== */
async function apiFetch(method, endpoint, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const token = localStorage.getItem('zb_token');
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API}${endpoint}`, opts);
        return await res.json();
    } catch (err) {
        console.error(`API Error:`, err);
        return { success: false, error: err.message };
    }
}

/* ===== AUTH STATE ===== */
const AUTH = {
    user: null,
    token: null,

    init() {
        this.token = localStorage.getItem('zb_token');
        const userData = localStorage.getItem('zb_user');
        if (userData) {
            try { this.user = JSON.parse(userData); } catch { this.user = null; }
        }
    },

    isLoggedIn() { return !!this.token && !!this.user; },

    setUser(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem('zb_token', token);
        localStorage.setItem('zb_user', JSON.stringify(user));
        updateAuthUI();
    },

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('zb_token');
        localStorage.removeItem('zb_user');
        updateAuthUI();
        switchTab('home');
        showToast('👋 Logged out successfully');
    },

    getInitial() {
        return this.user?.name ? this.user.name.charAt(0).toUpperCase() : '?';
    },

    getFirstName() {
        return this.user?.name ? this.user.name.split(' ')[0] : 'User';
    }
};

/* ===== STATE ===== */
const STATE = {
    classes: [],
    bookings: [],
    orders: [],
    roster: [],
    cart: JSON.parse(localStorage.getItem('zb_cart') || '[]'),
    activePromo: null,
    pendingBookingClassId: null,

    async loadClasses() {
        const res = await apiFetch('GET', '/classes');
        if (res.success) this.classes = res.classes;
    },

    async loadBookings() {
        if (!AUTH.isLoggedIn()) { this.bookings = []; return; }
        const res = await apiFetch('GET', '/bookings');
        if (res.success) this.bookings = res.bookings;
    },

    async loadOrders() {
        if (!AUTH.isLoggedIn()) { this.orders = []; return; }
        const res = await apiFetch('GET', '/orders');
        if (res.success) this.orders = res.orders;
    },

    async loadAll() {
        await Promise.all([this.loadClasses(), this.loadBookings(), this.loadOrders()]);
    },

    async loadRoster(classFilter = 'all') {
        const q = classFilter && classFilter !== 'all' ? `?classId=${classFilter}` : '';
        const res = await apiFetch('GET', `/roster${q}`);
        if (res.success) this.roster = res.roster;
    },

    async loadStats() { return await apiFetch('GET', '/stats'); },

    isBooked(classId) { return this.bookings.some(b => b.classId === classId); },
    getClass(classId) { return this.classes.find(c => c.id === classId); },

    // Cart (client-side)
    cartTotal() {
        const sub = this.cart.reduce((s, i) => s + i.price * i.qty, 0);
        const disc = this.activePromo ? (sub * this.activePromo.pct / 100) : 0;
        return { subtotal: sub, discount: disc, total: sub - disc };
    },
    cartItemCount() { return this.cart.reduce((s, i) => s + i.qty, 0); },
    addToCart(product, size) {
        const ex = this.cart.find(i => i.id === product.id && i.size === size);
        if (ex) ex.qty++; else this.cart.push({ ...product, size, qty: 1 });
        this.saveCart();
    },
    updateQty(id, size, delta) {
        const idx = this.cart.findIndex(i => i.id === id && i.size === size);
        if (idx === -1) return;
        this.cart[idx].qty = Math.max(0, this.cart[idx].qty + delta);
        if (this.cart[idx].qty === 0) this.cart.splice(idx, 1);
        this.saveCart();
    },
    removeFromCart(id, size) {
        this.cart = this.cart.filter(i => !(i.id === id && i.size === size));
        this.saveCart();
    },
    clearCart() { this.cart = []; this.activePromo = null; this.saveCart(); },
    saveCart() { localStorage.setItem('zb_cart', JSON.stringify(this.cart)); }
};

/* ===== DOM HELPERS ===== */
const $ = id => document.getElementById(id);
const fmt = n => `₹${parseFloat(n).toLocaleString('en-IN')}`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[ch]));

/* ===== AUTH UI ===== */
function updateAuthUI() {
    const loginBtn = $('header-login-btn');
    const userPill = $('header-user-pill');

    if (AUTH.isLoggedIn()) {
        loginBtn.style.display = 'none';
        userPill.style.display = 'flex';
        $('header-user-avatar').textContent = AUTH.getInitial();
        $('header-user-name').textContent = AUTH.getFirstName();
    } else {
        loginBtn.style.display = '';
        userPill.style.display = 'none';
    }
}

function openAuthModal(mode = 'login') {
    $('auth-modal-overlay').classList.add('active');
    if (mode === 'register') {
        $('login-form').style.display = 'none';
        $('register-form').style.display = '';
        $('auth-modal-title').textContent = 'Join Zumboo';
    } else {
        $('login-form').style.display = '';
        $('register-form').style.display = 'none';
        $('auth-modal-title').textContent = 'Login to Zumboo';
    }
    $('login-error').textContent = '';
    $('register-error').textContent = '';
}

function closeAuthModal() {
    $('auth-modal-overlay').classList.remove('active');
}

function initAuth() {
    AUTH.init();
    updateAuthUI();

    $('header-login-btn').addEventListener('click', () => openAuthModal('login'));
    $('header-logout-btn').addEventListener('click', () => AUTH.logout());
    $('close-auth-modal-btn').addEventListener('click', closeAuthModal);
    $('auth-modal-overlay').addEventListener('click', e => { if (e.target === $('auth-modal-overlay')) closeAuthModal(); });

    $('switch-to-register').addEventListener('click', e => { e.preventDefault(); openAuthModal('register'); });
    $('switch-to-login').addEventListener('click', e => { e.preventDefault(); openAuthModal('login'); });

    // Login form
    $('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        const email = $('login-email').value.trim();
        const password = $('login-password').value;
        $('login-error').textContent = '';

        const btn = e.target.querySelector('.btn-form-cta');
        btn.disabled = true; btn.textContent = 'Logging in...';

        const res = await apiFetch('POST', '/auth/login', { email, password });
        btn.disabled = false; btn.textContent = 'Login →';

        if (res.success) {
            AUTH.setUser(res.token, res.user);
            closeAuthModal();
            await STATE.loadAll();
            renderHomePreviews();
            showToast(`🎉 Welcome back, ${AUTH.getFirstName()}!`);
        } else {
            $('login-error').textContent = res.error || 'Login failed';
        }
    });

    // Register form
    $('register-form').addEventListener('submit', async e => {
        e.preventDefault();
        const name = $('reg-name').value.trim();
        const phone = $('reg-phone').value.trim();
        const email = $('reg-email').value.trim();
        const password = $('reg-password').value;
        $('register-error').textContent = '';

        const btn = e.target.querySelector('.btn-form-cta');
        btn.disabled = true; btn.textContent = 'Creating...';

        const res = await apiFetch('POST', '/auth/register', { name, email, phone, password });
        btn.disabled = false; btn.textContent = 'Create Account →';

        if (res.success) {
            AUTH.setUser(res.token, res.user);
            closeAuthModal();
            await STATE.loadAll();
            renderHomePreviews();
            showToast(`🎉 Welcome to Zumboo, ${AUTH.getFirstName()}!`);
        } else {
            $('register-error').textContent = res.error || 'Registration failed';
        }
    });
}

/* ===== TABS ===== */
function initTabs() {
    document.querySelectorAll('.tab-link, .footer-nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const tab = link.dataset.tab;
            if (tab) switchTab(tab);
        });
    });
    $('logo-link').addEventListener('click', e => { e.preventDefault(); switchTab('home'); });
}

async function switchTab(tab) {
    // Require login for account tab
    if (tab === 'account' && !AUTH.isLoggedIn()) {
        openAuthModal('login');
        return;
    }

    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`view-${tab}`)?.classList.add('active');
    document.querySelector(`.tab-link[data-tab="${tab}"]`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tab === 'home') { await STATE.loadClasses(); renderHomePreviews(); }
    if (tab === 'classes') { await STATE.loadClasses(); if (AUTH.isLoggedIn()) await STATE.loadBookings(); renderClasses('all'); }
    if (tab === 'shop') renderShop();
    if (tab === 'account') { await STATE.loadAll(); renderAccount(); }
    if (tab === 'instructor') await renderInstructor();
}

/* ===== HERO BUTTONS ===== */
function initHeroButtons() {
    $('hero-book-btn')?.addEventListener('click', () => switchTab('classes'));
    $('hero-shop-btn')?.addEventListener('click', () => switchTab('shop'));
    $('view-all-classes-btn')?.addEventListener('click', () => switchTab('classes'));
    $('view-all-shop-btn')?.addEventListener('click', () => switchTab('shop'));
}

/* ===== RENDER CLASSES ===== */
function renderClassCard(cls) {
    const booked = STATE.isBooked(cls.id);
    const slotsLeft = cls.slotsLeft ?? cls.totalSlots;
    const isFull = cls.isFull ?? (slotsLeft <= 0);
    const typeLabel = cls.type === 'cardio' ? 'CARDIO' : cls.type === 'aqua' ? 'AQUA' : 'TONING';
    const gradClass = cls.type === 'cardio' ? 'cardio' : cls.type === 'aqua' ? 'aqua' : 'toning';

    return `
    <div class="class-card" data-class-id="${cls.id}">
        <div class="class-card-img ${gradClass}">
            <span class="class-tag">${typeLabel}</span>
            <span class="slots-tag">${isFull ? '🔴 Full' : `${slotsLeft} slots left`}</span>
        </div>
        <div class="class-card-body">
            <div>
                <div style="font-size:1.2rem;font-weight:900;color:var(--text);margin-bottom:0.8rem;">${cls.name}</div>
                <div class="class-meta-row">
                    <div class="class-meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${cls.duration}
                    </div>
                    <div class="class-meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        ${cls.time}
                    </div>
                </div>
            </div>
            <div class="class-instructor-row">
                <div class="inst-avatar">${cls.initials}</div>
                <div class="inst-info">
                    <div class="inst-name">${cls.instructor}</div>
                    <div class="inst-role">Certified Instructor</div>
                </div>
            </div>
            <div class="class-card-footer">
                <div class="class-price-tag">${fmt(cls.price)}<small> / session</small></div>
                ${booked
                    ? `<button class="btn-book-slot" disabled>✓ Booked</button>`
                    : isFull
                    ? `<button class="btn-book-slot full" disabled>Class Full</button>`
                    : `<button class="btn-book-slot" data-book="${cls.id}">Book Now →</button>`
                }
            </div>
        </div>
    </div>`;
}

function renderClasses(filter = 'all') {
    const container = $('class-schedule-list');
    if (!container) return;
    const filtered = filter === 'all' ? STATE.classes : STATE.classes.filter(c => c.type === filter);
    container.innerHTML = filtered.map(c => renderClassCard(c)).join('');
    attachBookingListeners(container);
}

function renderHomePreviews() {
    const cc = $('home-classes-preview');
    if (cc) { cc.innerHTML = STATE.classes.slice(0, 3).map(c => renderClassCard(c)).join(''); attachBookingListeners(cc); }
    const sc = $('home-shop-preview');
    if (sc) { sc.innerHTML = PRODUCTS.slice(0, 4).map(p => renderProductCard(p)).join(''); attachProductListeners(sc); }
}

function attachBookingListeners(container) {
    container.querySelectorAll('[data-book]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!AUTH.isLoggedIn()) { openAuthModal('login'); showToast('🔐 Please login to book a class'); return; }
            openBookingModal(btn.dataset.book);
        });
    });
}

function initClassFilters() {
    document.querySelectorAll('.pill-btn[data-class-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-btn[data-class-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderClasses(btn.dataset.classFilter);
        });
    });
}

/* ===== BOOKING MODAL WITH PAYMENT ===== */
function openBookingModal(classId) {
    const cls = STATE.getClass(classId);
    if (!cls) return;
    STATE.pendingBookingClassId = classId;
    $('book-class-name').textContent = cls.name;
    $('book-class-time').textContent = `📅 ${cls.time} · ${cls.duration}`;
    $('book-class-instructor').textContent = `👤 ${cls.instructor}`;
    $('book-class-price').textContent = fmt(cls.price);

    // Reset state
    $('booking-success-area').style.display = 'none';
    document.querySelector('.booking-class-preview').style.display = 'flex';
    document.querySelector('.booking-price-row').style.display = 'flex';
    document.querySelector('.booking-actions').style.display = 'grid';

    $('booking-modal-overlay').classList.add('active');
}

function closeBookingModal() {
    $('booking-modal-overlay').classList.remove('active');
    STATE.pendingBookingClassId = null;
}

function showBookingSuccess(booking, whatsappLink) {
    // Hide booking form, show success
    document.querySelector('.booking-class-preview').style.display = 'none';
    document.querySelector('.booking-price-row').style.display = 'none';
    document.querySelector('.booking-actions').style.display = 'none';
    $('booking-success-area').style.display = 'block';

    $('booking-success-ticket').textContent = booking.id;
    $('booking-success-msg').textContent = `${booking.className} — ${booking.time}`;
    $('booking-success-payment').textContent = 'Paid ✅';

    if (whatsappLink) {
        $('booking-whatsapp-btn').href = whatsappLink;
        $('booking-whatsapp-btn').style.display = 'inline-flex';
    }
}

function initBookingModal() {
    $('close-booking-modal-btn').addEventListener('click', closeBookingModal);
    $('btn-cancel-confirm').addEventListener('click', closeBookingModal);
    $('booking-modal-overlay').addEventListener('click', e => { if (e.target === $('booking-modal-overlay')) closeBookingModal(); });

    $('btn-booking-success-close')?.addEventListener('click', () => {
        closeBookingModal();
        switchTab('account');
    });

    $('btn-submit-booking-confirm').addEventListener('click', async () => {
        const classId = STATE.pendingBookingClassId;
        if (!classId) return;
        if (!AUTH.isLoggedIn()) { openAuthModal('login'); return; }

        const btn = $('btn-submit-booking-confirm');
        btn.disabled = true; btn.textContent = 'Processing...';

        // Step 1: Create booking on server
        const bookRes = await apiFetch('POST', '/bookings', { classId });

        if (!bookRes.success) {
            btn.disabled = false; btn.textContent = 'Book & Pay →';
            showToast(`❌ ${bookRes.error || 'Booking failed'}`);
            return;
        }

        // Step 2: Create payment order
        const cls = STATE.getClass(classId);
        const payOrderRes = await apiFetch('POST', '/payments/create-order', {
            amount: cls.price,
            type: 'booking',
            itemId: bookRes.booking.id
        });

        if (!payOrderRes.success) {
            btn.disabled = false; btn.textContent = 'Book & Pay →';
            showToast('❌ Payment setup failed');
            return;
        }

        // Step 3: Open Razorpay checkout (or demo payment)
        const demoPaymentId = `pay_demo_${Date.now().toString(36)}`;

        // Try Razorpay if available, otherwise use demo
        if (typeof Razorpay !== 'undefined' && payOrderRes.razorpayKeyId && !payOrderRes.razorpayKeyId.includes('demo')) {
            // Real Razorpay checkout
            const rzpOptions = {
                key: payOrderRes.razorpayKeyId,
                amount: payOrderRes.order.amount,
                currency: payOrderRes.order.currency,
                name: 'Zumboo Studio',
                description: `Booking: ${cls.name}`,
                order_id: payOrderRes.order.id,
                handler: async function(response) {
                    await completeBookingPayment(bookRes.booking, response.razorpay_payment_id, response.razorpay_signature, bookRes.whatsappLink);
                },
                prefill: { name: AUTH.user.name, email: AUTH.user.email, contact: AUTH.user.phone },
                theme: { color: '#FF385C' }
            };
            const rzp = new Razorpay(rzpOptions);
            rzp.open();
            btn.disabled = false; btn.textContent = 'Book & Pay →';
        } else {
            // Demo payment (no real Razorpay keys)
            await completeBookingPayment(bookRes.booking, demoPaymentId, null, bookRes.whatsappLink);
            btn.disabled = false; btn.textContent = 'Book & Pay →';
        }
    });
}

async function completeBookingPayment(booking, paymentId, signature, whatsappLink) {
    // Verify payment on server
    await apiFetch('POST', '/payments/verify', {
        orderId: null,
        paymentId,
        signature,
        type: 'booking',
        bookingId: booking.id
    });

    // Refresh data
    await STATE.loadAll();
    renderHomePreviews();
    renderClasses();

    // Show success with WhatsApp button
    showBookingSuccess(booking, whatsappLink);
    showToast(`✅ Booked & Paid: ${booking.className}!`);
}

/* ===== PRODUCTS ===== */
function renderProductCard(p) {
    const sizeOpts = p.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
    return `
    <div class="product-card" data-product-id="${p.id}">
        <div class="product-img-wrap">
            ${p.badge ? `<span class="product-badge-tag">${p.badge}</span>` : ''}
            <img src="${p.img}" alt="${p.name}" onerror="this.style.display='none'">
            <button class="product-hover-btn" data-add-to-cart="${p.id}">Add to Cart</button>
        </div>
        <div class="product-card-info">
            <div class="product-cat">${p.cat}</div>
            <div class="product-name">${p.name}</div>
            <div class="product-price-row">
                <div class="product-price">${fmt(p.price)}</div>
                <select class="size-picker" id="size-${p.id}" title="Select size">${sizeOpts}</select>
            </div>
        </div>
    </div>`;
}

function renderShop(search = '', sort = 'default') {
    let filtered = [...PRODUCTS];
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.cat.toLowerCase().includes(search.toLowerCase()));
    if (sort === 'price-low') filtered.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') filtered.sort((a, b) => b.price - a.price);
    const container = $('shop-items-list');
    if (!container) return;
    container.innerHTML = filtered.map(p => renderProductCard(p)).join('');
    attachProductListeners(container);
}

function attachProductListeners(container) {
    container.querySelectorAll('[data-add-to-cart]').forEach(btn => {
        btn.addEventListener('click', () => {
            const product = PRODUCTS.find(p => p.id === btn.dataset.addToCart);
            if (!product) return;
            const sizeEl = document.getElementById(`size-${product.id}`);
            const size = sizeEl ? sizeEl.value : product.sizes[0];
            STATE.addToCart(product, size);
            renderCart(); openCart();
            showToast(`🛍️ Added ${product.name} (${size}) to cart!`);
        });
    });
}

function initShopControls() {
    $('shop-search')?.addEventListener('input', () => renderShop($('shop-search').value, $('shop-sort').value));
    $('shop-sort')?.addEventListener('change', () => renderShop($('shop-search').value, $('shop-sort').value));
}

/* ===== CART DRAWER ===== */
function openCart() { $('cart-drawer').classList.add('active'); $('cart-drawer-backdrop').classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeCart() { $('cart-drawer').classList.remove('active'); $('cart-drawer-backdrop').classList.remove('active'); document.body.style.overflow = ''; }
function updateCartBadge() { $('cart-count').textContent = STATE.cartItemCount(); }

function renderCart() {
    const body = $('cart-items-list');
    if (!body) return;
    if (STATE.cart.length === 0) {
        body.innerHTML = `<div class="cart-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61H19.4a2 2 0 001.98-1.68L23 6H6"/></svg><p>Your cart is empty</p></div>`;
    } else {
        body.innerHTML = STATE.cart.map(item => `
        <div class="cart-item-row">
            <div class="cart-item-img"><img src="${item.img}" alt="${item.name}" onerror="this.style.background='#eee'"></div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-size">${item.size}</div>
                <div class="cart-item-bottom">
                    <div class="qty-ctrl">
                        <button class="qty-btn" data-qty-down="${item.id}" data-size="${item.size}">−</button>
                        <span class="qty-val">${item.qty}</span>
                        <button class="qty-btn" data-qty-up="${item.id}" data-size="${item.size}">+</button>
                    </div>
                    <div style="display:flex;align-items:center;">
                        <span class="cart-item-price">${fmt(item.price * item.qty)}</span>
                        <button class="btn-remove" data-remove="${item.id}" data-size="${item.size}" title="Remove">✕</button>
                    </div>
                </div>
            </div>
        </div>`).join('');
        body.querySelectorAll('[data-qty-up]').forEach(b => b.addEventListener('click', () => { STATE.updateQty(b.dataset.qtyUp, b.dataset.size, 1); renderCart(); updateCartBadge(); }));
        body.querySelectorAll('[data-qty-down]').forEach(b => b.addEventListener('click', () => { STATE.updateQty(b.dataset.qtyDown, b.dataset.size, -1); renderCart(); updateCartBadge(); }));
        body.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { STATE.removeFromCart(b.dataset.remove, b.dataset.size); renderCart(); updateCartBadge(); }));
    }
    const { subtotal, discount, total } = STATE.cartTotal();
    $('cart-subtotal').textContent = fmt(subtotal);
    $('cart-discount').textContent = `-${fmt(discount)}`;
    $('cart-total').textContent = fmt(total);
    updateCartBadge();
}

function initCartDrawer() {
    $('open-cart-btn').addEventListener('click', () => { renderCart(); openCart(); });
    $('close-cart-btn').addEventListener('click', closeCart);
    $('cart-drawer-backdrop').addEventListener('click', closeCart);
    $('cart-checkout-btn').addEventListener('click', () => {
        if (STATE.cart.length === 0) return;
        if (!AUTH.isLoggedIn()) { closeCart(); openAuthModal('login'); showToast('🔐 Please login to checkout'); return; }
        closeCart();
        openCheckoutModal();
    });
    $('promo-apply-btn').addEventListener('click', async () => {
        const code = $('promo-code-input').value.trim().toUpperCase();
        const res = await apiFetch('POST', '/promo/validate', { code });
        if (res.success) {
            STATE.activePromo = { code: res.code, pct: res.discountPct };
            $('promo-status-area').innerHTML = `<div class="promo-success-tag"><span>🎉 "${res.code}" applied — ${res.discountPct}% off!</span></div>`;
            renderCart();
        } else {
            $('promo-status-area').innerHTML = `<p class="promo-error">❌ Invalid promo code.</p>`;
        }
    });
}

/* ===== CHECKOUT MODAL ===== */
let checkoutStep = 1;

function openCheckoutModal() {
    checkoutStep = 1;
    goToCheckoutStep(1);
    updateCheckoutSummary();
    // Pre-fill from logged-in user
    if (AUTH.user) {
        $('cust-name').value = AUTH.user.name || '';
        $('cust-email').value = AUTH.user.email || '';
        $('cust-phone').value = AUTH.user.phone || '';
    }
    $('checkout-modal-overlay').classList.add('active');
}
function closeCheckoutModal() { $('checkout-modal-overlay').classList.remove('active'); }
function goToCheckoutStep(step) {
    checkoutStep = step;
    for (let i = 1; i <= 3; i++) {
        $(`checkout-step-${i}`)?.classList.toggle('active', i === step);
        $(`chk-step-ind-${i}`)?.classList.toggle('active', i === step);
    }
}
function updateCheckoutSummary() {
    const { total } = STATE.cartTotal();
    $('summary-items-count').textContent = STATE.cartItemCount();
    $('summary-grand-total').textContent = fmt(total);
    $('payment-amount-label').textContent = fmt(total);
}

function initCheckoutModal() {
    $('close-modal-btn').addEventListener('click', closeCheckoutModal);
    $('checkout-modal-overlay').addEventListener('click', e => { if (e.target === $('checkout-modal-overlay')) closeCheckoutModal(); });
    $('btn-back-checkout').addEventListener('click', () => goToCheckoutStep(1));

    $('details-form').addEventListener('submit', e => {
        e.preventDefault();
        updateCheckoutSummary();
        goToCheckoutStep(2);
    });

    $('payment-form').addEventListener('submit', async e => {
        e.preventDefault();
        const { total } = STATE.cartTotal();

        const payBtn = e.target.querySelector('.btn-form-cta');
        payBtn.disabled = true; payBtn.textContent = 'Processing...';

        // Create payment order
        const payOrderRes = await apiFetch('POST', '/payments/create-order', { amount: total, type: 'shop' });
        if (!payOrderRes.success) {
            payBtn.disabled = false; payBtn.textContent = 'Pay Now 🔒';
            showToast(`❌ ${payOrderRes.error || 'Payment setup failed'}`);
            return;
        }

        const demoPaymentId = `pay_demo_${Date.now().toString(36)}`;

        // Verify payment (demo mode)
        const verifyRes = await apiFetch('POST', '/payments/verify', {
            paymentId: demoPaymentId,
            type: 'shop',
            cartItems: STATE.cart,
            total
        });

        payBtn.disabled = false; payBtn.textContent = 'Pay Now 🔒';

        if (verifyRes.success) {
            STATE.clearCart();
            $('success-receipt-id').textContent = verifyRes.order.receiptId;
            goToCheckoutStep(3);
            renderCart();
            await STATE.loadOrders();
            renderAccount();
        } else {
            showToast(`❌ ${verifyRes.error || 'Payment failed'}`);
        }
    });

    $('btn-success-close').addEventListener('click', () => { closeCheckoutModal(); switchTab('account'); });
}

/* ===== ACCOUNT ===== */
function renderAccount() {
    if (AUTH.isLoggedIn()) {
        $('acc-avatar').textContent = AUTH.getInitial();
        $('acc-username-disp').textContent = AUTH.user.name;
        $('acc-email-disp').textContent = `⚡ ${AUTH.user.email}`;
    }
    $('acc-bookings-count').textContent = STATE.bookings.length;
    $('acc-orders-count').textContent = STATE.orders.length;

    const bookingsList = $('account-bookings-list');
    if (bookingsList) {
        if (STATE.bookings.length === 0) {
            bookingsList.innerHTML = `<div class="empty-state">No classes booked yet. <a href="#" onclick="switchTab('classes');return false;" style="color:var(--primary);font-weight:700;">Book a class →</a></div>`;
        } else {
            bookingsList.innerHTML = STATE.bookings.map(b => `
            <div class="acc-entry">
                <div>
                    <div class="acc-entry-title">${escapeHTML(b.className)}</div>
                    <div class="acc-entry-meta">${escapeHTML(b.time)} · ${escapeHTML(b.instructor)}</div>
                    <div class="acc-entry-meta" style="color:var(--primary);font-size:0.75rem;margin-top:2px;">🎫 ${escapeHTML(b.id)} ${b.paymentStatus === 'paid' ? '· ✅ Paid' : '· ⏳ Pending'}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.5rem;">
                    <span class="acc-entry-amount">${fmt(b.price)}</span>
                    <button class="btn-cancel-slot" data-cancel-booking="${escapeHTML(b.id)}">Cancel</button>
                </div>
            </div>`).join('');
            bookingsList.querySelectorAll('[data-cancel-booking]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Cancel this booking?')) return;
                    const res = await apiFetch('DELETE', `/bookings/${btn.dataset.cancelBooking}`);
                    if (res.success) { await STATE.loadAll(); renderAccount(); showToast('Booking cancelled.'); }
                });
            });
        }
    }

    const ordersList = $('account-orders-list');
    if (ordersList) {
        if (STATE.orders.length === 0) {
            ordersList.innerHTML = `<div class="empty-state">No orders yet. <a href="#" onclick="switchTab('shop');return false;" style="color:var(--primary);font-weight:700;">Shop gear →</a></div>`;
        } else {
            ordersList.innerHTML = STATE.orders.map(o => `
            <div class="acc-entry">
                <div>
                    <div class="acc-entry-title">${escapeHTML(o.receiptId)}</div>
                    <div class="acc-entry-meta">${o.items.length} item(s) · ${new Date(o.placedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · ${o.paymentStatus === 'paid' ? '✅ Paid' : '⏳'}</div>
                </div>
                <span class="acc-entry-amount">${fmt(o.total)}</span>
            </div>`).join('');
        }
    }
}

/* ===== INSTRUCTOR DASHBOARD ===== */
async function renderInstructor() {
    const statsRes = await STATE.loadStats();
    if (!statsRes.success) return;
    const { stats } = statsRes;

    $('inst-metric-bookings').textContent = stats.totalStudents;
    $('inst-metric-occupancy').textContent = `${stats.occupancyPct}%`;
    $('inst-metric-revenue').textContent = fmt(stats.grossRevenue);
    $('inst-metric-present').textContent = stats.presentCount;

    const select = $('inst-class-select');
    if (select) {
        const val = select.value;
        select.innerHTML = `<option value="all">All Classes</option>` + stats.perClass.map(c => `<option value="${c.classId}">${c.className} (${c.booked}/${c.totalSlots})</option>`).join('');
        if (val) select.value = val;
        select.onchange = () => renderRosterTable(select.value);
    }
    await renderRosterTable(select?.value || 'all');
}

async function renderRosterTable(filter = 'all') {
    const body = $('roster-table-body');
    if (!body) return;
    await STATE.loadRoster(filter);

    if (STATE.roster.length === 0) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-light);">No students yet. Click "Seed Demo Data".</td></tr>`;
        return;
    }
    body.innerHTML = STATE.roster.map(r => `
    <tr>
        <td><div class="student-name">${escapeHTML(r.name || 'Unknown')}</div></td>
        <td><div class="student-contact">${escapeHTML(r.phone || r.email || '—')}</div></td>
        <td><span class="ticket-code">${escapeHTML(r.id)}</span></td>
        <td><span class="amount-paid">${fmt(r.price || 0)}</span></td>
        <td style="font-size:0.82rem;color:var(--text-muted);">${escapeHTML(r.className)} · <span style="color:var(--text)">${escapeHTML(r.time?.split('·')[1]?.trim() || r.time)}</span></td>
        <td><span class="status-chip ${r.attended ? 'present' : 'scheduled'}">${r.attended ? '✓ Present' : '⏳ Scheduled'}</span></td>
        <td><button class="btn-mark-present ${r.attended ? 'is-checked' : ''}" data-toggle-attend="${escapeHTML(r.id)}">${r.attended ? '✓ Present' : 'Mark Present'}</button></td>
    </tr>`).join('');

    body.querySelectorAll('[data-toggle-attend]').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            const res = await apiFetch('PATCH', `/roster/${btn.dataset.toggleAttend}/attendance`);
            btn.disabled = false;
            if (res.success) {
                showToast(`${res.attended ? '✅ Present' : '⏳ Scheduled'}: ${res.name}`);
                await renderInstructor();
            }
        });
    });
}

function initSeedRoster() {
    $('btn-seed-roster').addEventListener('click', async () => {
        const btn = $('btn-seed-roster');
        btn.disabled = true; btn.textContent = 'Seeding...';
        const res = await apiFetch('POST', '/roster/seed');
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Seed Demo Data`;
        if (res.success) { showToast(`✅ Seeded ${res.added} students!`); await renderInstructor(); }
    });
}

/* ===== TOAST ===== */
function showToast(msg, dur = 3000) {
    let t = document.getElementById('zb-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'zb-toast';
        t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(20px);background:#111827;color:white;padding:0.8rem 1.5rem;border-radius:50px;font-size:0.88rem;font-weight:600;z-index:9999;opacity:0;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.2);white-space:nowrap;';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, dur);
}

/* ===== SCROLL EFFECT ===== */
function initScrollEffect() {
    const h = $('main-header');
    window.addEventListener('scroll', () => { h.style.boxShadow = window.scrollY > 40 ? '0 4px 20px rgba(0,0,0,0.08)' : 'none'; }, { passive: true });
}

/* ===== INIT ===== */
async function init() {
    initAuth();
    await STATE.loadClasses();
    if (AUTH.isLoggedIn()) await STATE.loadAll();

    initTabs();
    initHeroButtons();
    initClassFilters();
    initBookingModal();
    initCartDrawer();
    initCheckoutModal();
    initShopControls();
    initSeedRoster();
    initScrollEffect();
    renderHomePreviews();
    updateCartBadge();

    console.log('🔥 Zumboo V7 — Full Platform (Auth + Payments + WhatsApp)');
}

document.addEventListener('DOMContentLoaded', init);
