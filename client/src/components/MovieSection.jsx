import React, { useRef } from 'react';
import MovieCard from './MovieCard';

export default function MovieSection({ id, title, movies = [], scrollable = false }) {
  const containerRef = useRef(null);

  const handleScroll = (direction) => {
    if (containerRef.current) {
      const scrollAmount = 600;
      containerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="movie-section" id={id}>
      <div className="container" style={{ position: 'relative' }}>
        <h3>{title}</h3>

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

        <div ref={containerRef} className="movie-grid">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </div>
    </section>
  );
}
