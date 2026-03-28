// server.js

const express = require('express');
const app = express();

// ── CORS — harus paling ATAS sebelum route apapun ──────────────
const corsMiddleware = require('./middleware/cors');
app.use(corsMiddleware);

// ── Body Parser ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────────
const musicRoutes = require('./routes/musicRoutes');
app.use('/api', musicRoutes);

// ── Health Check ───────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Zemz Backend is running 🎵',
        endpoints: [
            'GET  /api/apple-search?q=query',
            'POST /api/apple-download  body: { url }'
        ]
    });
});

// ── 404 Handler ────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ status: false, message: `Route ${req.path} tidak ditemukan` });
});

// ── Error Handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.message);
    res.status(500).json({ status: false, message: err.message });
});

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

module.exports = app;
