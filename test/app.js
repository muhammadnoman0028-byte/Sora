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
        "Accept": "*/*"
    };

    // 1. VixSrc Direct M3U8 Extractor (No Cloudflare)
    try {
        const vixUrl = type === "movie"
            ? "https://vixsrc.to/movie/" + id
            : "https://vixsrc.to/tv/" + id + "/" + season + "/" + episode;

        const res1 = await fetchv2(vixUrl, headers);
        const html1 = await res1.text();

        const tokenMarker = "token': '";
        const expiresMarker = "expires': '";
        const urlMarker = "url: '";

        const uIdx = html1.indexOf(urlMarker);
        const tIdx = html1.indexOf(tokenMarker);
        const eIdx = html1.indexOf(expiresMarker);

        if (uIdx !== -1 && tIdx !== -1 && eIdx !== -1) {
            const baseUrl = html1.substring(uIdx + urlMarker.length, html1.indexOf("'", uIdx + urlMarker.length));
            const token = html1.substring(tIdx + tokenMarker.length, html1.indexOf("'", tIdx + tokenMarker.length));
            const expires = html1.substring(eIdx + expiresMarker.length, html1.indexOf("'", eIdx + expiresMarker.length));
            const sep = baseUrl.indexOf("?") !== -1 ? "&" : "?";
            const finalM3u8 = baseUrl + sep + "token=" + token + "&expires=" + expires + "&h=1";
            streamList.push({
                title: "VixSrc 1080p",
                streamUrl: finalM3u8,
                headers: {
                    "Referer": "https://vixsrc.to/",
                    "User-Agent": headers["User-Agent"]
                }
            });
        }
    } catch (e) {}

    // 2. Rivestream / Multi-Source JSON API Backup
    if (streamList.length === 0) {
        try {
            const riveUrl = type === "movie"
                ? "https://rivestream.org/api/backendfetch?requestID=movieVideoProvider&id=" + id + "&service=flowcast"
                : "https://rivestream.org/api/backendfetch?requestID=tvVideoProvider&id=" + id + "&season=" + season + "&episode=" + episode + "&service=flowcast";

            const res2 = await fetchv2(riveUrl, headers);
            const data2 = await res2.json();

            if (data2 && data2.data && data2.data.sources) {
                for (let i = 0; i < data2.data.sources.length; i++) {
                    const src = data2.data.sources[i];
                    if (src.url) {
                        streamList.push({
                            title: src.quality || "Server " + (i + 1),
                            streamUrl: src.url,
                            headers: {
                                "Referer": "https://rivestream.org/",
                                "User-Agent": headers["User-Agent"]
                            }
                        });
                    }
                }
            }
            if (data2 && data2.data && data2.data.captions) {
                for (let c = 0; c < data2.data.captions.length; c++) {
                    if (data2.data.captions[c].file) {
                        subList.push(data2.data.captions[c].file);
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
