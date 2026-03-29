// services/supabaseStorage.js
// Upload MP3 langsung ke Supabase Storage dari URL nexray
// Bucket: "audio" — buat dulu di Supabase Dashboard → Storage → New bucket "audio" (public)

const axios = require('axios');
const FormData = require('form-data');

const SB_URL = process.env.SUPABASE_URL || 'https://ygwoddwdhelqcwhpqasl.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnd29kZHdkaGVscWN3aHBxYXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTEwNzcsImV4cCI6MjA4NzQyNzA3N30.y0tnci0aWnhWYpxb9v7M7I0X9ss-jAt0JvpOBnZgFzo';
const BUCKET  = 'audio';

class SupabaseStorageService {

    /**
     * Download MP3 dari URL nexray → Upload ke Supabase Storage
     * @returns public URL file di Supabase Storage
     */
    async uploadFromUrl(mp3Url, filename) {
        console.log('[supabase-storage] Downloading:', mp3Url.substring(0, 80));

        // 1. Download file MP3 dari nexray
        const fileRes = await axios.get(mp3Url, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer':    'https://music.pagaska.my.id'
            },
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength:    50 * 1024 * 1024
        });

        const buffer   = Buffer.from(fileRes.data);
        const sizeMB   = (buffer.length / 1024 / 1024).toFixed(2);
        console.log(`[supabase-storage] Downloaded ${sizeMB}MB, uploading to Supabase...`);

        // 2. Sanitasi nama file
        const safeFilename = filename
            .replace(/[^a-zA-Z0-9\-_.]/g, '_')
            .replace(/__+/g, '_')
            .substring(0, 100) + '.mp3';

        // 3. Upload ke Supabase Storage
        const uploadUrl = `${SB_URL}/storage/v1/object/${BUCKET}/${safeFilename}`;

        const uploadRes = await axios.post(uploadUrl, buffer, {
            headers: {
                'Authorization':  `Bearer ${SB_KEY}`,
                'apikey':          SB_KEY,
                'Content-Type':   'audio/mpeg',
                'Content-Length':  buffer.length,
                'x-upsert':       'true'   // overwrite kalau sudah ada
            },
            timeout: 120000,
            maxContentLength: 100 * 1024 * 1024,
            maxBodyLength:    100 * 1024 * 1024
        });

        // 4. Build public URL
        const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${safeFilename}`;
        console.log('[supabase-storage] Uploaded:', publicUrl);
        return publicUrl;
    }

    /**
     * Cek apakah file sudah ada di storage
     */
    async fileExists(filename) {
        try {
            const safeFilename = filename
                .replace(/[^a-zA-Z0-9\-_.]/g, '_')
                .substring(0, 100) + '.mp3';
            const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${safeFilename}`;
            const res = await axios.head(url, { timeout: 5000 });
            return res.status === 200 ? url : null;
        } catch {
            return null;
        }
    }

    sanitizeFilename(title, artist) {
        return `${title}_${artist}`
            .replace(/[^a-zA-Z0-9\s\-]/g, '')
            .replace(/\s+/g, '_')
            .trim()
            .substring(0, 80);
    }
}

module.exports = new SupabaseStorageService();
