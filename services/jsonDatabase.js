const fs = require('fs').promises;
const path = require('path');

/**
 * JSON DATABASE SERVICE
 * @description Simpan metadata track & URL Catbox ke file JSON
 */
class JsonDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/tracks.json');
        this.cachePath = path.join(__dirname, '../data/cache.json');
        this.ensureDirectory();
    }

    async ensureDirectory() {
        const dir = path.dirname(this.dbPath);
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    /**
     * Inisialisasi database kosong
     */
    async init() {
        try {
            await fs.access(this.dbPath);
        } catch {
            await this.save({ tracks: [], lastUpdated: new Date().toISOString() });
        }
    }

    /**
     * Baca seluruh database
     */
    async read() {
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { tracks: [], lastUpdated: new Date().toISOString() };
        }
    }

    /**
     * Simpan ke database
     */
    async save(data) {
        await this.ensureDirectory();
        await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2));
    }

    /**
     * Cari track berdasarkan Apple Music URL atau ID
     */
    async findTrack(appleMusicUrl) {
        const db = await this.read();
        const trackId = this.extractTrackId(appleMusicUrl);
        
        return db.tracks.find(track => 
            track.appleMusicId === trackId || 
            track.appleMusicUrl === appleMusicUrl
        );
    }

    /**
     * Cari track berdasarkan judul dan artis
     */
    async findByMetadata(title, artist) {
        const db = await this.read();
        const normalizedTitle = this.normalizeString(title);
        const normalizedArtist = this.normalizeString(artist);

        return db.tracks.find(track => 
            this.normalizeString(track.title) === normalizedTitle &&
            this.normalizeString(track.artist) === normalizedArtist
        );
    }

    /**
     * Tambah atau update track
     */
    async saveTrack(trackData) {
        const db = await this.read();
        const trackId = this.extractTrackId(trackData.appleMusicUrl);
        
        // Cek apakah track sudah ada
        const existingIndex = db.tracks.findIndex(t => 
            t.appleMusicId === trackId
        );

        const trackRecord = {
            id: trackId || `track_${Date.now()}`,
            appleMusicId: trackId,
            appleMusicUrl: trackData.appleMusicUrl,
            title: trackData.title,
            artist: trackData.artist,
            image: trackData.image,
            duration: trackData.duration,
            catbox: {
                mp3Url: trackData.catboxMp3,
                coverUrl: trackData.catboxCover,
                uploadedAt: new Date().toISOString()
            },
            metadata: {
                addedAt: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                downloadCount: 1
            }
        };

        if (existingIndex >= 0) {
            // Update existing
            const existing = db.tracks[existingIndex];
            trackRecord.metadata.addedAt = existing.metadata.addedAt;
            trackRecord.metadata.downloadCount = (existing.metadata.downloadCount || 0) + 1;
            
            db.tracks[existingIndex] = trackRecord;
        } else {
            // Tambah baru
            db.tracks.push(trackRecord);
        }

        db.lastUpdated = new Date().toISOString();
        await this.save(db);

        return trackRecord;
    }

    /**
     * Update last accessed
     */
    async updateAccess(appleMusicUrl) {
        const db = await this.read();
        const trackId = this.extractTrackId(appleMusicUrl);
        
        const track = db.tracks.find(t => t.appleMusicId === trackId);
        if (track) {
            track.metadata.lastAccessed = new Date().toISOString();
            await this.save(db);
        }
    }

    /**
     * Dapatkan semua tracks (dengan pagination)
     */
    async getAllTracks(page = 1, limit = 50) {
        const db = await this.read();
        const start = (page - 1) * limit;
        const end = start + limit;
        
        return {
            tracks: db.tracks.slice(start, end),
            total: db.tracks.length,
            page,
            totalPages: Math.ceil(db.tracks.length / limit)
        };
    }

    /**
     * Cari tracks dengan keyword
     */
    async searchTracks(query) {
        const db = await this.read();
        const normalizedQuery = this.normalizeString(query);
        
        return db.tracks.filter(track => 
            this.normalizeString(track.title).includes(normalizedQuery) ||
            this.normalizeString(track.artist).includes(normalizedQuery)
        );
    }

    extractTrackId(url) {
        if (!url) return null;
        const match = url.match(/[?&]i=(\d+)/);
        return match ? match[1] : null;
    }

    normalizeString(str) {
        return str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    }

    /**
     * Backup database
     */
    async backup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, `../data/backup/tracks_${timestamp}.json`);
        
        const db = await this.read();
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.writeFile(backupPath, JSON.stringify(db, null, 2));
        
        return backupPath;
    }
}

module.exports = new JsonDatabase();