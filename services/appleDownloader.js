const axios = require('axios');
const cheerio = require('cheerio');

/**
 * APPLE MUSIC DOWNLOADER SERVICE
 * @creator AgungDevX
 * @description Download lagu dari Apple Music via AplMate
 */
class AppleDownloaderService {
    constructor() {
        this.base = "https://aplmate.com";
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Origin": this.base,
            "Referer": this.base + "/"
        };
    }

    async download(url) {
        try {
            // Validasi URL Apple Music
            if (!this.isValidAppleMusicUrl(url)) {
                throw new Error("URL tidak valid. Harus menggunakan URL Apple Music.");
            }

            console.log(`[+] Processing: ${url}`);

            // Step 1: Get CSRF & Session
            const sessionData = await this.getSession();
            
            // Step 2: Submit URL ke /action
            const trackInfo = await this.submitUrl(url, sessionData);
            
            // Step 3: Get download links
            const downloadLinks = await this.getDownloadLinks(trackInfo, sessionData);

            return {
                status: true,
                result: {
                    title: trackInfo.title,
                    artist: trackInfo.artist,
                    image: trackInfo.image,
                    duration: trackInfo.duration || null,
                    download: downloadLinks
                }
            };

        } catch (err) {
            throw new Error(`Download failed: ${err.message}`);
        }
    }

    isValidAppleMusicUrl(url) {
        return url.includes('music.apple.com') && (url.includes('/album/') || url.includes('/song/'));
    }

    async getSession() {
        try {
            const response = await axios.get(this.base, { 
                headers: this.headers,
                timeout: 10000 
            });

            const $ = cheerio.load(response.data);
            const csrfInput = $("input[type='hidden']").filter((i, el) => $(el).attr("name")?.startsWith("_"));
            const session = response.headers["set-cookie"]?.[0]?.split(';')[0] || "";

            return {
                csrfName: csrfInput.attr("name"),
                csrfValue: csrfInput.attr("value"),
                session: session
            };
        } catch (err) {
            throw new Error("Gagal mendapatkan session");
        }
    }

    async submitUrl(url, sessionData) {
        const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
        
        let formData = `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="url"\r\n\r\n${url}\r\n`;
        formData += `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="${sessionData.csrfName}"\r\n\r\n${sessionData.csrfValue}\r\n`;
        formData += `--${boundary}--\r\n`;

        try {
            const response = await axios.post(`${this.base}/action`, formData, {
                headers: { 
                    ...this.headers, 
                    "Content-Type": `multipart/form-data; boundary=${boundary}`, 
                    "Cookie": sessionData.session 
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data.html || response.data);
            
            return {
                data: $("input[name='data']").attr("value"),
                base: $("input[name='base']").attr("value"),
                token: $("input[name='token']").attr("value"),
                title: $(".aplmate-downloader-middle h3 div").text().trim() || $(".title").text().trim(),
                artist: $(".aplmate-downloader-middle p span").text().trim() || $(".artist").text().trim(),
                image: $(".aplmate-downloader-left img").attr("src") || $("img.cover").attr("src"),
                duration: $(".duration").text().trim() || null
            };
        } catch (err) {
            throw new Error("Gagal submit URL ke server");
        }
    }

    async getDownloadLinks(trackInfo, sessionData) {
        if (!trackInfo.data) {
            throw new Error("Data track tidak ditemukan");
        }

        const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
        
        let formData = `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="data"\r\n\r\n${trackInfo.data}\r\n`;
        formData += `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="base"\r\n\r\n${trackInfo.base}\r\n`;
        formData += `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="token"\r\n\r\n${trackInfo.token}\r\n`;
        formData += `--${boundary}--\r\n`;

        try {
            const response = await axios.post(`${this.base}/action/track`, formData, {
                headers: { 
                    ...this.headers, 
                    "Content-Type": `multipart/form-data; boundary=${boundary}`, 
                    "Cookie": sessionData.session 
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data.data || response.data);
            
            const mp3Link = $("a:contains('Download Mp3'), a:contains('MP3'), a.download-mp3").attr("href");
            const coverLink = $("a:contains('Download Cover'), a:contains('Cover'), a.download-cover").attr("href");

            return {
                mp3: mp3Link ? (mp3Link.startsWith('http') ? mp3Link : this.base + mp3Link) : null,
                cover: coverLink ? (coverLink.startsWith('http') ? coverLink : this.base + coverLink) : null,
                quality: "128kbps" // Default quality dari AplMate
            };
        } catch (err) {
            throw new Error("Gagal mendapatkan link download");
        }
    }
}

module.exports = new AppleDownloaderService();