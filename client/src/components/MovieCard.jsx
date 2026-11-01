import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GENRES, IMAGE_BASE_W500 } from '../services/api';

export default function MovieCard({ movie, isClickable = true }) {
  const navigate = useNavigate();

  const genres = (movie.genre_ids || [])
    .map((id) => GENRES[id])
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');

  const poster = movie.poster_path
    ? `${IMAGE_BASE_W500}${movie.poster_path}`
    : 'https://via.placeholder.com/300x450?text=No+Poster';

  const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const numRating = movie.vote_average ? Number(movie.vote_average.toFixed(1)) : 0;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';

  const rateClass =
    numRating >= 7 ? 'rate-good' : numRating >= 5 ? 'rate-mid' : 'rate-bad';

  const handleClick = () => {
    if (isClickable) {
      navigate(`/movie/${movie.id}`);
    }
  };

  return (
    <article
      className={`movie-card ${!isClickable ? 'unclickable' : ''}`}
      onClick={handleClick}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <div className="poster-wrap">
        <img className="poster" src={poster} alt={movie.title} loading="lazy" />
        <span className={`rating-badge ${rateClass}`}>{rating}</span>
      </div>
      <div className="card-body">
        <h3 className="movie-title">{movie.title}</h3>
        <div className="meta">
          {genres && <span className="genre">{genres}</span>}
          {genres && year && <span className="dot" aria-hidden="true" style={{ margin: '0 4px' }}>•</span>}
          <span className="year">{year}</span>
        </div>
      </div>
    </article>
  );
}
