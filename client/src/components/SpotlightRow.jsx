import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IMAGE_BASE_ORIGINAL, GENRES } from '../services/api';

function getYear(item) {
  const dateStr = item.release_date || item.first_air_date;
  return dateStr ? dateStr.split('-')[0] : '';
}

function getGenre(item) {
  const id = (item.genre_ids || [])[0];
  return id ? GENRES[id] : '';
}

export default function SpotlightRow({ movies = [], tvShows = [] }) {
  const navigate = useNavigate();
  const moviePick = movies[0] ? { ...movies[0], spotlightLabel: 'New Release' } : null;
  const tvPick = tvShows[0] ? { ...tvShows[0], spotlightLabel: 'Trending Series' } : null;

  // Combine movie and tv picks (or fall back to top 2 movies if no tv shows)
  const picks = [moviePick, tvPick].filter(Boolean);
  if (picks.length === 0 && movies.length > 0) {
    picks.push(...movies.slice(0, 2).map((m, i) => ({
      ...m,
      spotlightLabel: i === 0 ? 'New Release' : 'Trending Series',
    })));
  }

  if (picks.length === 0) return null;

  return (
    <div className="spotlight-row">
      {picks.map((item) => {
        const backdrop = item.backdrop_path
          ? `${IMAGE_BASE_ORIGINAL}${item.backdrop_path}`
          : '';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
        const year   = getYear(item);
        const genre  = getGenre(item);
        const title  = item.title || item.name;
        const isTv   = item.media_type === 'tv' || Boolean(item.first_air_date);
        const linkUrl = isTv ? `/tv/${item.id}` : `/movie/${item.id}`;

        return (
          <div
            key={`${item.id}-${isTv ? 'tv' : 'movie'}`}
            className="spotlight-card"
            onClick={() => navigate(linkUrl)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(linkUrl)}
            aria-label={`Go to ${title}`}
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
              <span className="spotlight-label">{item.spotlightLabel || 'Featured'}</span>
              <h3 className="spotlight-title">{title}</h3>
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

