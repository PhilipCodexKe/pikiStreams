import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchMovieDetails,
  fetchMovieRecommendations,
  fetchLatest,
  fetchTrailers,
  scrapeMovieSources,
  initStream,
  IMAGE_BASE_ORIGINAL,
  IMAGE_BASE_W500,
  IMAGE_BASE_W300,
} from '../services/api';
import TrailerModal from '../components/TrailerModal';

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [movie, setMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [latestMovies, setLatestMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Trailer modal state
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Source scraping / stream state
  const [scraping, setScraping] = useState(false);
  const [sources, setSources] = useState(null);
  const [activeModalType, setActiveModalType] = useState(null); // 'stream' or 'download' or null
  const [activeStreamUrl, setActiveStreamUrl] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);   // waiting for /stream/init

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [movieData, recData, latestData] = await Promise.all([
          fetchMovieDetails(id),
          fetchMovieRecommendations(id),
          fetchLatest(),
        ]);
        setMovie(movieData);
        setRecommendations(recData);
        setLatestMovies(latestData);
      } catch (err) {
        console.error('Failed to load movie details', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    window.scrollTo(0, 0);
  }, [id]);

  const handleOpenTrailer = async () => {
    try {
      const trailers = await fetchTrailers(id);
      const official = trailers.find(
        (t) => t.type === 'Trailer' && t.site === 'YouTube'
      ) || trailers[0];

      if (official) setTrailerKey(official.key);
      else setTrailerKey(null);
      setIsTrailerOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFetchSources = async (type) => {
    setActiveModalType(type);
    if (sources) return; // Already fetched

    try {
      setScraping(true);
      const releaseYear = movie.release_date ? parseInt(movie.release_date.split('-')[0], 10) : null;
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
      // Phase 2A: torrentUrl (YTS only) lets the server skip DHT entirely
      const { infoHash: resolvedHash } = await initStream(magnet, infoHash, torrentUrl);
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
      <div className="container" style={{ color: '#fff', textAlign: 'center', marginTop: '100px' }}>
        <h2>Movie not found</h2>
        <button className="btn" onClick={() => navigate('/')}>Back Home</button>
      </div>
    );
  }

  const backdrop = movie.backdrop_path ? `${IMAGE_BASE_ORIGINAL}${movie.backdrop_path}` : '';
  const poster = movie.poster_path ? `${IMAGE_BASE_W500}${movie.poster_path}` : '';
  const cast = (movie.credits?.cast || []).slice(0, 5).map((c) => c.name).join(', ');
  const director = movie.credits?.crew?.find((c) => c.job === 'Director')?.name || 'N/A';
  const hours = Math.floor((movie.runtime || 0) / 60);
  const minutes = (movie.runtime || 0) % 60;
  const runtimeFormatted = `${hours}h ${minutes}m`;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';

  return (
    <div className="movie-detail-page">
      {/* Background Poster */}
      <div
        className="background-poster"
        style={{
          backgroundImage: backdrop ? `url(${backdrop})` : 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: -1,
          opacity: 0.15,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      ></div>

      <div className="container" style={{ padding: '40px 20px' }}>
        <div className="movie-header" style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          <div className="poster-container" style={{ flex: '0 0 280px' }}>
            <img
              src={poster}
              alt={movie.title}
              style={{ width: '100%', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
            />
          </div>

          <div className="info-container" style={{ flex: '1 1 500px', color: '#fff' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{movie.title}</h1>
            <p style={{ color: '#9aa3ad', fontSize: '1.1rem', marginBottom: '16px' }}>
              {movie.release_date?.split('-')[0]} • {runtimeFormatted} • ⭐ {rating}/10
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {movie.genres?.map((g) => (
                <span
                  key={g.id}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                  }}
                >
                  {g.name}
                </span>
              ))}
            </div>

            <p style={{ lineHeight: '1.6', fontSize: '1.05rem', marginBottom: '20px', color: '#e2e8f0' }}>
              {movie.overview}
            </p>

            <div style={{ marginBottom: '24px', color: '#cbd5e1', fontSize: '0.95rem' }}>
              <p><strong>Director:</strong> {director}</p>
              <p><strong>Starring:</strong> {cast || 'N/A'}</p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn stream-btn"
                onClick={() => handleFetchSources('stream')}
              >
                Watch Movie (Stream)
              </button>
              <button
                className="btn download-btn"
                onClick={() => handleFetchSources('download')}
              >
                Download Sources
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleOpenTrailer}
              >
                Watch Trailer
              </button>
            </div>
          </div>
        </div>

        {/* Similar / Recommended Movies */}
        {recommendations.length > 0 && (
          <section style={{ marginTop: '60px' }}>
            <h2 className="section-title">Similar Movies</h2>
            <div className="movies-grid scroll-container" style={{ display: 'flex', overflowX: 'auto', gap: '16px', paddingBottom: '16px' }}>
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="rec-card"
                  style={{ flex: '0 0 160px', cursor: 'pointer' }}
                  onClick={() => navigate(`/movie/${rec.id}`)}
                >
                  <img
                    src={rec.poster_path ? `${IMAGE_BASE_W300}${rec.poster_path}` : 'https://via.placeholder.com/160x240'}
                    alt={rec.title}
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                  <h4 style={{ color: '#fff', fontSize: '0.9rem', marginTop: '6px' }}>{rec.title}</h4>
                </div>
              ))}
            </div>
          </section>
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
          className="modal-overlay active"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveModalType(null);
              setActiveStreamUrl(null);
              setStreamLoading(false);
            }
          }}
        >
          <div
            className="modal-content"
            style={{
              background: '#1e293b',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '700px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              color: '#fff',
              position: 'relative',
            }}
          >
            <button
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1.5rem',
                cursor: 'pointer',
              }}
              onClick={() => {
                setActiveModalType(null);
                setActiveStreamUrl(null);
                setStreamLoading(false);
              }}
            >
              &times;
            </button>

            {activeStreamUrl ? (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Streaming: {movie.title}</h3>
                <video
                  src={activeStreamUrl}
                  controls
                  autoPlay
                  style={{ width: '100%', maxHeight: '400px', borderRadius: '8px' }}
                />
                <button
                  className="btn"
                  style={{ marginTop: '16px' }}
                  onClick={() => setActiveStreamUrl(null)}
                >
                  Back to sources
                </button>
              </div>
            ) : (
              <div>
                <h3 style={{ marginBottom: '16px' }}>
                  {activeModalType === 'stream' ? 'Select Stream Source' : 'Select Download Magnet'}
                </h3>

                {/* Phase 1: Scraping sources */}
                {scraping && (
                  <div style={{ textAlign: 'center', padding: '30px' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                    <p>Scraping sources for {movie.title}...</p>
                  </div>
                )}

                {/* Phase 2: Connecting to swarm after user clicks Stream */}
                {!scraping && streamLoading && (
                  <div style={{ textAlign: 'center', padding: '30px' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                    <p>Connecting to swarm — this takes a few seconds...</p>
                  </div>
                )}

                {!scraping && !streamLoading && (!sources || sources.length === 0) && (
                  <p style={{ color: '#94a3b8' }}>
                    No torrent/stream sources found for this movie. Make sure the backend scraper server is running.
                  </p>
                )}

                {!scraping && !streamLoading && sources && sources.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {sources.map((src, index) => {
                      const quality = src.quality !== 'Unknown' ? src.quality : '';
                      const size = src.size !== 'Unknown' ? src.size : '';
                      const seeders = src.seeders ? `${src.seeders} seeds` : '';
                      const meta = [quality, size, seeders].filter(Boolean).join(' • ');
                      // Normalizer outputs `magnet`; fall back to `link` for legacy data
                      const magnetUri = src.magnet || src.link;

                      return (
                        <div
                          key={index}
                          style={{
                            background: '#0f172a',
                            padding: '12px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{src.title}</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{meta}</div>
                          </div>
                          {activeModalType === 'stream' ? (
                            <button
                              className="btn"
                              style={{ padding: '6px 14px', fontSize: '0.9rem' }}
                              onClick={() => handleStartStream(magnetUri, src.infoHash, src.torrentUrl || null)}
                            >
                              Stream
                            </button>
                          ) : (
                            <a
                              href={magnetUri}
                              className="btn"
                              style={{ padding: '6px 14px', fontSize: '0.9rem', textDecoration: 'none' }}
                            >
                              Magnet Link
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

