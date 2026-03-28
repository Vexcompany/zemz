const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const musicRoutes = require('./routes/musicRoutes');
app.use('/api', musicRoutes);

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['https://vexcompany.github.io', 'http://localhost:3000', '*'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ══════════════════════════════════════════════════════════════
//  JSON DATABASE (Simpan metadata track & URL Catbox)
// ══════════════════════════════════════════════════════════════
const DB_PATH = path.join(__dirname, 'data', 'tracks.json');

async function initDB() {
    try {
        await fs.access(path.dirname(DB_PATH));
    } catch {
        await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    }
    try {
        await fs.access(DB_PATH);
    } catch {
        await fs.writeFile(DB_PATH, JSON.stringify({ tracks: [], lastUpdated: new Date().toISOString() }, null, 2));
    }
}

async function readDB() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch {
        return { tracks: [], lastUpdated: new Date().toISOString() };
    }
}

async function writeDB(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// ══════════════════════════════════════════════════════════════
//  CATBOX SERVICE (Upload file ke Catbox.moe)
// ══════════════════════════════════════════════════════════════
async function uploadToCatbox(fileUrl, filename) {
    try {
        // 1. Download file dari URL sumber (AplMate, YouTube, dll)
        console.log(`[Catbox] Downloading from: ${fileUrl}`);
        const fileRes = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 50 * 1024 * 1024, // Max 50MB
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const buffer = Buffer.from(fileRes.data);
        console.log(`[Catbox] File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

        // 2. Upload ke Catbox menggunakan form-data
        const form = new FormData();
        form.append('fileToUpload', buffer, {
            filename: filename,
            contentType: 'audio/mpeg'
        });
        form.append('reqtype', 'fileupload');
        
        // Optional: tambah userhash jika punya akun Catbox
        // form.append('userhash', 'YOUR_CATBOX_USERHASH');

        console.log(`[Catbox] Uploading: ${filename}`);
        const uploadRes = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000,
            maxBodyLength: 100 * 1024 * 1024
        });

        const catboxUrl = uploadRes.data.trim();
        if (!catboxUrl.includes('https://')) {
            throw new Error('Invalid Catbox response: ' + catboxUrl);
        }

        console.log(`[Catbox] Success: ${catboxUrl}`);
        return catboxUrl;

    } catch (err) {
        console.error('[Catbox Error]', err.message);
        throw new Error('Catbox upload failed: ' + err.message);
    }
}

// ══════════════════════════════════════════════════════════════
//  API ENDPOINTS
// ══════════════════════════════════════════════════════════════

// Health check
app.get('/api/health', async (req, res) => {
    const db = await readDB();
    res.json({
        status: 'OK',
        service: 'Pagaska Music Backend',
        database: {
            totalTracks: db.tracks.length,
            lastUpdated: db.lastUpdated
        },
        timestamp: new Date().toISOString()
    });
});

// Upload ke Catbox dan simpan ke database
app.post('/api/catbox-upload', async (req, res) => {
    try {
        const { audioUrl, title, artist, trackId } = req.body;
        
        if (!audioUrl || !title || !artist) {
            return res.status(400).json({
                success: false,
                message: 'audioUrl, title, dan artist diperlukan'
            });
        }

        // Generate filename yang aman
        const safeFilename = `${title}-${artist}`
            .replace(/[^a-zA-Z0-9]/g, '-')
            .substring(0, 40) + '.mp3';

        // Upload ke Catbox
        const catboxUrl = await uploadToCatbox(audioUrl, safeFilename);

        // Simpan ke JSON database
        const db = await readDB();
        const existingIndex = db.tracks.findIndex(t => t.trackId === trackId);
        
        const trackData = {
            trackId: trackId || `track_${Date.now()}`,
            title,
            artist,
            originalUrl: audioUrl,
            catboxUrl: catboxUrl,
            uploadedAt: new Date().toISOString(),
            playCount: 0,
            lastAccessed: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            // Update existing
            db.tracks[existingIndex] = {
                ...db.tracks[existingIndex],
                catboxUrl: catboxUrl,
                lastAccessed: new Date().toISOString()
            };
        } else {
            // Tambah baru
            db.tracks.push(trackData);
        }

        db.lastUpdated = new Date().toISOString();
        await writeDB(db);

        res.json({
            success: true,
            catboxUrl: catboxUrl,
            message: 'Upload berhasil dan tersimpan',
            track: trackData
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// Cek apakah track sudah ada di database
app.get('/api/track-exists', async (req, res) => {
    try {
        const { trackId, title, artist } = req.query;
        const db = await readDB();
        
        let track = null;
        if (trackId) {
            track = db.tracks.find(t => t.trackId === trackId);
        } else if (title && artist) {
            const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
            const normalizedArtist = artist.toLowerCase().replace(/[^\w\s]/g, '');
            track = db.tracks.find(t => 
                t.title.toLowerCase().replace(/[^\w\s]/g, '') === normalizedTitle &&
                t.artist.toLowerCase().replace(/[^\w\s]/g, '') === normalizedArtist
            );
        }

        if (track && track.catboxUrl) {
            // Verifikasi URL masih valid
            try {
                const checkRes = await axios.head(track.catboxUrl, { timeout: 5000 });
                if (checkRes.status === 200) {
                    // Update last accessed
                    track.lastAccessed = new Date().toISOString();
                    await writeDB(db);
                    
                    return res.json({
                        exists: true,
                        catboxUrl: track.catboxUrl,
                        track: track
                    });
                }
            } catch {
                // URL expired, hapus dari database
                db.tracks = db.tracks.filter(t => t.trackId !== track.trackId);
                await writeDB(db);
            }
        }

        res.json({ exists: false });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// Get semua tracks dari database
app.get('/api/tracks', async (req, res) => {
    try {
        const { page = 1, limit = 50, search } = req.query;
        const db = await readDB();
        
        let tracks = db.tracks;
        
        // Filter pencarian
        if (search) {
            const normalizedSearch = search.toLowerCase();
            tracks = tracks.filter(t => 
                t.title.toLowerCase().includes(normalizedSearch) ||
                t.artist.toLowerCase().includes(normalizedSearch)
            );
        }

        // Pagination
        const start = (page - 1) * limit;
        const end = start + parseInt(limit);
        const paginatedTracks = tracks.slice(start, end);

        res.json({
            success: true,
            total: tracks.length,
            page: parseInt(page),
            totalPages: Math.ceil(tracks.length / limit),
            data: paginatedTracks
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// Apple Music Search (Proxy ke API Deline)
app.get('/api/apple-search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, message: 'Query diperlukan' });
        }

        const response = await axios.get(`https://api.deline.web.id/search/applemusic?q=${encodeURIComponent(q)}`, {
            timeout: 15000
        });

        res.json(response.data);

    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Apple Music search failed: ' + err.message
        });
    }
});

// Apple Music Download (Proxy ke API Deline)
app.post('/api/apple-dl', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'URL diperlukan' });
        }

        const response = await axios.post('https://api.deline.web.id/downloader/applemusic', {
            url: url
        }, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);

    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Apple Music download failed: ' + err.message
        });
    }
});

// YouTube Search (Proxy dengan cache)
app.get('/api/yt-search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, message: 'Query diperlukan' });
        }

        // Cek cache di database
        const db = await readDB();
        const cached = db.tracks.find(t => 
            t.searchQuery?.toLowerCase() === q.toLowerCase() &&
            t.catboxUrl
        );

        if (cached) {
            return res.json({
                success: true,
                source: 'cache',
                data: [cached]
            });
        }

        // Proxy ke Anabot atau sumber lain
        const response = await axios.get(`https://anabot.vanakam.workers.dev/?search=${encodeURIComponent(q)}`, {
            timeout: 15000
        });

        res.json({
            success: true,
            source: 'anabot',
            data: response.data
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'YouTube search failed: ' + err.message
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Backend running on port ${PORT}`);
        console.log(`📁 Database: ${DB_PATH}`);
        console.log(`🐱 Catbox integration: ENABLED`);
    });
});
