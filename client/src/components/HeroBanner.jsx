import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IMAGE_BASE_ORIGINAL, fetchTrailers } from '../services/api';
import TrailerModal from './TrailerModal';

export default function HeroBanner({ movies = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const navigate = useNavigate();

  const heroMovies = movies.slice(0, 5);
  const currentMovie = heroMovies[currentIndex];

  useEffect(() => {
    if (heroMovies.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroMovies.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroMovies.length]);

  if (!currentMovie) return null;

  const backdropUrl = currentMovie.backdrop_path
    ? `${IMAGE_BASE_ORIGINAL}${currentMovie.backdrop_path}`
    : '';

  const handleWatchTrailer = async () => {
    try {
      const trailers = await fetchTrailers(currentMovie.id);
      const official = trailers.find(
        (t) => t.type === 'Trailer' && t.site === 'YouTube'
      ) || trailers[0];

      if (official) {
        setTrailerKey(official.key);
      } else {
        setTrailerKey(null);
      }
      setIsTrailerOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <section
        className="hero"
        style={{
          backgroundImage: backdropUrl ? `linear-gradient(to top, #0f172a 10%, rgba(15,23,42,0.4)), url(${backdropUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'background-image 0.5s ease-in-out'
        }}
      >
        <div className="hero-content">
          <h2 className="hero-title">{currentMovie.title}</h2>
          <p className="shortDesc">
            {currentMovie.overview ? `${currentMovie.overview.slice(0, 180)}...` : ''}
          </p>
          <div className="hero-actions" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              className="btn detailsBtn"
              onClick={() => navigate(`/movie/${currentMovie.id}`)}
            >
              Watch Movie
            </button>
            <button className="btn slider-trailer-btn" onClick={handleWatchTrailer}>
              Watch Trailer
            </button>
          </div>
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

