import React, { useRef } from 'react';
import MovieCard from './MovieCard';

export default function MovieSection({ id, title, icon, movies = [], scrollable = false, isTv = false }) {
  const containerRef = useRef(null);

  const handleScroll = (direction) => {
    if (containerRef.current) {
      containerRef.current.scrollBy({
        left: direction === 'left' ? -620 : 620,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="movie-section" id={id}>
      <div className="container" style={{ position: 'relative' }}>

        {/* ── Section header ── */}
        <div className="section-header">
          <div className="section-left">
            {icon && <span className="section-icon">{icon}</span>}
            <h3>{title}</h3>
            {movies.length > 0 && (
              <span className="section-count">{movies.length}</span>
            )}
          </div>
          <a href="#" className="section-see-all" onClick={(e) => e.preventDefault()}>
            See all →
          </a>
        </div>

        {/* ── Scroll arrows ── */}
        {scrollable && (
          <>
            <button
              className="scroll-left"
              onClick={() => handleScroll('left')}
              aria-label="Scroll left"
            >
              &#10094;
            </button>
            <button
              className="scroll-right"
              onClick={() => handleScroll('right')}
              aria-label="Scroll right"
            >
              &#10095;
            </button>
          </>
        )}

        {/* ── Cards ── */}
        <div ref={containerRef} className="movie-grid">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} isTv={isTv} />
          ))}
        </div>
      </div>
    </section>
  );
}
