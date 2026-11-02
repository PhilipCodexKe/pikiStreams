import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IMAGE_BASE_ORIGINAL, GENRES } from '../services/api';

function getYear(movie) {
  return movie.release_date ? movie.release_date.split('-')[0] : '';
}

function getGenre(movie) {
  const id = (movie.genre_ids || [])[0];
  return id ? GENRES[id] : '';
}

export default function SpotlightRow({ movies = [] }) {
  const navigate = useNavigate();
  const picks = movies.slice(0, 2);

  if (picks.length === 0) return null;

  return (
    <div className="spotlight-row">
      {picks.map((movie, i) => {
        const backdrop = movie.backdrop_path
          ? `${IMAGE_BASE_ORIGINAL}${movie.backdrop_path}`
          : '';
        const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '';
        const year   = getYear(movie);
        const genre  = getGenre(movie);

        const labels = ['New Release', 'Trending Now'];

        return (
          <div
            key={movie.id}
            className="spotlight-card"
            onClick={() => navigate(`/movie/${movie.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/movie/${movie.id}`)}
            aria-label={`Go to ${movie.title}`}
          >
            {/* Background */}
            {backdrop && (
              <div
                className="spotlight-bg"
                style={{ backgroundImage: `url(${backdrop})` }}
              />
            )}

            {/* Gradient overlay */}
            <div className="spotlight-gradient" />

            {/* Content */}
            <div className="spotlight-content">
              <span className="spotlight-label">{labels[i] ?? 'Featured'}</span>
              <h3 className="spotlight-title">{movie.title}</h3>
              <div className="spotlight-meta">
                {rating && <span>★ {rating}</span>}
                {year   && <><span className="spotlight-dot">·</span><span>{year}</span></>}
                {genre  && <><span className="spotlight-dot">·</span><span>{genre}</span></>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

