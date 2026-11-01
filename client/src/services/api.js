// TMDB and Scraper API Service
export const API_KEY = "ab060bf4b27b23c908e05859d2ef7451";

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
};

export async function fetchTrending() {
  const res = await fetch(`${TMDB_BASE}/trending/movie/week?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch trending movies");
  const data = await res.json();
  return data.results || [];
}

export async function fetchTopRated() {
  const res = await fetch(`${TMDB_BASE}/movie/top_rated?api_key=${API_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch top rated movies");
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

export async function fetchMovieDetails(movieId) {
  const res = await fetch(`${TMDB_BASE}/movie/${movieId}?api_key=${API_KEY}&append_to_response=videos,credits`);
  if (!res.ok) throw new Error("Failed to fetch movie details");
  return await res.json();
}

export async function fetchMovieRecommendations(movieId) {
  const res = await fetch(`${TMDB_BASE}/movie/${movieId}/recommendations?api_key=${API_KEY}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export async function fetchTrailers(movieId) {
  const res = await fetch(`${TMDB_BASE}/movie/${movieId}/videos?api_key=${API_KEY}`);
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

export async function scrapeMovieSources(title, year = null) {
  const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const queryParams = year ? `?year=${year}` : '';
  const res = await fetch(`/api/scrape/${encodeURIComponent(cleanTitle)}${queryParams}`);
  if (!res.ok) throw new Error("Failed to scrape movie sources");
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
export async function initStream(magnet, infoHash = null, torrentUrl = null) {
  const res = await fetch('/stream/init', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ magnet, infoHash, torrentUrl }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Unknown stream error' }));
    throw new Error(payload.error || `Stream init failed (HTTP ${res.status})`);
  }

  return res.json(); // { infoHash: string }
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

