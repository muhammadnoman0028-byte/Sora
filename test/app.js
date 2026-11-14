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
    return JSON.stringify({
        streams: [{
            title: "Apple Test 1080p",
            streamUrl: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
            headers: {}
        }],
        subtitles: []
    });
}
