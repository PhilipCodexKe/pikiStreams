import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IMAGE_BASE_ORIGINAL,
  IMAGE_BASE_W500,
  GENRES,
  fetchTrailers,
} from '../services/api';
import TrailerModal from './TrailerModal';

/* ─── helpers ─────────────────────────────────────────── */
function getYear(movie) {
  return movie.release_date ? movie.release_date.split('-')[0] : '';
}

function getGenres(movie) {
  return (movie.genre_ids || [])
    .map((id) => GENRES[id])
    .filter(Boolean)
    .slice(0, 3);
}

/** Split title: first word gets white style, rest get gradient. */
function splitTitle(title = '') {
  const words = title.split(' ');
  if (words.length < 2) return { main: title, sub: '' };
  return { main: words[0], sub: words.slice(1).join(' ') };
}

/** Build a ★ row — filled up to Math.round(score/2), empty for the rest */
function StarRow({ score }) {
  const filled = Math.round((score || 0) / 2);   // out of 5
  return (
    <div className="hero-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`hero-star${i < filled ? '' : ' empty'}`}>
          ★
        </span>
      ))}
    </div>
  );
}

/* ─── component ────────────────────────────────────────── */
export default function HeroBanner({ movies = [] }) {
  const [currentIndex, setCurrentIndex]   = useState(0);
  const [trailerKey, setTrailerKey]       = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [fading, setFading]               = useState(false);
  const navigate = useNavigate();

  const heroMovies   = movies.slice(0, 4);
  const currentMovie = heroMovies[currentIndex];

  /* Auto-rotate every 8 s with a quick fade transition */
  useEffect(() => {
    if (heroMovies.length === 0) return;
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % heroMovies.length);
        setFading(false);
      }, 400);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroMovies.length]);

  if (!currentMovie) return null;

  /* Derived data */
  const backdropUrl = currentMovie.backdrop_path
    ? `${IMAGE_BASE_ORIGINAL}${currentMovie.backdrop_path}`
    : '';

  const posterUrl = (movie) =>
    movie.poster_path
      ? `${IMAGE_BASE_W500}${movie.poster_path}`
      : 'https://via.placeholder.com/92x138?text=?';

  const rating   = currentMovie.vote_average
    ? currentMovie.vote_average.toFixed(1)
    : 'N/A';
  const voteCount = currentMovie.vote_count
    ? currentMovie.vote_count.toLocaleString()
    : '—';
  const year     = getYear(currentMovie);
  const genres   = getGenres(currentMovie);
  const { main: titleMain, sub: titleSub } = splitTitle(currentMovie.title);

  /* Switch slide */
  const switchTo = (idx) => {
    if (idx === currentIndex) return;
    setFading(true);
    setTimeout(() => {
      setCurrentIndex(idx);
      setFading(false);
    }, 300);
  };

  /* Trailer */
  const handleWatchTrailer = async () => {
    try {
      const trailers = await fetchTrailers(currentMovie.id);
      const official =
        trailers.find((t) => t.type === 'Trailer' && t.site === 'YouTube') ||
        trailers[0];
      setTrailerKey(official ? official.key : null);
    } catch {
      setTrailerKey(null);
    }
    setIsTrailerOpen(true);
  };

  return (
    <>
      <section className="hero">
        {/* ── Background image ── */}
        <div
          className={`hero-bg${fading ? ' hero-fading' : ''}`}
          style={{ backgroundImage: backdropUrl ? `url(${backdropUrl})` : undefined }}
        />

        {/* ── Decorative layers ── */}
        <div className="hero-purple-glow" />
        <div className="hero-gradient" />
        <div className="hero-accent-line" />

        {/* ── Main content ── */}
        <div className={`hero-content${fading ? ' hero-fading' : ''}`}>

          {/* Eyebrow row */}
          <div className="hero-eyebrow">
            <span className="hero-rank">#{ currentIndex + 1 } Trending This Week</span>
            <div className="hero-eyebrow-line" />
            <span className="hero-type-badge">Movie</span>
          </div>

          {/* Title */}
          <h1 className="hero-title">
            <span className="hero-title-main">{titleMain}</span>
            {titleSub && (
              <span className="hero-title-sub"> {titleSub}</span>
            )}
          </h1>

          {/* Rating row */}
          <div className="hero-rating-row">
            <div className="hero-imdb-score">
              <span className="score-num">{rating}</span>
              <span className="score-label">IMDb</span>
            </div>
            <StarRow score={parseFloat(rating)} />
            {voteCount !== '—' && (
              <span className="hero-vote-count">{voteCount} ratings</span>
            )}
          </div>

          {/* Genre / year tags */}
          <div className="hero-tags">
            {genres.map((g) => (
              <span key={g} className="hero-tag">{g}</span>
            ))}
            {year && <span className="hero-tag">{year}</span>}
          </div>

          {/* Overview */}
          <p className="hero-desc">
            {currentMovie.overview
              ? `${currentMovie.overview.slice(0, 200)}${currentMovie.overview.length > 200 ? '…' : ''}`
              : ''}
          </p>

          {/* Actions */}
          <div className="hero-actions">
            <button
              className="btn-hero-watch"
              onClick={() => navigate(`/movie/${currentMovie.id}`)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Watch Now
            </button>

            <button className="btn-hero-trailer" onClick={handleWatchTrailer}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Trailer
            </button>

            <button
              className="btn-hero-add"
              title="Add to Watchlist"
              aria-label="Add to watchlist"
            >
              +
            </button>
          </div>
        </div>

        {/* ── Thumbnail strip (right) ── */}
        <div className="hero-thumbnails">
          {heroMovies.map((m, i) => (
            <div
              key={m.id}
              className={`hero-thumb${i === currentIndex ? ' active' : ''}`}
              onClick={() => switchTo(i)}
              role="button"
              aria-label={m.title}
            >
              <img src={posterUrl(m)} alt={m.title} loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      <TrailerModal
        isOpen={isTrailerOpen}
        trailerKey={trailerKey}
        onClose={() => setIsTrailerOpen(false)}
      />
    </>
  );
}
