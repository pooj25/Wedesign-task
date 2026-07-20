/* ===================================================
   ZUMBOO SERVER V2 — Auth + Payments + WhatsApp
   =================================================== */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const app = express();
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const EMPTY_DB = { users: [], bookings: [], roster: [], orders: [] };

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname), { index: 'index.html' }));

// ===== DATABASE =====
function normalizeDB(data = {}) {
    return {
        ...EMPTY_DB,
        ...data,
        users: Array.isArray(data.users) ? data.users : [],
        bookings: Array.isArray(data.bookings) ? data.bookings : [],
        roster: Array.isArray(data.roster) ? data.roster : [],
        orders: Array.isArray(data.orders) ? data.orders : []
    };
}

function readDB() {
    try {
        return normalizeDB(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')));
    } catch {
        const fresh = normalizeDB();
        writeDB(fresh);
        return fresh;
    }
}
function writeDB(data) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ===== CLASS & PRODUCT DATA =====
const CLASSES = [
    { id: 'c1', name: 'Cardio Salsa Blast', type: 'cardio', time: 'Mon/Wed/Fri · 6:30 AM', duration: '60 min', instructor: 'Priya Menon', initials: 'PM', totalSlots: 20, price: 499 },
    { id: 'c2', name: 'Neon Night Zumba', type: 'cardio', time: 'Tue/Thu · 7:00 PM', duration: '60 min', instructor: 'Karthik Raja', initials: 'KR', totalSlots: 18, price: 599 },
    { id: 'c3', name: 'Aqua Zumba Splash', type: 'aqua', time: 'Sat/Sun · 8:00 AM', duration: '45 min', instructor: 'Deepa Latha', initials: 'DL', totalSlots: 12, price: 799 },
    { id: 'c4', name: 'Zumba Gold (55+)', type: 'toning', time: 'Mon/Wed · 10:00 AM', duration: '50 min', instructor: 'Anita Sharma', initials: 'AS', totalSlots: 15, price: 399 },
    { id: 'c5', name: 'HIIT Cardio Beats', type: 'cardio', time: 'Tue/Thu/Sat · 5:30 AM', duration: '45 min', instructor: 'Rajan Murthy', initials: 'RM', totalSlots: 20, price: 699 },
    { id: 'c6', name: 'Zumba Toning Body', type: 'toning', time: 'Mon/Wed/Fri · 8:00 AM', duration: '55 min', instructor: 'Meera Nair', initials: 'MN', totalSlots: 16, price: 549 },
];
const PROMO_CODES = { ZUMBOO10: 10, DANCE20: 20, VIP50: 50 };

// ===== AUTH MIDDLEWARE =====
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Login required' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, config.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// Optional auth — sets req.user if token present, but doesn't block
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(authHeader.split(' ')[1], config.JWT_SECRET);
        } catch { }
    }
    next();
}

// =============================================
//  AUTH ROUTES
// =============================================

// POST /api/auth/register
app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const db = readDB();
    if (!db.users) db.users = [];

    if (db.users.find(u => u.email === email.toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
        id: `USR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        name,
        email: email.toLowerCase(),
        phone,
        password: hashedPassword,
        role: 'student',
        createdAt: new Date().toISOString()
    };

    db.users.push(user);
    writeDB(db);

    const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN }
    );

    console.log(`👤 NEW USER: ${user.name} (${user.email})`);
    res.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
}));

// POST /api/auth/login
app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const db = readDB();
    if (!db.users) db.users = [];

    const user = db.users.find(u => u.email === email.toLowerCase());
    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN }
    );

    console.log(`🔓 LOGIN: ${user.name}`);
    res.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
}));

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

// =============================================
//  CLASSES
// =============================================

app.get('/api/classes', (req, res) => {
    const db = readDB();
    const classesWithSlots = CLASSES.map(cls => {
        const bookedCount = db.bookings.filter(b => b.classId === cls.id).length;
        return { ...cls, bookedCount, slotsLeft: cls.totalSlots - bookedCount, isFull: (cls.totalSlots - bookedCount) <= 0 };
    });
    res.json({ success: true, classes: classesWithSlots });
});

app.get('/api/classes/:id', (req, res) => {
    const cls = CLASSES.find(c => c.id === req.params.id);
    if (!cls) return res.status(404).json({ success: false, error: 'Class not found' });
    const db = readDB();
    const bookings = db.bookings.filter(b => b.classId === cls.id);
    const bookedCount = bookings.length;
    res.json({
        success: true,
        class: { ...cls, bookedCount, slotsLeft: cls.totalSlots - bookedCount, isFull: (cls.totalSlots - bookedCount) <= 0 },
        students: bookings.map(b => ({ id: b.id, name: b.name, phone: b.phone, bookedAt: b.bookedAt }))
    });
});

// =============================================
//  BOOKINGS (auth required)
// =============================================

app.post('/api/bookings', authMiddleware, (req, res) => {
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ success: false, error: 'classId is required' });

    const cls = CLASSES.find(c => c.id === classId);
    if (!cls) return res.status(404).json({ success: false, error: 'Class not found' });

    const db = readDB();
    const bookedCount = db.bookings.filter(b => b.classId === classId).length;
    if (bookedCount >= cls.totalSlots) {
        return res.status(400).json({ success: false, error: 'Class is full' });
    }

    const already = db.bookings.find(b => b.classId === classId && b.userId === req.user.id);
    if (already) {
        return res.status(400).json({ success: false, error: 'You already booked this class' });
    }

    const id = `ZB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const booking = {
        id, classId: cls.id, className: cls.name, time: cls.time,
        instructor: cls.instructor, price: cls.price,
        userId: req.user.id, name: req.user.name, phone: req.user.phone, email: req.user.email,
        paymentStatus: 'pending',
        bookedAt: new Date().toISOString()
    };

    db.bookings.push(booking);
    db.roster.push({ ...booking, rosterType: 'booking', attended: false });
    writeDB(db);

    const slotsLeft = cls.totalSlots - (bookedCount + 1);

    // Generate WhatsApp link
    const waMsg = encodeURIComponent(
        `🎉 *New Booking Confirmed!*\n\n` +
        `👤 Student: ${req.user.name}\n` +
        `📞 Phone: ${req.user.phone}\n` +
        `💃 Class: ${cls.name}\n` +
        `📅 Time: ${cls.time}\n` +
        `🎫 Ticket: ${id}\n` +
        `💰 Amount: ₹${cls.price}\n\n` +
        `Booked via Zumboo Studio 🔥`
    );
    const whatsappLink = `https://wa.me/${config.WHATSAPP_STUDIO_NUMBER}?text=${waMsg}`;

    console.log(`📅 BOOKING: ${req.user.name} → ${cls.name} (${slotsLeft} slots left)`);
    res.json({ success: true, booking, slotsLeft, whatsappLink });
});

app.get('/api/bookings', authMiddleware, (req, res) => {
    const db = readDB();
    const userBookings = db.bookings.filter(b => b.userId === req.user.id);
    res.json({ success: true, bookings: userBookings });
});

app.delete('/api/bookings/:id', authMiddleware, (req, res) => {
    const db = readDB();
    const idx = db.bookings.findIndex(b => b.id === req.params.id && b.userId === req.user.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Booking not found' });

    const cancelled = db.bookings[idx];
    db.bookings.splice(idx, 1);
    db.roster = db.roster.filter(r => r.id !== req.params.id);
    writeDB(db);

    console.log(`❌ CANCELLED: ${cancelled.name} — ${cancelled.className}`);
    res.json({ success: true, message: 'Booking cancelled' });
});

// =============================================
//  PAYMENTS (Razorpay)
// =============================================

// Create payment order
app.post('/api/payments/create-order', authMiddleware, (req, res) => {
    const { amount, type, itemId } = req.body;
    if (!amount || !type) {
        return res.status(400).json({ success: false, error: 'amount and type required' });
    }

    // In test/demo mode we create a mock order since we don't have real Razorpay keys
    const orderId = `order_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    console.log(`💳 PAYMENT ORDER: ₹${amount} for ${type} (${orderId})`);
    res.json({
        success: true,
        order: {
            id: orderId,
            amount: amount * 100, // Razorpay uses paise
            currency: config.CURRENCY,
            type,
            itemId
        },
        razorpayKeyId: config.RAZORPAY_KEY_ID
    });
});

// Verify payment
app.post('/api/payments/verify', authMiddleware, (req, res) => {
    const { orderId, paymentId, signature, type, bookingId, cartItems, total } = req.body;

    // In demo mode, we accept all payments
    // In production, verify signature: razorpay_order_id|razorpay_payment_id with HMAC SHA256

    const db = readDB();

    if (type === 'booking' && bookingId) {
        // Update booking payment status
        const booking = db.bookings.find(b => b.id === bookingId && b.userId === req.user.id);
        if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

        booking.paymentStatus = 'paid';
        booking.paymentId = paymentId || `pay_demo_${Date.now().toString(36)}`;
        booking.paidAt = new Date().toISOString();

        const rosterEntry = db.roster.find(r => r.id === bookingId);
        if (rosterEntry) {
            rosterEntry.paymentStatus = 'paid';
            rosterEntry.paymentId = booking.paymentId;
        }
    }

    if (type === 'shop' && cartItems) {
        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'Cart items are required' });
        }
        const orderTotal = Number(total);
        if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
            return res.status(400).json({ success: false, error: 'Valid total is required' });
        }

        // Create shop order
        const receiptId = `#ZB-${Date.now().toString(36).toUpperCase()}`;
        const order = {
            receiptId,
            customer: { name: req.user.name, email: req.user.email, phone: req.user.phone },
            userId: req.user.id,
            items: cartItems,
            total: orderTotal,
            paymentId: paymentId || `pay_demo_${Date.now().toString(36)}`,
            paymentStatus: 'paid',
            placedAt: new Date().toISOString()
        };
        db.orders.push(order);
        console.log(`🛍️ ORDER PAID: ${receiptId} — ₹${total}`);
        writeDB(db);
        return res.json({ success: true, order });
    }

    writeDB(db);
    console.log(`✅ PAYMENT VERIFIED: ${paymentId || 'demo'}`);
    res.json({ success: true, message: 'Payment verified' });
});

// =============================================
//  ROSTER & ATTENDANCE
// =============================================

app.get('/api/roster', (req, res) => {
    const db = readDB();
    let roster = db.roster || [];
    if (req.query.classId && req.query.classId !== 'all') {
        roster = roster.filter(r => r.classId === req.query.classId);
    }
    res.json({ success: true, roster, total: roster.length });
});

app.patch('/api/roster/:id/attendance', (req, res) => {
    const db = readDB();
    const entry = db.roster.find(r => r.id === req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });

    entry.attended = !entry.attended;
    writeDB(db);

    console.log(`${entry.attended ? '✅ PRESENT' : '⏳ SCHEDULED'}: ${entry.name} — ${entry.className}`);
    res.json({ success: true, id: entry.id, attended: entry.attended, name: entry.name });
});

app.post('/api/roster/seed', (req, res) => {
    const db = readDB();
    const samples = [
        { name: 'Ananya Krishnan', phone: '+91 99001 11234' },
        { name: 'Rahul Suresh', phone: '+91 98765 43210' },
        { name: 'Meenakshi Iyer', phone: '+91 90001 23456' },
        { name: 'Arjun Dev', phone: '+91 89001 44567' },
        { name: 'Divya Pillai', phone: '+91 99888 77665' },
        { name: 'Suresh Babu', phone: '+91 77001 88234' },
        { name: 'Lakshmi Priya', phone: '+91 88001 99345' },
        { name: 'Vikram Raj', phone: '+91 97001 22456' },
        { name: 'Sneha Reddy', phone: '+91 96001 33567' },
        { name: 'Arun Kumar', phone: '+91 95001 44678' },
        { name: 'Preethi Nair', phone: '+91 94001 55789' },
        { name: 'Kiran Mohan', phone: '+91 93001 66890' },
    ];
    let added = 0;
    samples.forEach((s, i) => {
        const cls = CLASSES[i % CLASSES.length];
        const id = `ZB-SEED${(i + 1).toString().padStart(3, '0')}`;
        if (db.roster.find(r => r.id === id)) return;
        const entry = {
            id, classId: cls.id, className: cls.name, time: cls.time,
            instructor: cls.instructor, price: cls.price,
            name: s.name, phone: s.phone, rosterType: 'seed',
            attended: i % 3 === 0, paymentStatus: 'paid',
            bookedAt: new Date().toISOString()
        };
        db.roster.push(entry);
        db.bookings.push(entry);
        added++;
    });
    writeDB(db);
    console.log(`🌱 Seeded ${added} demo students`);
    res.json({ success: true, added, total: db.roster.length });
});

// =============================================
//  STATS (Instructor Dashboard)
// =============================================

app.get('/api/stats', (req, res) => {
    const db = readDB();
    const roster = db.roster || [];
    const totalStudents = roster.length;
    const presentCount = roster.filter(r => r.attended).length;
    const totalSlots = CLASSES.reduce((s, c) => s + c.totalSlots, 0);
    const occupancyPct = totalSlots > 0 ? Math.round((totalStudents / totalSlots) * 100) : 0;
    const grossRevenue = roster.reduce((s, r) => s + (r.price || 0), 0);
    const paidCount = roster.filter(r => r.paymentStatus === 'paid').length;

    const perClass = CLASSES.map(cls => {
        const cr = roster.filter(r => r.classId === cls.id);
        return {
            classId: cls.id, className: cls.name, time: cls.time,
            instructor: cls.instructor, booked: cr.length,
            present: cr.filter(r => r.attended).length,
            paid: cr.filter(r => r.paymentStatus === 'paid').length,
            totalSlots: cls.totalSlots,
            slotsLeft: cls.totalSlots - cr.length,
            revenue: cr.reduce((s, r) => s + (r.price || 0), 0)
        };
    });

    res.json({
        success: true,
        stats: { totalStudents, presentCount, paidCount, totalSlots, occupancyPct, grossRevenue, perClass }
    });
});

// =============================================
//  ORDERS
// =============================================

app.post('/api/orders', authMiddleware, (req, res) => {
    const { customer, items, total, promoCode } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, error: 'Items required' });

    const db = readDB();
    const receiptId = `#ZB-${Date.now().toString(36).toUpperCase()}`;
    const order = {
        receiptId, customer: customer || { name: req.user.name, email: req.user.email, phone: req.user.phone },
        userId: req.user.id, items, total,
        promoCode: promoCode || null,
        paymentStatus: 'pending',
        placedAt: new Date().toISOString()
    };
    db.orders.push(order);
    writeDB(db);
    console.log(`🛍️ ORDER: ${receiptId} — ${items.length} items — ₹${total}`);
    res.json({ success: true, order });
});

app.get('/api/orders', authMiddleware, (req, res) => {
    const db = readDB();
    const userOrders = (db.orders || []).filter(o => o.userId === req.user.id);
    res.json({ success: true, orders: userOrders });
});

// =============================================
//  PROMO CODES
// =============================================

app.post('/api/promo/validate', (req, res) => {
    const { code } = req.body;
    const pct = PROMO_CODES[code?.toUpperCase()];
    if (pct) res.json({ success: true, code: code.toUpperCase(), discountPct: pct });
    else res.json({ success: false, error: 'Invalid promo code' });
});

app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
});

// =============================================
//  CATCH-ALL
// =============================================

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// =============================================
//  START
// =============================================

app.listen(config.PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║       🔥 ZUMBOO PLATFORM V2 IS LIVE! 🔥       ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log(`║  🌐 Frontend:   http://localhost:${config.PORT}          ║`);
    console.log(`║  📡 API:        http://localhost:${config.PORT}/api      ║`);
    console.log('║  🔐 Auth:       JWT + bcrypt                  ║');
    console.log('║  💳 Payments:   Razorpay (Test Mode)          ║');
    console.log('║  📱 WhatsApp:   Auto-link on booking          ║');
    console.log('║  📁 Database:   data/db.json                  ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
});
