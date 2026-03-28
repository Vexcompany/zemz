// services/appleSearch.js
// @creator AgungDevX
// @fix CORS + fallback iTunes API (scraping Apple Music sering diblock)

const axios = require('axios');
const cheerio = require('cheerio');

class AppleSearchService {

    async search(query, region = 'id') {
        // Coba scraping dulu, kalau gagal fallback ke iTunes API resmi
        try {
            const scrapeResult = await this.searchByScraping(query, region);
            if (scrapeResult && scrapeResult.length > 0) {
                return { status: true, query, region, total: scrapeResult.length, data: scrapeResult };
            }
        } catch (err) {
            console.warn('[appleSearch] Scraping gagal, fallback ke iTunes API:', err.message);
        }

        // Fallback: iTunes Search API (gratis, tidak perlu key, tidak kena CORS)
        return await this.searchByITunes(query, region);
    }

    // ── Method 1: Scraping Apple Music ────────────────────────────
    async searchByScraping(query, region = 'id') {
        const url = `https://music.apple.com/${region}/search?term=${encodeURIComponent(query)}`;

        const { data } = await axios.get(url, {
            timeout: 15000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive"
            }
        });

        const $ = cheerio.load(data);
        const results = [];

        $(".top-search-lockup, .shelf-grid__item, .track-lockup").each((i, el) => {
            const title  = $(el).find(".top-search-lockup__primary__title, .product-lockup__title, .track-lockup__title").text().trim();
            const artist = $(el).find(".top-search-lockup__secondary, .product-lockup__subtitle, .track-lockup__subtitle").text().trim();
            const link   = $(el).find("a.click-action, a.product-lockup__link, a.track-lockup__link").attr("href");

            let image = $(el).find("picture source[type='image/webp']").attr("srcset")?.split(" ")[0];
            if (!image) image = $(el).find("img").attr("src");
            if (!image) image = $(el).find("source").attr("srcset")?.split(" ")[0];

            const trackId = this.extractTrackId(link);

            if (title && artist && link) {
                results.push({
                    id:     trackId || `track_${i}`,
                    title,
                    artist: artist.replace(/^Song\s*[·•]\s*/, '').replace(/^Artist\s*[·•]\s*/, ''),
                    link:   link.startsWith("http") ? link : `https://music.apple.com${link}`,
                    image:  image || null,
                    type:   this.detectType(link),
                    source: 'scrape'
                });
            }
        });

        return results.slice(0, 20);
    }

    // ── Method 2: iTunes Search API (fallback resmi, gratis) ──────
    async searchByITunes(query, region = 'id') {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=${region}&media=music&entity=song&limit=20`;

        try {
            const { data } = await axios.get(url, {
                timeout: 15000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; ZemzBot/1.0)"
                }
            });

            if (!data?.results?.length) {
                throw new Error('Tidak ada hasil dari iTunes API');
            }

            const results = data.results.map((r, i) => ({
                id:     String(r.trackId || `itunes_${i}`),
                title:  r.trackName || 'Unknown',
                artist: r.artistName || 'Unknown',
                // Buat link Apple Music dari trackId
                link:   r.trackViewUrl || `https://music.apple.com/${region}/album/${r.collectionId}?i=${r.trackId}`,
                // Naikkan resolusi artwork dari 100x100 ke 500x500
                image:  (r.artworkUrl100 || '').replace('100x100', '500x500'),
                duration: this.msToDuration(r.trackTimeMillis),
                album:  r.collectionName || '',
                year:   r.releaseDate ? new Date(r.releaseDate).getFullYear() : null,
                type:   'song',
                source: 'itunes'
            }));

            return {
                status: true,
                query,
                region,
                total:  results.length,
                data:   results
            };

        } catch (err) {
            throw new Error(`iTunes API gagal: ${err.message}`);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────
    msToDuration(ms) {
        if (!ms) return '0:00';
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = String(totalSec % 60).padStart(2, '0');
        return `${min}:${sec}`;
    }

    extractTrackId(url) {
        if (!url) return null;
        const match = url.match(/[?&]i=(\d+)/);
        return match ? match[1] : null;
    }

    detectType(url) {
        if (!url) return 'unknown';
        if (url.includes('/album/'))    return 'album';
        if (url.includes('/song/')  || url.includes('?i=')) return 'song';
        if (url.includes('/artist/'))   return 'artist';
        if (url.includes('/playlist/')) return 'playlist';
        return 'unknown';
    }
}

module.exports = new AppleSearchService();
