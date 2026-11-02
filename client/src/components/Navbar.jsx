import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { searchMovies, IMAGE_BASE_W300 } from '../services/api';

export default function Navbar() {
  const [searchTerm, setSearchTerm]       = useState('');
  const [suggestions, setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused]         = useState(false);
  const [scrolled, setScrolled]           = useState(false);  // Phase 1
  const searchContainerRef                = useRef(null);
  const navigate  = useNavigate();
  const location  = useLocation();

  /* ── Phase 1: glass navbar on scroll ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Search debounce ── */
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchMovies(searchTerm);
        setSuggestions(results.slice(0, 5));
        setShowSuggestions(true);
      } catch (err) {
        console.error(err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  /* ── Click outside to close suggestions ── */
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectMovie = (id) => {
    setShowSuggestions(false);
    setIsFocused(false);
    setSearchTerm('');
    navigate(`/movie/${id}`);
  };

  /* Helper: is this link the current route? */
  const isHome = location.pathname === '/';

  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <div className="header-inner">

        {/* Logo */}
        <Link to="/" className="site-logo" style={{ textDecoration: 'none' }}>
          <h1 style={{ margin: 0 }}>PikiStreams</h1>
        </Link>

        {/* Nav pill group */}
        <nav className="site-nav">
          <Link
            to="/"
            className={isHome ? 'nav-active' : ''}
          >
            Home
          </Link>
          <a href="/#trending-section">Trending</a>
          <a href="/#top-rated-section">Top Rated</a>
          <a href="/#latest-section">Latest</a>
          <a href="/#upcoming-section">Upcoming</a>
        </nav>

        {/* Search */}
        <div
          className={`search-wrap${isFocused || searchTerm ? ' search-active' : ''}`}
          ref={searchContainerRef}
        >
          <input
            type="search"
            id="search-input"
            placeholder="Search movies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
              setTimeout(() => {
                if (!searchTerm) setIsFocused(false);
              }, 200);
            }}
          />

          {showSuggestions && suggestions.length > 0 && (
            <div className="search-suggestions active" style={{ display: 'block' }}>
              {suggestions.map((movie) => {
                const poster = movie.poster_path
                  ? `${IMAGE_BASE_W300}${movie.poster_path}`
                  : 'https://via.placeholder.com/45x68?text=No+Poster';
                const year = movie.release_date
                  ? movie.release_date.split('-')[0]
                  : '';

                return (
                  <div
                    key={movie.id}
                    className="suggestion-item"
                    onClick={() => handleSelectMovie(movie.id)}
                  >
                    <img className="suggestion-poster" src={poster} alt={movie.title} />
                    <div className="suggestion-info">
                      <span className="suggestion-title">{movie.title}</span>
                      <span className="suggestion-year">{year}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
