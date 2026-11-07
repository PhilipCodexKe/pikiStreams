import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { searchMulti, IMAGE_BASE_W300 } from "../services/api";

export default function Navbar() {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false); // Phase 1
  const searchContainerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  /* ── Phase 1: glass navbar on scroll ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Search debounce ── */
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchMulti(searchTerm);
        setSuggestions(results.slice(0, 6));
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectItem = (item) => {
    setShowSuggestions(false);
    setIsFocused(false);
    setSearchTerm("");
    const type = item.media_type === "tv" ? "tv" : "movie";
    navigate(`/${type}/${item.id}`);
  };

  const isHome = location.pathname === "/";

  return (
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <div className="header-inner">
        <Link to="/" className="site-logo">
          <img
            src="/logo.png"
            alt="PikiStreams Logo"
            className="site-logo-img"
          />
          <h1>ikiStreams</h1>
        </Link>

        <nav className="site-nav">
          <Link to="/" className={isHome ? "nav-active" : ""}>
            Home
          </Link>
          <a href="/#top-rated-section">Top Movies</a>
          <a href="/#trending-tv-section">Trending Series</a>
          <a href="/#latest-section">Latest Movies</a>
          <a href="/#upcoming-section">Upcoming Movies</a>
        </nav>

        <div
          className={`search-wrap${isFocused || searchTerm ? " search-active" : ""}`}
          ref={searchContainerRef}
        >
          <input
            type="search"
            id="search-input"
            placeholder="Search movies & TV..."
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
            <div
              className="search-suggestions active"
              style={{ display: "block" }}
            >
              {suggestions.map((item) => {
                const poster = item.poster_path
                  ? `${IMAGE_BASE_W300}${item.poster_path}`
                  : "https://via.placeholder.com/45x68?text=No+Poster";
                const isTv = item.media_type === "tv";
                const title = isTv ? item.name : item.title;
                const releaseDate = isTv
                  ? item.first_air_date
                  : item.release_date;
                const year = releaseDate ? releaseDate.split("-")[0] : "";

                return (
                  <div
                    key={`${item.media_type}-${item.id}`}
                    className="suggestion-item"
                    onClick={() => handleSelectItem(item)}
                  >
                    <img
                      className="suggestion-poster"
                      src={poster}
                      alt={title}
                    />
                    <div className="suggestion-info">
                      <span className="suggestion-title">{title}</span>
                      <div className="suggestion-meta">
                        <span
                          className={`suggestion-badge ${isTv ? "badge-tv" : "badge-movie"}`}
                        >
                          {isTv ? "TV" : "MOVIE"}
                        </span>
                        {year && (
                          <span className="suggestion-year">{year}</span>
                        )}
                      </div>
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
