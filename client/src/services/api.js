// TMDB and Scraper API Service
export const API_KEY = import.meta.env.VITE_TMDB_API_KEY || "ab060bf4b27b23c908e05859d2ef7451";

export const TMDB_BASE = "https://api.themoviedb.org/3";
export const IMAGE_BASE_W500 = "https://image.tmdb.org/t/p/w500";
export const IMAGE_BASE_W300 = "https://image.tmdb.org/t/p/w300";
export const IMAGE_BASE_ORIGINAL = "https://image.tmdb.org/t/p/original";

export const GENRES = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

export async function fetchTrending() {
  const res = await fetch(`${TMDB_BASE}/trending/movie/week?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch trending movies");
  const data = await res.json();
  return data.results || [];
}

export async function fetchTrendingTv() {
  const res = await fetch(`${TMDB_BASE}/trending/tv/week?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch trending TV shows");
  const data = await res.json();
  return (data.results || []).map((item) => ({ ...item, media_type: "tv" }));
}

export async function fetchTvDetails(tvId) {
  const res = await fetch(
    `${TMDB_BASE}/tv/${tvId}?api_key=${API_KEY}&append_to_response=videos,credits,external_ids`
  );
  if (!res.ok) throw new Error("Failed to fetch TV show details");
  return await res.json();
}

export async function fetchTvSeason(tvId, seasonNumber) {
  const res = await fetch(
    `${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`
  );
  if (!res.ok) return { episodes: [] };
  return await res.json();
}

export async function fetchTopRated() {
  const res = await fetch(`${TMDB_BASE}/movie/top_rated?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch top rated movies");
  const data = await res.json();
  return data.results || [];
}

export async function fetchPopular() {
  const res = await fetch(`${TMDB_BASE}/movie/popular?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch popular movies");
  const data = await res.json();
  return data.results || [];
}

export async function fetchLatest() {
  const res = await fetch(`${TMDB_BASE}/movie/now_playing?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch latest movies");
  const data = await res.json();
  return data.results || [];
}

export async function fetchUpcoming() {
  const res = await fetch(`${TMDB_BASE}/movie/upcoming?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch upcoming movies");
  const data = await res.json();
  return data.results || [];
}

export async function fetchMoviesByGenre(genreId, sortBy = "popularity.desc") {
  const res = await fetch(
    `${TMDB_BASE}/discover/movie?api_key=${API_KEY}&with_genres=${genreId}&sort_by=${sortBy}`
  );
  if (!res.ok) throw new Error(`Failed to fetch movies for genre ${genreId}`);
  const data = await res.json();
  return data.results || [];
}

export async function fetchTopRatedTv() {
  const res = await fetch(`${TMDB_BASE}/tv/top_rated?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch top rated TV shows");
  const data = await res.json();
  return (data.results || []).map((item) => ({ ...item, media_type: "tv" }));
}

export async function fetchTvByGenre(genreId, sortBy = "popularity.desc") {
  const res = await fetch(
    `${TMDB_BASE}/discover/tv?api_key=${API_KEY}&with_genres=${genreId}&sort_by=${sortBy}`
  );
  if (!res.ok) throw new Error(`Failed to fetch TV series for genre ${genreId}`);
  const data = await res.json();
  return (data.results || []).map((item) => ({ ...item, media_type: "tv" }));
}

export async function fetchMovieDetails(movieId) {
  const res = await fetch(`${TMDB_BASE}/movie/${movieId}?api_key=${API_KEY}&append_to_response=videos,credits,external_ids`);
  if (!res.ok) throw new Error("Failed to fetch movie details");
  return await res.json();
}

export async function fetchMovieRecommendations(movieId) {
  const res = await fetch(`${TMDB_BASE}/movie/${movieId}/recommendations?api_key=${API_KEY}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export async function fetchTrailers(movieId, isTv = false) {
  const endpoint = isTv ? 'tv' : 'movie';
  const res = await fetch(`${TMDB_BASE}/${endpoint}/${movieId}/videos?api_key=${API_KEY}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export async function searchMovies(query) {
  if (!query || !query.trim()) return [];
  const res = await fetch(`${TMDB_BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export async function searchMulti(query) {
  if (!query || !query.trim()) return [];
  const res = await fetch(`${TMDB_BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).filter(
    (item) => item.media_type === "movie" || item.media_type === "tv"
  );
}

export async function scrapeMovieSources(title, year = null, tmdbId = null, imdbId = null) {
  const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const params = new URLSearchParams();
  if (year) params.append("year", year);
  if (tmdbId) params.append("tmdb_id", tmdbId);
  if (imdbId) params.append("imdb_id", imdbId);
  const queryString = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/scrape/${encodeURIComponent(cleanTitle)}${queryString}`);
  if (!res.ok) throw new Error("Failed to scrape movie sources");
  return await res.json();
}

export async function scrapeTvSources(tmdbId, season = 1, episode = 1, title = "", imdbId = null) {
  const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const params = new URLSearchParams({
    season: String(season),
    episode: String(episode),
    title: cleanTitle
  });
  if (imdbId) params.append("imdb_id", imdbId);
  const res = await fetch(`/api/scrape/tv/${tmdbId}?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to scrape TV episode sources");
  return await res.json();
}

/**
 * POST /stream/init
 * Registers a magnet link with the stream server, waits for torrent metadata,
 * and returns { infoHash }. Use the hash to build the video src URL:
 *   <video src={`/stream/${infoHash}`} />
 *
 * Phase 2A: if `torrentUrl` is supplied (YTS provides direct .torrent URLs),
 * the server fetches the .torrent buffer instead of resolving via DHT.
 * TTFB drops from ~15s → ~1-3s for YTS content.
 */
export async function initStream(magnet, infoHash = null, torrentUrl = null, options = {}) {
  const payload = { magnet, infoHash, torrentUrl };
  if (options.fileIdx !== undefined && options.fileIdx !== null) payload.fileIdx = options.fileIdx;
  if (options.season !== undefined && options.season !== null) payload.season = options.season;
  if (options.episode !== undefined && options.episode !== null) payload.episode = options.episode;

  const res = await fetch('/stream/init', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({ error: 'Unknown stream error' }));
    throw new Error(errorPayload.error || `Stream init failed (HTTP ${res.status})`);
  }

  return res.json(); // { infoHash: string }
}

export async function fetchSubtitles({ imdbId, season = null, episode = null, lang = 'eng' }) {
  if (!imdbId) return [];
  const params = new URLSearchParams({ imdb_id: imdbId, lang });
  if (season !== null && season !== undefined) params.append('season', season);
  if (episode !== null && episode !== undefined) params.append('episode', episode);

  const res = await fetch(`/api/subtitles?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function enqueueTrendingMovies(moviesList) {
  if (!moviesList || moviesList.length === 0) return;
  const payload = moviesList.map(m => ({
    title: m.title || m.original_title,
    year: m.release_date ? parseInt(m.release_date.split('-')[0], 10) : null
  }));
  try {
    await fetch('/api/bulk/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movies: payload })
    });
  } catch (err) {
    console.error('Failed to enqueue trending movies:', err);
  }
}

