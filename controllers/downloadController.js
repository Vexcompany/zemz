// controllers/downloadController.js — v3 FINAL
// Fix: semua jsonDb call dibungkus try-catch agar tidak crash di Vercel

const enhancedDownloader = require('../services/enhancedDownloader');
const jsonDb             = require('../services/jsonDatabase');
const appleDownloader    = require('../services/appleDownloader');

exports.download = async (req, res, next) => {
    try {
        const { url, previewUrl, skipCatbox = false, forceReupload = false } = req.body;

        if (!url) {
            return res.status(400).json({ status: false, message: 'Parameter url diperlukan' });
        }

        console.log('[download] url:', url.substring(0, 80));
        console.log('[download] previewUrl:', previewUrl ? previewUrl.substring(0, 60) : 'none');

        // ── Prioritas 1: Cache database ──────────────────────────
        if (!forceReupload) {
            try {
                const cached = await jsonDb.findTrack(url);
                if (cached?.catbox?.mp3Url) {
                    console.log('[download] Found in cache:', cached.title);
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
                console.warn('[download] Cache check failed (ok):', e.message);
            }
        }

        // ── Prioritas 2: iTunes previewUrl — PALING RELIABLE ────
        if (previewUrl && previewUrl.trim()) {
            console.log('[download] Using iTunes previewUrl');
            return res.json({
                status: true,
                source: 'itunes_preview',
                result: {
                    url:      previewUrl,
                    download: { mp3: previewUrl },
                    duration: null,
                    image:    null
                }
            });
        }

        // ── Prioritas 3: Aplmate full song ───────────────────────
        console.log('[download] Trying aplmate...');
        try {
            const result = await enhancedDownloader.processDownload(url, { skipCatbox, forceReupload });

            if (result.status === 'processing') {
                return res.status(202).json(result);
            }
            if (result.status === true && result.result?.download?.mp3) {
                result.result.url = result.result.download.mp3;
                return res.json(result);
            }
        } catch (e) {
            console.warn('[download] aplmate failed:', e.message);
        }

        // ── Semua gagal ──────────────────────────────────────────
        return res.status(500).json({
            status: false,
            message: 'Gagal mendapatkan audio. pastikan previewUrl dikirim dari frontend.'
        });

    } catch (error) {
        console.error('[download] Unexpected error:', error.message);
        next(error);
    }
};

exports.getInfo = async (req, res, next) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, message: 'url required' });
        try {
            const cached = await jsonDb.findTrack(url);
            if (cached) return res.json({ status: true, source: 'database', result: { ...cached, url: cached.catbox?.mp3Url } });
        } catch {}
        const info = await appleDownloader.download(url);
        if (info.status) return res.json({ status: true, source: 'aplmate', result: { ...info.result, url: info.result.download?.mp3 } });
        throw new Error('Gagal mendapatkan info');
    } catch (error) { next(error); }
};

exports.getAllTracks = async (req, res, next) => {
    try {
        const data = await jsonDb.getAllTracks(parseInt(req.query.page)||1, parseInt(req.query.limit)||50);
        res.json({ status: true, data });
    } catch (error) { next(error); }
};

exports.searchLocal = async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ status: false, message: 'q required' });
        const tracks = await jsonDb.searchTracks(q);
        res.json({ status: true, query: q, total: tracks.length, data: tracks });
    } catch (error) { next(error); }
};

exports.reupload = async (req, res, next) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ status: false, message: 'url required' });
        const result = await enhancedDownloader.processDownload(url, { forceReupload: true });
        if (result.result?.download) result.result.url = result.result.download.mp3 || null;
        res.json(result);
    } catch (error) { next(error); }
};
