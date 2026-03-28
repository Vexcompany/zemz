// controllers/downloadController.js — v2
// Strategi download (urutan prioritas):
// 1. Cek JSON database (cache) → return langsung jika ada
// 2. Pakai previewUrl dari iTunes (30s, gratis, tanpa scraping) → PALING RELIABLE
// 3. Coba aplmate scraping → sebagai bonus untuk full song
// 4. Kalau semua gagal → return error yang jelas

const enhancedDownloader = require('../services/enhancedDownloader');
const jsonDb             = require('../services/jsonDatabase');
const appleDownloader    = require('../services/appleDownloader');

exports.download = async (req, res, next) => {
    try {
        const { url, previewUrl, skipCatbox = false, forceReupload = false } = req.body;

        if (!url) {
            return res.status(400).json({ status: false, message: 'Parameter url diperlukan' });
        }

        // ── Prioritas 1: Cek cache database ─────────────────────
        if (!forceReupload) {
            try {
                const cached = await jsonDb.findTrack(url);
                if (cached?.catbox?.mp3Url) {
                    const catboxService = require('../services/catboxService');
                    const valid = await catboxService.checkUrl(cached.catbox.mp3Url);
                    if (valid) {
                        await jsonDb.updateAccess(url);
                        return res.json({
                            status: true,
                            source: 'cache',
                            result: {
                                title:    cached.title,
                                artist:   cached.artist,
                                image:    cached.image,
                                duration: cached.duration,
                                url:      cached.catbox.mp3Url,          // ← index.html pakai ini
                                download: { mp3: cached.catbox.mp3Url }
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn('[download] Cache check failed:', e.message);
            }
        }

        // ── Prioritas 2: iTunes previewUrl (30 detik, PASTI JALAN) ──
        if (previewUrl) {
            console.log('[download] Using iTunes previewUrl:', previewUrl.substring(0, 60));
            return res.json({
                status: true,
                source: 'itunes_preview',
                result: {
                    url:      previewUrl,            // ← index.html pakai ini
                    download: { mp3: previewUrl },
                    duration: null,
                    image:    null,
                    note:     'Preview 30 detik dari iTunes'
                }
            });
        }

        // ── Prioritas 3: Coba aplmate (full song, tapi sering gagal) ─
        console.log('[download] Trying aplmate for full song...');
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
            message: 'Gagal mendapatkan audio. Kirim previewUrl dari iTunes untuk preview 30 detik.'
        });

    } catch (error) {
        next(error);
    }
};

exports.getInfo = async (req, res, next) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, message: 'Parameter url diperlukan' });

        const cached = await jsonDb.findTrack(url);
        if (cached) {
            return res.json({
                status: true, source: 'database',
                result: {
                    title: cached.title, artist: cached.artist,
                    image: cached.image, duration: cached.duration,
                    url: cached.catbox?.mp3Url || null,
                    available: !!cached.catbox?.mp3Url,
                    downloadCount: cached.metadata?.downloadCount
                }
            });
        }

        const info = await appleDownloader.download(url);
        if (info.status) {
            return res.json({
                status: true, source: 'aplmate',
                result: {
                    title: info.result.title, artist: info.result.artist,
                    image: info.result.image, duration: info.result.duration,
                    url: info.result.download?.mp3 || null, available: false
                }
            });
        }
        throw new Error('Gagal mendapatkan info track');
    } catch (error) { next(error); }
};

exports.getAllTracks = async (req, res, next) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 50;
        res.json({ status: true, data: await jsonDb.getAllTracks(page, limit) });
    } catch (error) { next(error); }
};

exports.searchLocal = async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ status: false, message: 'Parameter q diperlukan' });
        const tracks = await jsonDb.searchTracks(q);
        res.json({ status: true, query: q, total: tracks.length, data: tracks });
    } catch (error) { next(error); }
};

exports.reupload = async (req, res, next) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ status: false, message: 'Parameter url diperlukan' });
        const result = await enhancedDownloader.processDownload(url, { forceReupload: true });
        if (result.result?.download) result.result.url = result.result.download.mp3 || null;
        res.json(result);
    } catch (error) { next(error); }
};
