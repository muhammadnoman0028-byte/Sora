const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

async function searchResults(keyword) {
    try {
        const url = "https://api.themoviedb.org/3/search/multi?api_key=" + TMDB_API_KEY + "&query=" + encodeURIComponent(keyword);
        const response = await fetchv2(url);
        const data = await response.json();
        const results = [];
        if (data && data.results) {
            for (let i = 0; i < data.results.length; i++) {
                const item = data.results[i];
                if (item.media_type === "movie" || item.media_type === "tv") {
                    results.push({
                        title: item.title || item.name || "Unknown",
                        image: item.poster_path ? "https://image.tmdb.org/t/p/w500" + item.poster_path : "",
                        href: "https://api.themoviedb.org/3/" + item.media_type + "/" + item.id + "?api_key=" + TMDB_API_KEY
                    });
                }
            }
        }
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
            description: data.overview || "No description available.",
            aliases: data.original_title || data.original_name || "",
            airdate: data.release_date || data.first_air_date || ""
        }]);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url);
        const data = await response.json();
        if (url.indexOf("/movie/") !== -1) {
            return JSON.stringify([{
                href: "https://api.themoviedb.org/3/movie/" + data.id + "?api_key=" + TMDB_API_KEY,
                number: 1
            }]);
        }
        const episodes = [];
        let epCounter = 1;
        if (data && data.seasons) {
            for (let s = 0; s < data.seasons.length; s++) {
                const season = data.seasons[s];
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= season.episode_count; ep++) {
                    episodes.push({
                        href: "https://api.themoviedb.org/3/tv/" + data.id + "/season/" + season.season_number + "/episode/" + ep + "?api_key=" + TMDB_API_KEY,
                        number: epCounter++
                    });
                }
            }
        }
        return JSON.stringify(episodes);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(episodeUrl) {
    let type = "movie";
    let id = "";
    let season = "1";
    let episode = "1";

    const cleanUrl = episodeUrl.split("?")[0];
    const parts = cleanUrl.split("/");

    if (cleanUrl.indexOf("/movie/") !== -1) {
        type = "movie";
        id = parts[parts.length - 1];
    } else if (cleanUrl.indexOf("/tv/") !== -1) {
        type = "tv";
        id = parts[parts.length - 5];
        season = parts[parts.length - 3];
        episode = parts[parts.length - 1];
    }

    const streamList = [];
    const subList = [];

    const headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/plain, */*"
    };

    // 1. AutoEmbed Multi-Server HLS JSON API
    const servers = ["1", "2", "3"];
    for (let i = 0; i < servers.length; i++) {
        try {
            const apiUrl = type === "movie"
                ? "https://player.autoembed.cc/api/server?id=" + id + "&sr=" + servers[i]
                : "https://player.autoembed.cc/api/server?id=" + id + "&s=" + season + "&e=" + episode + "&sr=" + servers[i];

            const res = await fetchv2(apiUrl, headers);
            const data = await res.json();

            if (data && data.url && (data.url.indexOf(".m3u8") !== -1 || data.url.indexOf(".mp4") !== -1)) {
                streamList.push(data.url);
            }
            if (data && data.tracks && subList.length === 0) {
                for (let t = 0; t < data.tracks.length; t++) {
                    if (data.tracks[t].file) {
                        subList.push(data.tracks[t].file);
                    }
                }
            }
        } catch (e) {}
    }

    // 2. VidLink HLS JSON API
    if (streamList.length === 0) {
        try {
            const vidlinkUrl = type === "movie"
                ? "https://vidlink.pro/api/b/movie/" + id
                : "https://vidlink.pro/api/b/tv/" + id + "/" + season + "/" + episode;

            const res2 = await fetchv2(vidlinkUrl, {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                "Referer": "https://vidlink.pro/"
            });
            const data2 = await res2.json();

            if (data2 && data2.stream && data2.stream.playlist) {
                streamList.push(data2.stream.playlist);
                if (data2.stream.captions) {
                    for (let c = 0; c < data2.stream.captions.length; c++) {
                        if (data2.stream.captions[c].url) {
                            subList.push(data2.stream.captions[c].url);
                        }
                    }
                }
            }
        } catch (e) {}
    }

    // 3. NontonGo / Multi-HLS JSON API Backup
    if (streamList.length === 0) {
        try {
            const nontonUrl = type === "movie"
                ? "https://www.nontongo.win/api/source/" + id
                : "https://www.nontongo.win/api/source/" + id + "/" + season + "/" + episode;

            const res3 = await fetchv2(nontonUrl, headers);
            const data3 = await res3.json();

            if (data3 && data3.data && data3.data.length > 0) {
                for (let d = 0; d < data3.data.length; d++) {
                    if (data3.data[d].file) {
                        streamList.push(data3.data[d].file);
                    }
                }
            }
        } catch (e) {}
    }

    return JSON.stringify({
        streams: streamList,
        subtitles: subList
    });
}
