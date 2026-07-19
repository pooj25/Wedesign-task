/* ===== ZUMBOO CONFIG ===== */
module.exports = {
    PORT: process.env.PORT || 3000,

    // JWT Auth
    JWT_SECRET: process.env.JWT_SECRET || 'zumboo-studio-secret-key-2026',
    JWT_EXPIRES_IN: '7d',

    // Razorpay (TEST MODE — no real charges)
    // Replace with your real keys from https://dashboard.razorpay.com
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_demo_key',
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_demo_secret',

    // WhatsApp Studio Number (change to your business number)
    WHATSAPP_STUDIO_NUMBER: process.env.WHATSAPP_NUMBER || '919000000000',

    // Currency
    CURRENCY: 'INR'
};
