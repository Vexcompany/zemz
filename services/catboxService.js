const axios = require('axios');
const FormData = require('form-data');

/**
 * CATBOX.MOE UPLOAD SERVICE
 * @description Upload file ke Catbox untuk link permanent
 */
class CatboxService {
    constructor() {
        this.baseUrl = 'https://litterbox.catbox.moe/resources/internals/api.php';
        this.userHash = null; // Optional: daftar di catbox.moe untuk user hash
    }

    /**
     * Upload file dari URL ke Catbox
     * @param {string} fileUrl - URL file dari AplMate
     * @param {string} filename - Nama file
     * @returns {Promise<string>} URL Catbox permanent
     */
    async uploadFromUrl(fileUrl, filename) {
        try {
            console.log(`[Catbox] Downloading file from: ${fileUrl}`);
            
            // Download file dari AplMate
            const fileBuffer = await this.downloadFile(fileUrl);
            
            console.log(`[Catbox] Uploading: ${filename} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
            
            // Upload ke Catbox
            const catboxUrl = await this.uploadToCatbox(fileBuffer, filename);
            
            console.log(`[Catbox] Success: ${catboxUrl}`);
            return catboxUrl;

        } catch (err) {
            console.error(`[Catbox] Error: ${err.message}`);
            throw new Error(`Gagal upload ke Catbox: ${err.message}`);
        }
    }

    async downloadFile(url) {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 60000, // 1 menit timeout untuk file besar
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxContentLength: 50 * 1024 * 1024, // Max 50MB
            maxBodyLength: 50 * 1024 * 1024
        });

        return Buffer.from(response.data);
    }

    async uploadToCatbox(buffer, filename) {
        const form = new FormData();
        
        // Catbox menggunakan 'fileToUpload' sebagai field name
        form.append('fileToUpload', buffer, {
            filename: filename,
            contentType: 'audio/mpeg'
        });
        
        form.append('reqtype', 'fileupload');
        
        if (this.userHash) {
            form.append('userhash', this.userHash);
        }

        const response = await axios.post(this.baseUrl, form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000, // 2 menit timeout upload
            maxContentLength: 100 * 1024 * 1024,
            maxBodyLength: 100 * 1024 * 1024
        });

        // Response dari Catbox adalah URL langsung
        if (response.data && response.data.includes('https://')) {
            return response.data.trim();
        }

        throw new Error('Response Catbox tidak valid');
    }

    /**
     * Cek apakah URL masih valid
     */
    async checkUrl(url) {
        try {
            const response = await axios.head(url, { timeout: 5000 });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}

module.exports = new CatboxService();