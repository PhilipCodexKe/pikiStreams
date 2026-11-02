import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchMovieDetails,
  fetchMovieRecommendations,
  fetchTrailers,
  scrapeMovieSources,
  initStream,
  IMAGE_BASE_ORIGINAL,
  IMAGE_BASE_W500,
  IMAGE_BASE_W300,
} from '../services/api';
import TrailerModal from '../components/TrailerModal';
import MovieSection from '../components/MovieSection';
import '../styles/movie-detail.css';

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [movie, setMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // Trailer modal state
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Source scraping / stream state
  const [scraping, setScraping] = useState(false);
  const [sources, setSources] = useState(null);
  const [activeModalType, setActiveModalType] = useState(null); // 'stream' or 'download' or null
  const [activeStreamUrl, setActiveStreamUrl] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      // Reset state for new movie
      setSources(null);
      setActiveModalType(null);
      setActiveStreamUrl(null);
      setTrailerKey(null);
      setIsTrailerOpen(false);
      try {
        const [movieData, recData] = await Promise.all([
          fetchMovieDetails(id),
          fetchMovieRecommendations(id),
        ]);
        setMovie(movieData);
        setRecommendations(recData);
      } catch (err) {
        console.error('Failed to load movie details', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    window.scrollTo(0, 0);
    setIsOverviewExpanded(false);
  }, [id]);

  const handleOpenTrailer = async () => {
    try {
      const trailers = await fetchTrailers(id);
      const official =
        trailers.find((t) => t.type === 'Trailer' && t.site === 'YouTube') ||
        trailers[0];

      if (official) setTrailerKey(official.key);
      else setTrailerKey(null);
      setIsTrailerOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFetchSources = async (type) => {
    setActiveModalType(type);
    if (sources) return;

    try {
      setScraping(true);
      const releaseYear = movie.release_date
        ? parseInt(movie.release_date.split('-')[0], 10)
        : null;
      const res = await scrapeMovieSources(movie.title, releaseYear);
      if (res && res.data) {
        setSources(res.data);
      }
    } catch (err) {
      console.error('Error fetching sources:', err);
    } finally {
      setScraping(false);
    }
  };

  const handleStartStream = async (magnet, infoHash, torrentUrl) => {
    setStreamLoading(true);
    try {
      const { infoHash: resolvedHash } = await initStream(
        magnet,
        infoHash,
        torrentUrl
      );
      setActiveStreamUrl(`/stream/${resolvedHash}`);
    } catch (err) {
      console.error('[Stream] Init failed:', err);
      alert(`Could not connect to stream:\n${err.message}`);
    } finally {
      setStreamLoading(false);
    }
  };

  if (loading) {
    return (
      <div id="page-loader">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div
        className="container"
        style={{ color: '#fff', textAlign: 'center', marginTop: '100px' }}
      >
        <h2>Movie not found</h2>
        <button
          className="btn"
          style={{ marginTop: '20px' }}
          onClick={() => navigate('/')}
        >
          Back Home
        </button>
      </div>
    );
  }

  const backdrop = movie.backdrop_path
    ? `${IMAGE_BASE_ORIGINAL}${movie.backdrop_path}`
    : '';
  const poster = movie.poster_path
    ? `${IMAGE_BASE_W500}${movie.poster_path}`
    : 'https://via.placeholder.com/500x750?text=No+Poster';

  const castList = movie.credits?.cast || [];
  const topCast = castList.slice(0, 10);
  const director =
    movie.credits?.crew?.find((c) => c.job === 'Director')?.name || 'N/A';
  const writer =
    movie.credits?.crew?.find((c) => c.job === 'Screenplay' || c.job === 'Writer')
      ?.name || null;
  const studio =
    movie.production_companies && movie.production_companies.length > 0
      ? movie.production_companies[0].name
      : null;

  const hours = Math.floor((movie.runtime || 0) / 60);
  const minutes = (movie.runtime || 0) % 60;
  const runtimeFormatted =
    movie.runtime > 0 ? `${hours}h ${minutes}m` : 'Runtime N/A';

  const numRating = movie.vote_average
    ? Number(movie.vote_average.toFixed(1))
    : 0;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const starCount = Math.round(numRating / 2);
  const releaseYear = movie.release_date
    ? movie.release_date.split('-')[0]
    : 'N/A';

  return (
    <div className="movie-detail-page">
      {/* ============================================================
          FIXED FULL-PAGE BACKDROP (Stays in place during scroll)
          ============================================================ */}
      {backdrop && (
        <div className="md-fixed-bg-wrap">
          <div
            className="md-hero-bg"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
          <div className="md-hero-gradient" />
          <div className="md-hero-glow" />
        </div>
      )}

      {/* ============================================================
          HERO ZONE (Details & Controls)
          ============================================================ */}
      <section className="md-hero">
        <div className="md-hero-accent-line" />

        <div className="md-hero-content">
          {/* Poster */}
          <div className="md-poster-wrap">
            <img className="md-poster" src={poster} alt={movie.title} />
          </div>

          {/* Info Details */}
          <div className="md-info">
            <div className="md-eyebrow">
              <span className="md-eyebrow-year">{releaseYear}</span>
              <span className="md-eyebrow-line" />
              <span className="md-type-badge">Feature Film</span>
            </div>

            <h1 className="md-title">{movie.title}</h1>
            {movie.tagline && <p className="md-tagline">“{movie.tagline}”</p>}

            {/* Rating & Metadata Badges */}
            <div className="md-rating-row">
              <div className="md-score-box">
                <span className="md-score-num">{rating}</span>
                <span className="md-score-denom">/ 10</span>
              </div>

              <div className="md-stars" aria-label={`Rating: ${numRating}/10`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span
                    key={s}
                    className={`md-star ${s <= starCount ? '' : 'empty'}`}
                  >
                    ★
                  </span>
                ))}
              </div>

              {movie.vote_count ? (
                <span className="md-vote-count">
                  ({movie.vote_count.toLocaleString()} votes)
                </span>
              ) : null}

              <span className="md-meta-pill">{runtimeFormatted}</span>
              {movie.status && <span className="md-meta-pill">{movie.status}</span>}
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="md-genres">
                {movie.genres.map((g) => (
                  <span key={g.id} className="md-genre-tag">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview / Storyline */}
            {movie.overview && (
              <div>
                <div className="md-section-label">Storyline</div>
                <p
                  className={`md-overview ${
                    isOverviewExpanded ? 'expanded' : ''
                  }`}
                >
                  {movie.overview}
                </p>
                {movie.overview.length > 250 && (
                  <button
                    className="md-show-more"
                    onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                  >
                    {isOverviewExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {/* Key Crew Meta */}
            <div className="md-crew-grid">
              <div className="md-crew-item">
                <div className="md-crew-label">Director</div>
                <div className="md-crew-value">{director}</div>
              </div>
              {writer && (
                <div className="md-crew-item">
                  <div className="md-crew-label">Writer</div>
                  <div className="md-crew-value">{writer}</div>
                </div>
              )}
              {studio && (
                <div className="md-crew-item">
                  <div className="md-crew-label">Studio</div>
                  <div className="md-crew-value">{studio}</div>
                </div>
              )}
              <div className="md-crew-item">
                <div className="md-crew-label">Release Date</div>
                <div className="md-crew-value">
                  {movie.release_date || 'N/A'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="md-actions">
              <button
                className="md-btn-watch"
                onClick={() => handleFetchSources('stream')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Watch Movie (Stream)
              </button>
              <button
                className="md-btn-download"
                onClick={() => handleFetchSources('download')}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Sources
              </button>
              <button className="md-btn-trailer" onClick={handleOpenTrailer}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Watch Trailer
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          BELOW HERO CONTENT: CAST & SIMILAR MOVIES
          ============================================================ */}
      <div className="md-below">
        {/* Top Billed Cast */}
        {topCast.length > 0 && (
          <section className="md-cast-section">
            <div className="md-section-heading">
              <span className="md-section-heading-icon">🎭</span>
              <h2>Top Billed Cast</h2>
            </div>
            <div className="md-cast-scroll">
              {topCast.map((person) => {
                const profileImg = person.profile_path
                  ? `${IMAGE_BASE_W300}${person.profile_path}`
                  : null;
                const initials = person.name
                  ? person.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                  : '?';

                return (
                  <div key={person.id || person.credit_id} className="md-cast-card">
                    <div className="md-cast-photo-wrap">
                      {profileImg ? (
                        <img
                          src={profileImg}
                          alt={person.name}
                          className="md-cast-photo"
                          loading="lazy"
                        />
                      ) : (
                        <div className="md-cast-avatar">{initials}</div>
                      )}
                    </div>
                    <div className="md-cast-name" title={person.name}>
                      {person.name}
                    </div>
                    <div className="md-cast-character" title={person.character}>
                      {person.character || 'Cast'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="md-divider" />

        {/* Similar / Recommended Movies using unified MovieSection */}
        {recommendations.length > 0 && (
          <MovieSection
            id="similar-movies"
            title="More Like This"
            icon="🎬"
            movies={recommendations}
            scrollable={true}
          />
        )}
      </div>

      {/* Trailer Modal */}
      <TrailerModal
        isOpen={isTrailerOpen}
        trailerKey={trailerKey}
        onClose={() => setIsTrailerOpen(false)}
      />

      {/* Stream/Download Modal */}
      {activeModalType && (
        <div
          className="md-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveModalType(null);
              setActiveStreamUrl(null);
              setStreamLoading(false);
            }
          }}
        >
          <div className="md-modal">
            <button
              className="md-modal-close"
              onClick={() => {
                setActiveModalType(null);
                setActiveStreamUrl(null);
                setStreamLoading(false);
              }}
            >
              &times;
            </button>

            {activeStreamUrl ? (
              <div className="md-player-wrap">
                <h3>Now Streaming: {movie.title}</h3>
                <video src={activeStreamUrl} controls autoPlay />
                <button
                  className="md-back-btn"
                  onClick={() => setActiveStreamUrl(null)}
                >
                  ← Back to sources
                </button>
              </div>
            ) : (
              <div>
                <h3 className="md-modal-title">
                  {activeModalType === 'stream'
                    ? '⚡ Select Stream Source'
                    : '⬇ Select Download Magnet'}
                </h3>

                {/* Phase 1: Scraping sources */}
                {scraping && (
                  <div className="md-spinner-wrap">
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                    <p>Scraping sources for {movie.title}...</p>
                  </div>
                )}

                {/* Phase 2: Connecting to swarm */}
                {!scraping && streamLoading && (
                  <div className="md-spinner-wrap">
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                    <p>Connecting to swarm — buffering initial pieces...</p>
                  </div>
                )}

                {!scraping && !streamLoading && (!sources || sources.length === 0) && (
                  <div className="md-no-sources">
                    No torrent/stream sources found for this movie. Make sure your scraper backend is running.
                  </div>
                )}

                {!scraping && !streamLoading && sources && sources.length > 0 && (
                  <div className="md-source-list">
                    {sources.map((src, index) => {
                      const quality = src.quality !== 'Unknown' ? src.quality : null;
                      const size = src.size !== 'Unknown' ? src.size : null;
                      const seeders = src.seeders ? `${src.seeders} seeds` : null;
                      const magnetUri = src.magnet || src.link;

                      return (
                        <div key={index} className="md-source-row">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="md-source-title">{src.title}</div>
                            <div className="md-source-meta">
                              {quality && (
                                <span className="md-source-quality">{quality}</span>
                              )}
                              {size && <span>• {size}</span>}
                              {seeders && (
                                <span className="md-source-seeds">• {seeders}</span>
                              )}
                            </div>
                          </div>
                          {activeModalType === 'stream' ? (
                            <button
                              className="md-source-btn"
                              onClick={() =>
                                handleStartStream(
                                  magnetUri,
                                  src.infoHash,
                                  src.torrentUrl || null
                                )
                              }
                            >
                              ▶ Stream
                            </button>
                          ) : (
                            <a
                              href={magnetUri}
                              className="md-source-btn ghost"
                            >
                              🧲 Magnet
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
