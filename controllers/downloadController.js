// controllers/downloadController.js — FINAL dengan Supabase Storage
// Alur: cache DB → nexray download → upload Supabase Storage → simpan URL ke tracks table
// Kalau nexray gagal → fallback previewUrl iTunes (30 detik)

const jsonDb            = require('../services/jsonDatabase');
const appleDownloader   = require('../services/appleDownloader');
const supabaseStorage   = require('../services/supabaseStorage');
const axios             = require('axios');

const SB_URL = process.env.SUPABASE_URL || 'https://ygwoddwdhelqcwhpqasl.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnd29kZHdkaGVscWN3aHBxYXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTEwNzcsImV4cCI6MjA4NzQyNzA3N30.y0tnci0aWnhWYpxb9v7M7I0X9ss-jAt0JvpOBnZgFzo';

// Helper: simpan track ke tabel tracks di Supabase
async function saveTrackToSupabase(track) {
    try {
        const body = JSON.stringify({
            id:          track.id,
            title:       track.title,
            artist:      track.artist,
            thumbnail:   track.image    || null,
            duration:    track.duration || null,
            audio_url:   track.audioUrl,
            play_count:  1,
            last_played: new Date().toISOString(),
            source:      'apple'
        });

        // Upsert — update kalau sudah ada, insert kalau belum
        await axios.post(
            `${SB_URL}/rest/v1/tracks`,
            body,
            {
                headers: {
                    'apikey':        SB_KEY,
                    'Authorization': `Bearer ${SB_KEY}`,
                    'Content-Type':  'application/json',
                    'Prefer':        'resolution=merge-duplicates,return=minimal'
                },
                params: { on_conflict: 'id' }
            }
        );
        console.log('[saveTrack] Saved to Supabase tracks:', track.title);
    } catch (e) {
        console.warn('[saveTrack] Failed:', e.message);
    }
}

exports.download = async (req, res, next) => {
    try {
        const { url, previewUrl, title, artist, thumbnail, forceReupload = false } = req.body;

        if (!url) return res.status(400).json({ status: false, message: 'url diperlukan' });

        console.log('[download]', url.substring(0, 80));

        // ── 1. Cek tabel tracks di Supabase dulu (cache) ─────────
        if (!forceReupload) {
            try {
                const trackId = url.match(/[?&]i=(\d+)/)?.[1];
                if (trackId) {
                    const cacheRes = await axios.get(`${SB_URL}/rest/v1/tracks`, {
                        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
                        params:  { id: `eq.${trackId}`, select: '*', limit: 1 }
                    });
                    const cached = cacheRes.data?.[0];
                    if (cached?.audio_url) {
                        console.log('[download] Cache hit:', cached.title);
                        return res.json({
                            status: true, source: 'cache',
                            result: {
                                title:    cached.title,
                                artist:   cached.artist,
                                image:    cached.thumbnail,
                                duration: cached.duration,
                                url:      cached.audio_url,
                                download: { mp3: cached.audio_url }
                            }
                        });
                    }
                }
            } catch (e) { console.warn('[download] Cache skip:', e.message); }
        }

        // ── 2. Download dari nexray ───────────────────────────────
        let nexrayMp3 = null;
        let trackMeta = { title: title || 'Unknown', artist: artist || 'Unknown', image: thumbnail || null, duration: null };

        try {
            console.log('[download] Calling nexray...');
            const result = await appleDownloader.download(url);
            if (result?.status && result.result?.download?.mp3) {
                nexrayMp3 = result.result.download.mp3;
                trackMeta = {
                    title:    result.result.title    || title    || 'Unknown',
                    artist:   result.result.artist   || artist   || 'Unknown',
                    image:    result.result.image    || thumbnail || null,
                    duration: result.result.duration || null
                };
                console.log('[download] nexray OK:', nexrayMp3.substring(0, 60));
            }
        } catch (e) {
            console.warn('[download] nexray failed:', e.message);
        }

        // ── 3. Upload ke Supabase Storage (background, tidak block response) ──
        if (nexrayMp3) {
            // Return dulu ke frontend agar langsung bisa diputar
            const filename = supabaseStorage.sanitizeFilename(trackMeta.title, trackMeta.artist);

            // Cek apakah file sudah ada di storage
            const existingUrl = await supabaseStorage.fileExists(filename);
            if (existingUrl) {
                console.log('[download] Already in storage:', existingUrl);
                saveTrackToSupabase({ ...trackMeta, id: url.match(/[?&]i=(\d+)/)?.[1] || `apple_${Date.now()}`, audioUrl: existingUrl });
                return res.json({
                    status: true, source: 'supabase_storage',
                    result: { ...trackMeta, url: existingUrl, download: { mp3: existingUrl } }
                });
            }

            // Return nexray URL dulu agar langsung bisa diputar
            res.json({
                status: true, source: 'nexray',
                result: { ...trackMeta, url: nexrayMp3, download: { mp3: nexrayMp3 } }
            });

            // Upload ke Supabase Storage di background
            setImmediate(async () => {
                try {
                    console.log('[background] Uploading to Supabase Storage...');
                    const supabaseUrl = await supabaseStorage.uploadFromUrl(nexrayMp3, filename);
                    const trackId = url.match(/[?&]i=(\d+)/)?.[1] || `apple_${Date.now()}`;
                    await saveTrackToSupabase({ ...trackMeta, id: trackId, audioUrl: supabaseUrl });
                    console.log('[background] Done! Saved:', supabaseUrl);
                } catch (e) {
                    console.warn('[background] Upload failed:', e.message);
                    // Simpan nexray URL sebagai fallback
                    const trackId = url.match(/[?&]i=(\d+)/)?.[1] || `apple_${Date.now()}`;
                    saveTrackToSupabase({ ...trackMeta, id: trackId, audioUrl: nexrayMp3 });
                }
            });
            return; // res sudah dikirim
        }

        // ── 4. Fallback: iTunes previewUrl ────────────────────────
        if (previewUrl && previewUrl.trim()) {
            console.log('[download] Fallback to previewUrl');
            return res.json({
                status: true, source: 'itunes_preview',
                result: { ...trackMeta, url: previewUrl.trim(), download: { mp3: previewUrl.trim() } }
            });
        }

        return res.status(500).json({ status: false, message: 'Gagal download dari nexray dan tidak ada previewUrl' });

    } catch (error) {
        console.error('[download] Fatal:', error.message);
        next(error);
    }
};

exports.getInfo    = async (req, res, next) => { res.json({ status: true, message: 'ok' }); };
exports.getAllTracks = async (req, res, next) => {
    try {
        const r = await axios.get(`${SB_URL}/rest/v1/tracks`, {
            headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
            params:  { select: '*', order: 'last_played.desc', limit: 50 }
        });
        res.json({ status: true, data: r.data });
    } catch (e) { next(e); }
};
exports.searchLocal = async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ status: false, message: 'q required' });
        const r = await axios.get(`${SB_URL}/rest/v1/tracks`, {
            headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
            params:  { select: '*', or: `title.ilike.%${q}%,artist.ilike.%${q}%` }
        });
        res.json({ status: true, data: r.data });
    } catch (e) { next(e); }
};
exports.reupload = async (req, res) => {
    res.json({ status: false, message: 'Tidak tersedia' });
};
