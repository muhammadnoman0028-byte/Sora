const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

async function searchResults(keyword) {
    try {
        const response = await fetchv2(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(keyword)}`);
        const data = await response.json();
        const results = (data.results || [])
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .map(item => ({
                title: item.title || item.name,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
                href: `https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=${TMDB_API_KEY}`
            }));
        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const data = await response.json();
        return JSON.stringify([{
            description: data.overview || 'No description available.',
            aliases: data.original_title || data.original_name || '',
            airdate: data.release_date || data.first_air_date || ''
        }]);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url);
        const data = await response.json();
        
        if (url.includes('/movie/')) {
            return JSON.stringify([{
                href: `https://api.themoviedb.org/3/movie/${data.id}?api_key=${TMDB_API_KEY}`,
                number: 1
            }]);
        }

        const episodes = [];
        let epCounter = 1;
        for (const season of (data.seasons || [])) {
            if (season.season_number === 0) continue;
            for (let ep = 1; ep <= season.episode_count; ep++) {
                episodes.push({
                    href: `https://api.themoviedb.org/3/tv/${data.id}/season/${season.season_number}/episode/${ep}?api_key=${TMDB_API_KEY}`,
                    number: epCounter++
                });
            }
        }
        return JSON.stringify(episodes);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(episodeUrl) {
    try {
        let type = 'movie';
        let id = '';
        let season = '1';
        let episode = '1';

        const movieMatch = episodeUrl.match(/\/movie\/(\d+)/);
        const tvMatch = episodeUrl.match(/\/tv\/(\d+)\/season\/(\d+)\/episode\/(\d+)/);

        if (movieMatch) {
            type = 'movie';
            id = movieMatch[1];
        } else if (tvMatch) {
            type = 'tv';
            id = tvMatch[1];
            season = tvMatch[2];
            episode = tvMatch[3];
        }

        let streamList = [];
        let subList = [];

        // 1. Primary Direct HLS (.m3u8) API (VidLink)
        try {
            const vidlinkUrl = type === 'movie'
                ? `https://vidlink.pro/api/b/movie/${id}`
                : `https://vidlink.pro/api/b/tv/${id}/${season}/${episode}`;

            const res1 = await fetchv2(vidlinkUrl, {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                "Referer": "https://vidlink.pro/"
            });
            const data1 = await res1.json();

            if (data1 && data1.stream && data1.stream.playlist) {
                streamList.push(data1.stream.playlist);
                if (Array.isArray(data1.stream.captions)) {
                    for (const cap of data1.stream.captions) {
                        if (cap.url) subList.push(cap.url);
                    }
                }
            }
        } catch (e) {}

        // 2. Backup Direct HLS (.m3u8) API (AutoEmbed)
        if (streamList.length === 0) {
            try {
                const autoEmbedUrl = type === 'movie'
                    ? `https://player.autoembed.cc/api/server?id=${id}&sr=1`
                    : `https://player.autoembed.cc/api/server?id=${id}&s=${season}&e=${episode}&sr=1`;

                const res2 = await fetchv2(autoEmbedUrl, {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                    "Referer": "https://player.autoembed.cc/"
                });
                const data2 = await res2.json();

                if (data2 && data2.url && data2.url.includes('.m3u8')) {
                    streamList.push(data2.url);
                }
                if (data2 && Array.isArray(data2.tracks)) {
                    for (const t of data2.tracks) {
                        if (t.file) subList.push(t.file);
                    }
                }
            } catch (e) {}
        }

        // 3. Fallback Test HLS Stream (if ISP blocks third-party APIs)
        if (streamList.length === 0) {
            streamList.push("https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8");
        }

        return JSON.stringify({
            streams: streamList,
            subtitles: subList
        });
    } catch (e) {
        return JSON.stringify({
            streams: ["https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8"],
            subtitles: []
        });
    }
}
