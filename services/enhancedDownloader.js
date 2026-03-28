const appleDownloader = require('./appleDownloader');
const catboxService = require('./catboxService');
const jsonDb = require('./jsonDatabase');

/**
 * ENHANCED DOWNLOADER SERVICE
 * @description Download + Upload ke Catbox + Simpan ke JSON DB
 */
class EnhancedDownloaderService {
    constructor() {
        this.processing = new Map(); // Hindari duplicate processing
    }

    async processDownload(appleMusicUrl, options = {}) {
        const { skipCatbox = false, forceReupload = false } = options;
        
        // 1. Cek database dulu
        if (!forceReupload) {
            const existingTrack = await jsonDb.findTrack(appleMusicUrl);
            if (existingTrack && existingTrack.catbox?.mp3Url) {
                console.log(`[Cache] Track found in database: ${existingTrack.title}`);
                
                // Verifikasi URL Catbox masih valid
                const isValid = await catboxService.checkUrl(existingTrack.catbox.mp3Url);
                if (isValid) {
                    await jsonDb.updateAccess(appleMusicUrl);
                    return {
                        status: true,
                        source: 'cache',
                        message: 'Track loaded from database',
                        result: {
                            title: existingTrack.title,
                            artist: existingTrack.artist,
                            image: existingTrack.image,
                            duration: existingTrack.duration,
                            download: {
                                mp3: existingTrack.catbox.mp3Url,
                                cover: existingTrack.catbox.coverUrl,
                                quality: '128kbps'
                            }
                        }
                    };
                }
                console.log(`[Cache] URL expired, re-uploading...`);
            }
        }

        // 2. Cek apakah sedang diproses
        if (this.processing.has(appleMusicUrl)) {
            return {
                status: 'processing',
                message: 'Track sedang diproses, silakan coba lagi dalam beberapa saat'
            };
        }

        try {
            this.processing.set(appleMusicUrl, true);

            // 3. Download dari AplMate
            console.log(`[Download] Getting link from AplMate...`);
            const aplmateResult = await appleDownloader.download(appleMusicUrl);

            if (!aplmateResult.status) {
                throw new Error(aplmateResult.message || 'Gagal mendapatkan link dari AplMate');
            }

            const trackInfo = aplmateResult.result;

            // 4. Jika skipCatbox true, return langsung dari AplMate
            if (skipCatbox) {
                return {
                    status: true,
                    source: 'aplmate',
                    message: 'Direct link from AplMate (temporary)',
                    result: trackInfo
                };
            }

            // 5. Upload ke Catbox
            console.log(`[Catbox] Starting upload process...`);
            
            let catboxMp3Url = null;
            let catboxCoverUrl = null;

            // Upload MP3
            if (trackInfo.download?.mp3) {
                const mp3Filename = `${this.sanitizeFilename(trackInfo.title)} - ${this.sanitizeFilename(trackInfo.artist)}.mp3`;
                catboxMp3Url = await catboxService.uploadFromUrl(trackInfo.download.mp3, mp3Filename);
            }

            // Upload Cover (opsional)
            if (trackInfo.download?.cover) {
                const coverExt = trackInfo.download.cover.split('.').pop() || 'jpg';
                const coverFilename = `${this.sanitizeFilename(trackInfo.title)} - cover.${coverExt}`;
                catboxCoverUrl = await catboxService.uploadFromUrl(trackInfo.download.cover, coverFilename);
            }

            // 6. Simpan ke database
            const savedTrack = await jsonDb.saveTrack({
                appleMusicUrl,
                title: trackInfo.title,
                artist: trackInfo.artist,
                image: trackInfo.image,
                duration: trackInfo.duration,
                catboxMp3: catboxMp3Url,
                catboxCover: catboxCoverUrl
            });

            return {
                status: true,
                source: 'catbox',
                message: 'Track uploaded to permanent storage',
                result: {
                    title: trackInfo.title,
                    artist: trackInfo.artist,
                    image: trackInfo.image,
                    duration: trackInfo.duration,
                    download: {
                        mp3: catboxMp3Url,
                        cover: catboxCoverUrl,
                        quality: '128kbps'
                    },
                    metadata: {
                        uploadedAt: savedTrack.catbox.uploadedAt,
                        downloadCount: savedTrack.metadata.downloadCount
                    }
                }
            };

        } catch (err) {
            console.error(`[Error] ${err.message}`);
            return {
                status: false,
                message: err.message,
                fallback: trackInfo || null
            };
        } finally {
            this.processing.delete(appleMusicUrl);
        }
    }

    sanitizeFilename(name) {
        return name.replace(/[^a-zA-Z0-9\u00C0-\u017F\s-]/g, '').trim().substring(0, 50);
    }

    /**
     * Batch process multiple tracks
     */
    async batchProcess(urls) {
        const results = [];
        for (const url of urls) {
            try {
                const result = await this.processDownload(url);
                results.push({ url, ...result });
                // Delay 2 detik antar request untuk menghindari rate limit
                await new Promise(r => setTimeout(r, 2000));
            } catch (err) {
                results.push({ url, status: false, error: err.message });
            }
        }
        return results;
    }
}

module.exports = new EnhancedDownloaderService();