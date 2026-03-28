// controllers/downloadController.js — FINAL
// Bypass enhancedDownloader sepenuhnya karena aplmate tidak reliable di Vercel
// Langsung pakai previewUrl dari iTunes — sudah cukup untuk memutar lagu

const jsonDb          = require('../services/jsonDatabase');
const appleDownloader = require('../services/appleDownloader');

exports.download = async (req, res, next) => {
    try {
        const { url, previewUrl, skipCatbox = false, forceReupload = false } = req.body;

        if (!url) {
            return res.status(400).json({ status: false, message: 'Parameter url diperlukan' });
        }

        console.log('[download] url:', url.substring(0, 80));
        console.log('[download] previewUrl:', previewUrl ? 'ada' : 'tidak ada');

        // ── Prioritas 1: Cache database ──────────────────────────
        if (!forceReupload) {
            try {
                const cached = await jsonDb.findTrack(url);
                if (cached?.catbox?.mp3Url) {
                    console.log('[download] Cache hit:', cached.title);
                    try { await jsonDb.updateAccess(url); } catch {}
                    return res.json({
                        status: true,
                        source: 'cache',
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

        // ── Prioritas 2: iTunes previewUrl — LANGSUNG RETURN ────
        // Ini yang selalu ada karena appleSearch.js sudah include previewUrl
        if (previewUrl && previewUrl.trim()) {
            console.log('[download] Using previewUrl');
            return res.json({
                status: true,
                source: 'itunes_preview',
                result: {
                    url:      previewUrl.trim(),
                    download: { mp3: previewUrl.trim() },
                    duration: null,
                    image:    null
                }
            });
        }

        // ── Prioritas 3: Coba aplmate (sering gagal, tapi dicoba) ─
        console.log('[download] Trying aplmate...');
        try {
            const aplmateResult = await appleDownloader.download(url);
            if (aplmateResult?.status && aplmateResult.result?.download?.mp3) {
                const mp3 = aplmateResult.result.download.mp3;
                return res.json({
                    status: true,
                    source: 'aplmate',
                    result: {
                        ...aplmateResult.result,
                        url: mp3,
                        download: { mp3 }
                    }
                });
            }
        } catch (e) {
            console.warn('[download] aplmate failed:', e.message);
        }

        // ── Semua gagal ──────────────────────────────────────────
        return res.status(500).json({
            status: false,
            message: 'Tidak ada previewUrl dan aplmate gagal. Coba lagu lain.'
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
        if (info?.status) return res.json({ status: true, source: 'aplmate',
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
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ status: false, message: 'url required' });
        // Di Vercel tidak bisa reupload yang butuh filesystem, return info saja
        return res.json({ status: false, message: 'Reupload tidak tersedia di Vercel serverless' });
    } catch (e) { next(e); }
};
