// services/jsonDatabase.js — FIXED untuk Vercel
// Masalah: Vercel filesystem READ-ONLY kecuali /tmp
// Fix: pakai /tmp/zemz-data/ sebagai storage

const fs   = require('fs').promises;
const path = require('path');

class JsonDatabase {
    constructor() {
        // /tmp adalah satu-satunya folder writable di Vercel serverless
        const dataDir    = process.env.VERCEL ? '/tmp/zemz-data' : path.join(__dirname, '../data');
        this.dbPath      = path.join(dataDir, 'tracks.json');
        this.cachePath   = path.join(dataDir, 'cache.json');
        this._ready      = this.ensureDirectory();
    }

    async ensureDirectory() {
        try {
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
        } catch (e) {
            // Ignore kalau sudah ada
        }
    }

    async read() {
        try {
            await this._ready;
            const data = await fs.readFile(this.dbPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { tracks: [], lastUpdated: new Date().toISOString() };
        }
    }

    async save(data) {
        try {
            await this._ready;
            await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.warn('[jsonDb] Cannot write file:', e.message);
            // Di Vercel /tmp mungkin juga terbatas — tidak throw, cukup warn
        }
    }

    async findTrack(appleMusicUrl) {
        try {
            const db = await this.read();
            const trackId = this.extractTrackId(appleMusicUrl);
            return db.tracks.find(t =>
                t.appleMusicId === trackId ||
                t.appleMusicUrl === appleMusicUrl
            ) || null;
        } catch { return null; }
    }

    async findByMetadata(title, artist) {
        try {
            const db = await this.read();
            const nt = this.normalizeString(title);
            const na = this.normalizeString(artist);
            return db.tracks.find(t =>
                this.normalizeString(t.title)  === nt &&
                this.normalizeString(t.artist) === na
            ) || null;
        } catch { return null; }
    }

    async saveTrack(trackData) {
        try {
            const db      = await this.read();
            const trackId = this.extractTrackId(trackData.appleMusicUrl);
            const idx     = db.tracks.findIndex(t => t.appleMusicId === trackId);

            const record = {
                id:            trackId || `track_${Date.now()}`,
                appleMusicId:  trackId,
                appleMusicUrl: trackData.appleMusicUrl,
                title:         trackData.title,
                artist:        trackData.artist,
                image:         trackData.image,
                duration:      trackData.duration,
                catbox: {
                    mp3Url:    trackData.catboxMp3,
                    coverUrl:  trackData.catboxCover,
                    uploadedAt: new Date().toISOString()
                },
                metadata: {
                    addedAt:       new Date().toISOString(),
                    lastAccessed:  new Date().toISOString(),
                    downloadCount: 1
                }
            };

            if (idx >= 0) {
                record.metadata.addedAt       = db.tracks[idx].metadata.addedAt;
                record.metadata.downloadCount = (db.tracks[idx].metadata.downloadCount || 0) + 1;
                db.tracks[idx] = record;
            } else {
                db.tracks.push(record);
            }

            db.lastUpdated = new Date().toISOString();
            await this.save(db);
            return record;
        } catch (e) {
            console.warn('[jsonDb] saveTrack failed:', e.message);
            return trackData;
        }
    }

    async updateAccess(appleMusicUrl) {
        try {
            const db      = await this.read();
            const trackId = this.extractTrackId(appleMusicUrl);
            const track   = db.tracks.find(t => t.appleMusicId === trackId);
            if (track) {
                track.metadata.lastAccessed = new Date().toISOString();
                await this.save(db);
            }
        } catch { /* silent */ }
    }

    async getAllTracks(page = 1, limit = 50) {
        try {
            const db    = await this.read();
            const start = (page - 1) * limit;
            return {
                tracks:     db.tracks.slice(start, start + limit),
                total:      db.tracks.length,
                page,
                totalPages: Math.ceil(db.tracks.length / limit)
            };
        } catch { return { tracks: [], total: 0, page: 1, totalPages: 0 }; }
    }

    async searchTracks(query) {
        try {
            const db = await this.read();
            const nq = this.normalizeString(query);
            return db.tracks.filter(t =>
                this.normalizeString(t.title).includes(nq) ||
                this.normalizeString(t.artist).includes(nq)
            );
        } catch { return []; }
    }

    extractTrackId(url) {
        if (!url) return null;
        const m = url.match(/[?&]i=(\d+)/);
        return m ? m[1] : null;
    }

    normalizeString(str) {
        return (str || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
    }

    async backup() {
        const ts         = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(path.dirname(this.dbPath), `backup/tracks_${ts}.json`);
        const db         = await this.read();
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.writeFile(backupPath, JSON.stringify(db, null, 2));
        return backupPath;
    }
}

module.exports = new JsonDatabase();
