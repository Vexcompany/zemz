// controllers/musicController.js

const appleSearch = require('../services/appleSearch');
const appleDownloader = require('../services/appleDownloader');

/**
 * GET /api/apple-search?q=query
 */
const searchAppleMusic = async (req, res) => {
    try {
        const { q, region } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                status: false,
                message: 'Parameter q (query) wajib diisi'
            });
        }

        const result = await appleSearch.search(q.trim(), region || 'id');

        // Normalisasi response agar cocok dengan yang diharapkan index.html
        // index.html expects: result?.result || []
        // appleSearch returns: { status, query, region, total, data: [...] }
        return res.json({
            status: true,
            result: result.data || [],      // <-- index.html pakai searchData?.result
            total: result.total,
            query: result.query
        });

    } catch (err) {
        console.error('[searchAppleMusic]', err.message);
        return res.status(500).json({
            status: false,
            message: err.message
        });
    }
};

/**
 * POST /api/apple-download
 * Body: { url: "https://music.apple.com/..." }
 */
const downloadAppleMusic = async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || !url.trim()) {
            return res.status(400).json({
                status: false,
                message: 'Parameter url wajib diisi'
            });
        }

        const result = await appleDownloader.download(url.trim());

        // index.html expects: dlData?.result?.url || dlData?.url
        // appleDownloader returns: { status, result: { title, artist, image, duration, download: { mp3, cover } } }
        return res.json({
            status: true,
            result: {
                ...result.result,
                url: result.result?.download?.mp3 || null,  // <-- index.html pakai result?.url
            }
        });

    } catch (err) {
        console.error('[downloadAppleMusic]', err.message);
        return res.status(500).json({
            status: false,
            message: err.message
        });
    }
};

module.exports = { searchAppleMusic, downloadAppleMusic };
