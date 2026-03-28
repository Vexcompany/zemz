// server.js — FIXED

const express = require('express');
const app = express();

// ── CORS — paling ATAS sebelum route apapun ─────────────────────
const corsMiddleware = require('./middleware/cors');
app.use(corsMiddleware);

// ── Body Parser ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ──────────────────────────────────────────────────────
const searchRoutes   = require('./routes/search');
const downloadRoutes = require('./routes/download');

// index.html panggil: GET  /api/apple-search?q=
app.use('/api/apple-search', searchRoutes);

// index.html panggil: POST /api/apple-download
app.use('/api/apple-download', downloadRoutes);

// index.html panggil: POST /api/catbox-upload
// (sudah ditangani oleh downloadRoutes lewat endpoint POST /)
// Tapi ada endpoint terpisah, mapping di sini:
app.post('/api/catbox-upload', async (req, res) => {
    try {
        const { audioUrl, title, artist } = req.body;
        if (!audioUrl) return res.status(400).json({ status: false, message: 'audioUrl required' });

        const catboxService = require('./services/catboxService');
        const filename = `${title || 'track'} - ${artist || 'unknown'}.mp3`
            .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
            .trim();

        const catboxUrl = await catboxService.uploadFromUrl(audioUrl, filename);
        res.json({ success: true, catboxUrl });
    } catch (err) {
        console.error('[catbox-upload]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Health Check ────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Zemz Backend is running 🎵',
        endpoints: [
            'GET  /api/apple-search?q=query',
            'POST /api/apple-download  body: { url }',
            'POST /api/catbox-upload   body: { audioUrl, title, artist }'
        ]
    });
});

// ── 404 Handler ─────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ status: false, message: `Route ${req.method} ${req.path} tidak ditemukan` });
});

// ── Error Handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.message);
    res.status(500).json({ status: false, message: err.message });
});

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

module.exports = app;
