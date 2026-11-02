import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GENRES, IMAGE_BASE_W500 } from '../services/api';

export default function MovieCard({ movie, isClickable = true, isTv = false }) {
  const navigate = useNavigate();

  const isTvShow = isTv || movie.media_type === 'tv' || (!movie.title && !!movie.name);
  const title = movie.title || movie.name || 'Untitled';
  const releaseDate = movie.release_date || movie.first_air_date;

  const genres = (movie.genre_ids || [])
    .map((id) => GENRES[id])
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');

  const poster = movie.poster_path
    ? `${IMAGE_BASE_W500}${movie.poster_path}`
    : 'https://via.placeholder.com/300x450?text=No+Poster';

  const year     = releaseDate ? releaseDate.split('-')[0] : 'N/A';
  const numRating = movie.vote_average ? Number(movie.vote_average.toFixed(1)) : 0;
  const rating    = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';

  const rateClass =
    numRating >= 7 ? 'rate-good' : numRating >= 5 ? 'rate-mid' : 'rate-bad';

  const handleClick = () => {
    if (isClickable) {
      if (isTvShow) {
        navigate(`/movie/${movie.id}?type=tv`);
      } else {
        navigate(`/movie/${movie.id}`);
      }
    }
  };

  return (
    <article
      className={`movie-card${!isClickable ? ' unclickable' : ''}`}
      onClick={handleClick}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      {/* ── Poster ── */}
      <div className="poster-wrap">
        <img className="poster" src={poster} alt={title} loading="lazy" />

        {/* Rating badge */}
        <span className={`rating-badge ${rateClass}`}>{rating}</span>

        {/* Phase 4: Purple play-button hover overlay */}
        {isClickable && (
          <div className="card-hover-overlay">
            <div className="card-play-btn" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="card-body">
        <h3 className="movie-title">{title}</h3>
        <div className="meta">
          {genres && <span className="genre">{genres}</span>}
          {genres && <span className="dot" aria-hidden="true">•</span>}
          <span className="year">{year}</span>
        </div>
      </div>
    </article>
  );
}
