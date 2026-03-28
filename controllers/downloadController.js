const enhancedDownloader = require('../services/enhancedDownloader');
const jsonDb = require('../services/jsonDatabase');

exports.download = async (req, res, next) => {
    try {
        const { url, skipCatbox = false, forceReupload = false } = req.body;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: 'Parameter url diperlukan dalam body'
            });
        }

        const result = await enhancedDownloader.processDownload(url, {
            skipCatbox,
            forceReupload
        });

        // Jika sedang processing
        if (result.status === 'processing') {
            return res.status(202).json(result);
        }

        res.json(result);

    } catch (error) {
        next(error);
    }
};

exports.getInfo = async (req, res, next) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: 'Parameter url diperlukan'
            });
        }

        // Cek database dulu
        const existingTrack = await jsonDb.findTrack(url);
        if (existingTrack) {
            return res.json({
                status: true,
                source: 'database',
                result: {
                    title: existingTrack.title,
                    artist: existingTrack.artist,
                    image: existingTrack.image,
                    duration: existingTrack.duration,
                    available: !!existingTrack.catbox?.mp3Url,
                    downloadCount: existingTrack.metadata?.downloadCount
                }
            });
        }

        // Jika tidak ada di DB, ambil dari AplMate tanpa download
        const appleDownloader = require('../services/appleDownloader');
        const info = await appleDownloader.download(url);
        
        if (info.status) {
            res.json({
                status: true,
                source: 'aplmate',
                result: {
                    title: info.result.title,
                    artist: info.result.artist,
                    image: info.result.image,
                    duration: info.result.duration,
                    available: false
                }
            });
        } else {
            throw new Error('Gagal mendapatkan info track');
        }

    } catch (error) {
        next(error);
    }
};

/**
 * Get all tracks from database (with pagination)
 */
exports.getAllTracks = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        
        const result = await jsonDb.getAllTracks(page, limit);
        
        res.json({
            status: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Search in local database
 */
exports.searchLocal = async (req, res, next) => {
    try {
        const { q } = req.query;
        
        if (!q) {
            return res.status(400).json({
                status: false,
                message: 'Parameter q diperlukan'
            });
        }

        const tracks = await jsonDb.searchTracks(q);
        
        res.json({
            status: true,
            query: q,
            total: tracks.length,
            data: tracks
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Force reupload to Catbox
 */
exports.reupload = async (req, res, next) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                status: false,
                message: 'Parameter url diperlukan'
            });
        }

        const result = await enhancedDownloader.processDownload(url, {
            forceReupload: true
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
};