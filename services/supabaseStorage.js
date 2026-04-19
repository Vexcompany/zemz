// services/supabaseStorage.js — FIXED v3
// PERBAIKAN UTAMA:
//   1. Ganti method POST → PUT untuk upsert yang benar
//   2. Validasi buffer size sebelum upload
//   3. Error logging lebih detail
//   4. Hapus hardcode key (ambil dari env saja)

const axios = require('axios');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const BUCKET  = 'audio';

if (!SB_URL || !SB_KEY) {
  throw new Error('[supabaseStorage] SUPABASE_URL dan SUPABASE_KEY harus diset di environment variables!');
}

class SupabaseStorageService {

  async uploadFromUrl(mp3Url, filename) {
    console.log('[storage] Downloading MP3:', mp3Url.substring(0, 80));

    // ── 1. Download file ke buffer ──────────────────────────────
    let buffer;
    try {
      const fileRes = await axios.get(mp3Url, {
        responseType:     'arraybuffer',
        timeout:          60_000,
        headers:          { 'User-Agent': 'Mozilla/5.0' },
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength:    50 * 1024 * 1024,
      });
      buffer = Buffer.from(fileRes.data);
      console.log(`[storage] Downloaded: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

      // Validasi ukuran — kalau < 1KB kemungkinan URL expired atau error page
      if (buffer.length < 1024) {
        throw new Error(`File terlalu kecil (${buffer.length} bytes) — URL mungkin sudah expired`);
      }
    } catch (e) {
      throw new Error(`Download MP3 gagal: ${e.message}`);
    }

    // ── 2. Sanitize filename ────────────────────────────────────
    const safeFile = filename
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
      .replace(/__+/g, '_')
      .substring(0, 80) + '.mp3';

    // ── 3. Upload ke Supabase Storage ──────────────────────────
    // Supabase Storage REST API:
    //   POST = insert baru saja
    //   PUT  = upsert (insert + overwrite kalau ada) ← GUNAKAN INI
    const uploadUrl = `${SB_URL}/storage/v1/object/${BUCKET}/${safeFile}`;
    console.log('[storage] Uploading to:', uploadUrl);

    try {
      const res = await axios({
        method:  'PUT',             // ← KUNCI: PUT bukan POST
        url:      uploadUrl,
        data:     buffer,
        headers: {
          'Authorization':  `Bearer ${SB_KEY}`,
          'apikey':          SB_KEY,
          'Content-Type':   'audio/mpeg',
          'x-upsert':       'true',
          'Content-Length':  buffer.length.toString(),
        },
        timeout:          120_000,
        maxContentLength: 60 * 1024 * 1024,
        maxBodyLength:    60 * 1024 * 1024,
      });

      console.log('[storage] ✅ Upload success:', res.status, JSON.stringify(res.data).substring(0, 120));
    } catch (e) {
      if (e.response) {
        const detail = JSON.stringify(e.response.data);
        console.error('[storage] ❌ Supabase error:', e.response.status, detail);
        throw new Error(`Upload Supabase gagal: HTTP ${e.response.status} — ${detail}`);
      } else {
        console.error('[storage] ❌ Network error:', e.message);
        throw new Error(`Upload network error: ${e.message}`);
      }
    }

    const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${safeFile}`;
    console.log('[storage] 🌍 Public URL:', publicUrl);
    return publicUrl;
  }

  async fileExists(filename) {
    try {
      const safeFile = filename
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .substring(0, 80) + '.mp3';

      // Cek via HEAD request ke public URL
      const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${safeFile}`;
      const res  = await axios.head(url, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
        timeout: 5000,
      });

      return res.status === 200 ? url : null;
    } catch {
      return null;
    }
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
