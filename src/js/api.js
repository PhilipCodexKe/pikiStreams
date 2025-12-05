// api.js
export const API_KEY = "ab060bf4b27b23c908e05859d2ef7451";

// Base URLs
export const TRENDING_URL = `https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}`;
export const TOP_RATED_URL = `https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}`;
export const LATEST_URL = `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}`;
export const UPCOMING_URL = `https://api.themoviedb.org/3/movie/upcoming?api_key=${API_KEY}`;

export const getMovieDetailUrl = (movieId) =>
  `https://api.themoviedb.org/3/movie/${movieId}?api_key=${API_KEY}&append_to_response=videos,credits`;

export const getTrailerKey = (movieId) =>
  `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${API_KEY}`;

export async function getTrailers(movieId) {
  try {
    const res = await fetch(getTrailerKey(movieId));
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.results;
  } catch (error) {
    console.error(error);
    return [];
  }
}
export async function getMovies(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.results;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getMovieDetails(movieId) {
  try {
    const url = getMovieDetailUrl(movieId);
    const res = await fetch(url);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const SEARCH_URL = `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&query=`;

export async function searchMovies(query) {
  try {
    const res = await fetch(SEARCH_URL + query);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.results;
  } catch (error) {
    console.error(error);
    return [];
  }
}
