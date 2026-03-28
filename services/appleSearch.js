const axios = require('axios');
const cheerio = require('cheerio');

/**
 * APPLE MUSIC SEARCH SERVICE
 * @creator AgungDevX
 * @description Scrape lagu dari Apple Music tanpa API Key
 */
class AppleSearchService {
    async search(query, region = 'id') {
        const url = `https://music.apple.com/${region}/search?term=${encodeURIComponent(query)}`;
        
        try {
            const { data } = await axios.get(url, {
                timeout: 15000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive"
                }
            });

            const $ = cheerio.load(data);
            const results = [];

            // Selector untuk hasil pencarian
            $(".top-search-lockup, .shelf-grid__item, .track-lockup").each((i, el) => {
                const title = $(el).find(".top-search-lockup__primary__title, .product-lockup__title, .track-lockup__title").text().trim();
                const artist = $(el).find(".top-search-lockup__secondary, .product-lockup__subtitle, .track-lockup__subtitle").text().trim();
                const link = $(el).find("a.click-action, a.product-lockup__link, a.track-lockup__link").attr("href");
                
                // Handle gambar dengan berbagai format
                let image = $(el).find("picture source[type='image/webp']").attr("srcset")?.split(" ")[0];
                if (!image) {
                    image = $(el).find("img").attr("src");
                }
                if (!image) {
                    image = $(el).find("source").attr("srcset")?.split(" ")[0];
                }

                // Ekstrak ID lagu dari URL
                const trackId = this.extractTrackId(link);

                if (title && artist && link) {
                    results.push({
                        id: trackId || `track_${i}`,
                        title,
                        artist: artist.replace(/^Song\s*[·•]\s*/, '').replace(/^Artist\s*[·•]\s*/, ''),
                        link: link.startsWith("http") ? link : `https://music.apple.com${link}`,
                        image: image || null,
                        type: this.detectType(link)
                    });
                }
            });

            return {
                status: true,
                query,
                region,
                total: results.length,
                data: results.slice(0, 20) // Limit 20 hasil
            };

        } catch (err) {
            throw new Error(`Search failed: ${err.message}`);
        }
    }

    extractTrackId(url) {
        if (!url) return null;
        const match = url.match(/[?&]i=(\d+)/);
        return match ? match[1] : null;
    }

    detectType(url) {
        if (url.includes('/album/')) return 'album';
        if (url.includes('/song/') || url.includes('?i=')) return 'song';
        if (url.includes('/artist/')) return 'artist';
        if (url.includes('/playlist/')) return 'playlist';
        return 'unknown';
    }
}

module.exports = new AppleSearchService();