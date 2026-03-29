// controllers/downloadController.js — pakai nexray downloader
// Urutan: cache → previewUrl → nexray API → error

const jsonDb          = require('../services/jsonDatabase');
const appleDownloader = require('../services/appleDownloader');

exports.download = async (req, res, next) => {
    try {
        const { url, previewUrl, forceReupload = false } = req.body;

        if (!url) {
            return res.status(400).json({ status: false, message: 'Parameter url diperlukan' });
        }

        console.log('[download] url:', url.substring(0, 80));

        // ── 1. Cache ─────────────────────────────────────────────
        if (!forceReupload) {
            try {
                const cached = await jsonDb.findTrack(url);
                if (cached?.catbox?.mp3Url) {
                    try { await jsonDb.updateAccess(url); } catch {}
                    return res.json({
                        status: true, source: 'cache',
                        result: {
                            title:    cached.title,
                            artist:   cached.artist,
                            image:    cached.image,
                            duration: cached.duration,
                            url:      cached.catbox.mp3Url,
                            download: { mp3: cached.catbox.mp3Url }
                        }
                    });
                }
            } catch (e) {
                console.warn('[download] Cache skip:', e.message);
            }
        }

        // ── 2. iTunes previewUrl (30 detik, fallback cepat) ──────
        if (previewUrl && previewUrl.trim()) {
            console.log('[download] Trying nexray first, previewUrl as fallback');
        }

        // ── 3. Nexray API (full song) ────────────────────────────
        try {
            console.log('[download] Calling nexray...');
            const result = await appleDownloader.download(url);

            if (result?.status && result.result?.download?.mp3) {
                return res.json({
                    status: true,
                    source: 'nexray',
                    result: {
                        ...result.result,
                        url: result.result.download.mp3
                    }
                });
            }
        } catch (e) {
            console.warn('[download] nexray failed:', e.message);
            // Jatuh ke previewUrl kalau nexray gagal
        }

        // ── 4. Fallback: iTunes previewUrl ───────────────────────
        if (previewUrl && previewUrl.trim()) {
            console.log('[download] Fallback to previewUrl');
            return res.json({
                status: true,
                source: 'itunes_preview',
                result: {
                    url:      previewUrl.trim(),
                    download: { mp3: previewUrl.trim() }
                }
            });
        }

        return res.status(500).json({
            status: false,
            message: 'Gagal download dari nexray dan tidak ada previewUrl'
        });

    } catch (error) {
        console.error('[download] Fatal:', error.message);
        next(error);
    }
};

exports.getInfo = async (req, res, next) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, message: 'url required' });
        try {
            const cached = await jsonDb.findTrack(url);
            if (cached) return res.json({ status: true, source: 'database',
                result: { ...cached, url: cached.catbox?.mp3Url } });
        } catch {}
        const info = await appleDownloader.download(url);
        if (info?.status) return res.json({ status: true, source: 'nexray',
            result: { ...info.result, url: info.result.download?.mp3 } });
        throw new Error('Gagal');
    } catch (e) { next(e); }
};

exports.getAllTracks = async (req, res, next) => {
    try {
        res.json({ status: true, data: await jsonDb.getAllTracks(
            parseInt(req.query.page)||1, parseInt(req.query.limit)||50) });
    } catch (e) { next(e); }
};

exports.searchLocal = async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ status: false, message: 'q required' });
        const tracks = await jsonDb.searchTracks(q);
        res.json({ status: true, query: q, total: tracks.length, data: tracks });
    } catch (e) { next(e); }
};

exports.reupload = async (req, res, next) => {
    res.json({ status: false, message: 'Tidak tersedia di Vercel serverless' });
};
