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
                href: `${item.media_type}/${item.id}`
            }));
        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(`https://api.themoviedb.org/3/${url}?api_key=${TMDB_API_KEY}`);
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
        const [type, id] = url.split('/');
        if (type === 'movie') {
            return JSON.stringify([{ href: `movie/${id}`, number: 1 }]);
        }
        const response = await fetchv2(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}`);
        const data = await response.json();
        const episodes = [];
        let epCounter = 1;
        for (const season of (data.seasons || [])) {
            if (season.season_number === 0) continue;
            for (let ep = 1; ep <= season.episode_count; ep++) {
                episodes.push({
                    href: `tv/${id}/${season.season_number}/${ep}`,
                    number: epCounter++
                });
            }
        }
        return JSON.stringify(episodes);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    const parts = url.split('/');
    const type = parts[0];
    const id = parts[1];
    const season = parts[2] || '1';
    const episode = parts[3] || '1';

    let streams = [];
    let subtitles = [];

    // 1. Primary Direct HLS (.m3u8) Scraper (AutoEmbed / VidSrc HLS API)
    try {
        const apiEndpoint = type === 'movie'
            ? `https://player.autoembed.cc/api/server?id=${id}&sr=1`
            : `https://player.autoembed.cc/api/server?id=${id}&s=${season}&e=${episode}&sr=1`;

        const res = await fetchv2(apiEndpoint, {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Referer": "https://player.autoembed.cc/"
        });
        const data = await res.json();

        if (data && data.url && data.url.includes('.m3u8')) {
            streams.push({
                title: "Server 1 (1080p HLS)",
                streamUrl: data.url,
                headers: {
                    "Referer": "https://player.autoembed.cc/",
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"
                }
            });
        }

        if (data && Array.isArray(data.tracks)) {
            for (const track of data.tracks) {
                if (track.file && (track.file.endsWith('.vtt') || track.file.endsWith('.srt'))) {
                    subtitles.push({
                        url: track.file,
                        lang: track.label || "English"
                    });
                }
            }
        }
    } catch (e) {}

    // 2. Backup Direct HLS Scraper (VidLink / Multi-API)
    if (streams.length === 0) {
        try {
            const backupEndpoint = type === 'movie'
                ? `https://vidlink.pro/api/b/movie/${id}`
                : `https://vidlink.pro/api/b/tv/${id}/${season}/${episode}`;

            const res2 = await fetchv2(backupEndpoint, {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                "Referer": "https://vidlink.pro/"
            });
            const data2 = await res2.json();

            if (data2 && data2.stream && data2.stream.playlist) {
                streams.push({
                    title: "Server 2 (HLS Auto)",
                    streamUrl: data2.stream.playlist,
                    headers: {
                        "Referer": "https://vidlink.pro/"
                    }
                });

                if (Array.isArray(data2.stream.captions)) {
                    for (const cap of data2.stream.captions) {
                        subtitles.push({
                            url: cap.url,
                            lang: cap.language || "English"
                        });
                    }
                }
            }
        } catch (e) {}
    }

    // Return Sulfur standard JSON object (with fallback string if needed)
    if (streams.length > 0) {
        return JSON.stringify({
            streams: streams,
            subtitles: subtitles
        });
    }

    const fallbackEmbed = type === 'movie'
        ? `https://vidsrc.cc/v2/embed/movie/${id}`
        : `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}`;

    return JSON.stringify({
        streams: [{ title: "Web Fallback", streamUrl: fallbackEmbed, headers: {} }],
        subtitles: []
    });
}
