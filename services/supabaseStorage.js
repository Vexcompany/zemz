// services/supabaseStorage.js — v2 dengan error logging lebih detail

const axios  = require('axios');

const SB_URL = process.env.SUPABASE_URL || 'https://ygwoddwdhelqcwhpqasl.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnd29kZHdkaGVscWN3aHBxYXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTEwNzcsImV4cCI6MjA4NzQyNzA3N30.y0tnci0aWnhWYpxb9v7M7I0X9ss-jAt0JvpOBnZgFzo';
const BUCKET = 'audio';

class SupabaseStorageService {

    async uploadFromUrl(mp3Url, filename) {
        console.log('[storage] Downloading MP3:', mp3Url.substring(0, 80));

        // Download file
        let buffer;
        try {
            const fileRes = await axios.get(mp3Url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                maxContentLength: 50 * 1024 * 1024,
                maxBodyLength:    50 * 1024 * 1024
            });
            buffer = Buffer.from(fileRes.data);
            console.log(`[storage] Downloaded: ${(buffer.length/1024/1024).toFixed(2)}MB`);
        } catch (e) {
            throw new Error(`Download MP3 gagal: ${e.message}`);
        }

        const safeFile = filename
            .replace(/[^a-zA-Z0-9\-_]/g, '_')
            .replace(/__+/g, '_')
            .substring(0, 80) + '.mp3';

        // Upload ke Supabase Storage
        const uploadUrl = `${SB_URL}/storage/v1/object/${BUCKET}/${safeFile}`;
        console.log('[storage] Uploading to:', uploadUrl);

        try {
            const res = await axios({
                method:  'POST',
                url:     uploadUrl,
                data:    buffer,
                headers: {
                    'Authorization': `Bearer ${SB_KEY}`,
                    'apikey':        SB_KEY,
                    'Content-Type':  'audio/mpeg',
                    'x-upsert':      'true'
                },
                timeout: 120000,
                maxContentLength: 60 * 1024 * 1024,
                maxBodyLength:    60 * 1024 * 1024
            });
            console.log('[storage] Upload response:', res.status, JSON.stringify(res.data).substring(0, 100));
        } catch (e) {
            const errDetail = e.response
                ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}`
                : e.message;
            throw new Error(`Upload Supabase gagal: ${errDetail}`);
        }

        const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${safeFile}`;
        console.log('[storage] Public URL:', publicUrl);
        return publicUrl;
    }

    async fileExists(filename) {
        try {
            const safeFile = filename
                .replace(/[^a-zA-Z0-9\-_]/g, '_')
                .substring(0, 80) + '.mp3';
            const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${safeFile}`;
            const res = await axios.head(url, { timeout: 5000 });
            return res.status === 200 ? url : null;
        } catch { return null; }
    }

    sanitizeFilename(title, artist) {
        return `${title}_${artist}`
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .trim()
            .substring(0, 80);
    }
}

module.exports = new SupabaseStorageService();
