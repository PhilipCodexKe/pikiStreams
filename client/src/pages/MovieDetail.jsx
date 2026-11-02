import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchMovieDetails,
  fetchMovieRecommendations,
  fetchTrailers,
  fetchTrending,
  fetchTopRated,
  fetchPopular,
  fetchTvDetails,
  fetchTvSeason,
  scrapeMovieSources,
  scrapeTvSources,
  initStream,
  IMAGE_BASE_ORIGINAL,
  IMAGE_BASE_W500,
  IMAGE_BASE_W300,
} from "../services/api";
import TrailerModal from "../components/TrailerModal";
import MovieSection from "../components/MovieSection";
import "../styles/movie-detail.css";

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Detect TV show mode via ?type=tv query param or /tv/ route
  const isTv = new URLSearchParams(location.search).get("type") === "tv"
    || location.pathname.startsWith("/tv/");

  const [movie, setMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [trending, setTrending] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [popular, setPopular] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // TV-specific state
  const [tvSeasons, setTvSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null); // null = show season grid
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  // Per-episode inline source panel: { [episodeId]: { loading, sources, open } }
  const [episodePanels, setEpisodePanels] = useState({});

  // Trailer modal state
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Source scraping / stream state
  const [scraping, setScraping] = useState(false);
  const [sources, setSources] = useState(null);
  const [activeModalType, setActiveModalType] = useState(null); // 'stream' or 'download' or null
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [activeStreamUrl, setActiveStreamUrl] = useState(null);
  const [isPlayerActive, setIsPlayerActive] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const playerRef = useRef(null);
  const episodesRef = useRef(null);

  const closeModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setActiveModalType(null);
      setIsModalClosing(false);
      setStreamLoading(false);
    }, 240);
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      // Reset state for new title
      setSources(null);
      setActiveModalType(null);
      setActiveStreamUrl(null);
      setIsPlayerActive(false);
      setIsVideoReady(false);
      setTrailerKey(null);
      setIsTrailerOpen(false);
      setSelectedSeason(null);
      setEpisodePanels({});
      setEpisodes([]);
      try {
        if (isTv) {
          // TV show: fetch TV details only — episodes loaded on-demand when user picks a season
          const [tvData, trendingData, topData, popularData] =
            await Promise.all([
              fetchTvDetails(id),
              fetchTrending(),
              fetchTopRated(),
              fetchPopular(),
            ]);
          setMovie(tvData);
          // Filter out season 0 (Specials) for cleaner UX
          setTvSeasons((tvData.seasons || []).filter((s) => s.season_number > 0));
          setTrending(trendingData);
          setTopRated(topData);
          setPopular(popularData);
        } else {
          // Movie: existing flow
          const [movieData, recData, trendingData, topData, popularData] =
            await Promise.all([
              fetchMovieDetails(id),
              fetchMovieRecommendations(id),
              fetchTrending(),
              fetchTopRated(),
              fetchPopular(),
            ]);
          setMovie(movieData);
          setRecommendations(recData);
          setTrending(trendingData);
          setTopRated(topData);
          setPopular(popularData);
        }
      } catch (err) {
        console.error("Failed to load details", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    window.scrollTo(0, 0);
    setIsOverviewExpanded(false);
  }, [id, isTv]);

  const handleOpenTrailer = async () => {
    try {
      const trailers = await fetchTrailers(id);
      const official =
        trailers.find((t) => t.type === "Trailer" && t.site === "YouTube") ||
        trailers[0];

      if (official) setTrailerKey(official.key);
      else setTrailerKey(null);
      setIsTrailerOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  // When user selects a season, load its episodes
  useEffect(() => {
    if (!isTv || !id || selectedSeason === null) return;
    async function loadSeason() {
      setEpisodesLoading(true);
      setEpisodePanels({});
      setEpisodes([]);
      try {
        const seasonData = await fetchTvSeason(id, selectedSeason);
        setEpisodes(seasonData.episodes || []);
      } catch (err) {
        console.error("Failed to load season", err);
      } finally {
        setEpisodesLoading(false);
      }
    }
    loadSeason();
  }, [selectedSeason, id, isTv]);

  // Toggle an episode's inline source panel open/closed
  // If opening for the first time, fetch sources from EZTV
  const handleToggleEpisodePanel = async (episode) => {
    const epId = episode.id;
    const panel = episodePanels[epId];

    // If already open, just close it
    if (panel?.open) {
      setEpisodePanels((prev) => ({
        ...prev,
        [epId]: { ...prev[epId], open: false },
      }));
      return;
    }

    // Open the panel (show spinner immediately)
    setEpisodePanels((prev) => ({
      ...prev,
      [epId]: { open: true, loading: !panel?.sources, sources: panel?.sources || null },
    }));

    // If we already fetched sources for this episode, don't re-fetch
    if (panel?.sources) return;

    try {
      const showTitle = movie?.name || movie?.original_name || "";
      const res = await scrapeTvSources(id, selectedSeason, episode.episode_number, showTitle);
      setEpisodePanels((prev) => ({
        ...prev,
        [epId]: { open: true, loading: false, sources: res?.data || [] },
      }));
    } catch (err) {
      console.error("Error fetching TV episode sources:", err);
      setEpisodePanels((prev) => ({
        ...prev,
        [epId]: { open: true, loading: false, sources: [] },
      }));
    }
  };

  const handleFetchSources = async (type) => {
    setActiveModalType(type);
    if (sources) return;

    try {
      setScraping(true);
      const releaseYear = movie.release_date
        ? parseInt(movie.release_date.split("-")[0], 10)
        : null;
      const res = await scrapeMovieSources(movie.title, releaseYear);
      if (res && res.data) {
        setSources(res.data);
      }
    } catch (err) {
      console.error("Error fetching sources:", err);
    } finally {
      setScraping(false);
    }
  };

  const handleStartStream = async (magnet, infoHash, torrentUrl) => {
    setIsPlayerActive(true); // Player stays visible on page immediately
    setStreamLoading(true);
    setIsVideoReady(false);
    // Smoothly close the modal and start scrolling to player right away
    closeModal();
    setTimeout(() => {
      playerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 60);

    try {
      const { infoHash: resolvedHash } = await initStream(
        magnet,
        infoHash,
        torrentUrl,
      );
      setActiveStreamUrl(`/stream/${resolvedHash}`);
    } catch (err) {
      console.error("[Stream] Init failed:", err);
      alert(`Could not connect to stream:\n${err.message}`);
      setIsPlayerActive(false);
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
        style={{ color: "#fff", textAlign: "center", marginTop: "100px" }}
      >
        <h2>Movie not found</h2>
        <button
          className="btn"
          style={{ marginTop: "20px" }}
          onClick={() => navigate("/")}
        >
          Back Home
        </button>
      </div>
    );
  }

  const backdrop = movie.backdrop_path
    ? `${IMAGE_BASE_ORIGINAL}${movie.backdrop_path}`
    : "";
  const poster = movie.poster_path
    ? `${IMAGE_BASE_W500}${movie.poster_path}`
    : "https://via.placeholder.com/500x750?text=No+Poster";

  // Normalise movie vs TV show field names
  const displayTitle = movie.title || movie.name || "Untitled";
  const displayTagline = movie.tagline || null;
  const displayReleaseDate = movie.release_date || movie.first_air_date || null;

  const castList = movie.credits?.cast || [];
  const topCast = castList.slice(0, 10);
  const director =
    movie.credits?.crew?.find((c) => c.job === "Director")?.name ||
    (isTv ? "N/A" : "N/A");
  const writer =
    movie.credits?.crew?.find(
      (c) => c.job === "Screenplay" || c.job === "Writer",
    )?.name || null;
  const studio =
    movie.production_companies && movie.production_companies.length > 0
      ? movie.production_companies[0].name
      : (isTv && movie.networks?.length > 0 ? movie.networks[0].name : null);

  const hours = Math.floor((movie.runtime || movie.episode_run_time?.[0] || 0) / 60);
  const minutes = (movie.runtime || movie.episode_run_time?.[0] || 0) % 60;
  const runtimeFormatted =
    (movie.runtime || movie.episode_run_time?.[0]) > 0
      ? `${hours}h ${minutes}m`
      : isTv
      ? `${movie.number_of_seasons || "?"} Season${(movie.number_of_seasons || 0) > 1 ? "s" : ""}`
      : "Runtime N/A";

  const numRating = movie.vote_average
    ? Number(movie.vote_average.toFixed(1))
    : 0;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
  const starCount = Math.round(numRating / 2);
  const releaseYear = displayReleaseDate
    ? displayReleaseDate.split("-")[0]
    : "N/A";

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
            <img className="md-poster" src={poster} alt={displayTitle} />
          </div>

          {/* Info Details */}
          <div className="md-info">
            <div className="md-eyebrow">
              <span className="md-eyebrow-year">{releaseYear}</span>
              <span className="md-eyebrow-line" />
              <span className="md-type-badge">{isTv ? "TV Series" : "Feature Film"}</span>
            </div>

            <h1 className="md-title">{displayTitle}</h1>
            {displayTagline && <p className="md-tagline">“{displayTagline}”</p>}

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
                    className={`md-star ${s <= starCount ? "" : "empty"}`}
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
              {movie.status && (
                <span className="md-meta-pill">{movie.status}</span>
              )}
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
                    isOverviewExpanded ? "expanded" : ""
                  }`}
                >
                  {movie.overview}
                </p>
                {movie.overview.length > 250 && (
                  <button
                    className="md-show-more"
                    onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                  >
                    {isOverviewExpanded ? "Show less" : "Read more"}
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
                  {displayReleaseDate || "N/A"}
                </div>
              </div>
            </div>

            {/* Action Buttons — Movie: Watch/Download/Trailer. TV: Select Episode/Trailer */}
            <div className="md-actions">
              {isTv ? (
                <button
                  className="md-btn-watch"
                  onClick={() => {
                    episodesRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  Select Episode & Stream
                </button>
              ) : (
                <>
                  <button
                    className="md-btn-watch"
                    onClick={() => {
                      if (isPlayerActive) {
                        playerRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      } else {
                        handleFetchSources("stream");
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                    {isPlayerActive ? "Jump to Player" : "Watch Movie (Stream)"}
                  </button>
                  <button
                    className="md-btn-download"
                    onClick={() => handleFetchSources("download")}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Sources
                  </button>
                </>
              )}
              <button className="md-btn-trailer" onClick={handleOpenTrailer}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Watch Trailer
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          BELOW HERO CONTENT: EPISODES (TV) / CAST & SIMILAR
          ============================================================ */}
      <div className="md-below">
        {/* ============================================================
            TV SHOW: 3-Step Funnel — Seasons → Episodes → Sources
            ============================================================ */}
        {isTv && tvSeasons.length > 0 && (
          <section ref={episodesRef} className="md-tv-section">

            {/* ── Step 1: Season Grid (shown when no season selected) ── */}
            {selectedSeason === null ? (
              <>
                <div className="md-section-heading">
                  <h2>Select a Season</h2>
                </div>
                <div className="md-season-grid">
                  {tvSeasons.map((season) => (
                    <button
                      key={season.season_number}
                      className="md-season-card"
                      onClick={() => setSelectedSeason(season.season_number)}
                    >
                      <span className="md-season-card-num">Season {season.season_number}</span>
                      <span className="md-season-card-eps">
                        {season.episode_count} episode{season.episode_count !== 1 ? "s" : ""}
                      </span>
                      {season.air_date && (
                        <span className="md-season-card-year">
                          {season.air_date.split("-")[0]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* ── Step 2: Episode List ── */}
                <div className="md-section-heading">
                  <button
                    className="md-back-btn"
                    onClick={() => {
                      setSelectedSeason(null);
                      setEpisodePanels({});
                      setEpisodes([]);
                    }}
                  >
                    ← Seasons
                  </button>
                  <h2>Season {selectedSeason}</h2>
                  {episodes.length > 0 && (
                    <span className="md-ep-count">{episodes.length} episodes</span>
                  )}
                </div>

                {episodesLoading ? (
                  <div className="md-spinner-wrap">
                    <div className="spinner" style={{ margin: "24px auto" }} />
                  </div>
                ) : (
                  <div className="md-episode-list">
                    {episodes.map((ep) => {
                      const panel = episodePanels[ep.id] || {};
                      const isOpen = !!panel.open;
                      return (
                        <div
                          key={ep.id}
                          className={`md-episode-row${isOpen ? " active" : ""}`}
                        >
                          {/* Episode header — click to toggle */}
                          <div
                            className="md-episode-header"
                            onClick={() => handleToggleEpisodePanel(ep)}
                          >
                            <div className="md-episode-info">
                              <span className="md-episode-num">
                                E{String(ep.episode_number).padStart(2, "0")}
                              </span>
                              <span className="md-episode-name">{ep.name}</span>
                              {ep.air_date && (
                                <span className="md-episode-year">
                                  {ep.air_date.split("-")[0]}
                                </span>
                              )}
                            </div>
                            <span className="md-episode-chevron">
                              {isOpen ? "▲" : "▼"}
                            </span>
                          </div>

                          {/* ── Step 3: Inline Source Panel ── */}
                          {isOpen && (
                            <div className="md-episode-panel">
                              {panel.loading ? (
                                <div className="md-ep-panel-loading">
                                  <div className="spinner" style={{ width: 20, height: 20 }} />
                                  <span>Finding sources…</span>
                                </div>
                              ) : !panel.sources || panel.sources.length === 0 ? (
                                <p className="md-ep-no-sources">
                                  No sources found for this episode.
                                </p>
                              ) : (
                                <div className="md-ep-source-list">
                                  {panel.sources.map((src, i) => {
                                    const quality = src.quality !== "Unknown" ? src.quality : null;
                                    const releaseYear = src.title?.match(/\b(19|20)\d{2}\b/)?.[0];
                                    const cleanName = (src.title || "Unknown Release")
                                      .replace(/\.(mkv|mp4|avi|x264|x265|BluRay|WEBRip|HDTV|WEB-DL|HEVC|H\.264|H\.265)\S*/gi, "")
                                      .trim();
                                    const magnetUri = src.magnet || src.link;
                                    return (
                                      <div key={i} className="md-ep-source-row">
                                        <div className="md-ep-source-info">
                                          {quality && (
                                            <span className="md-source-quality">{quality}</span>
                                          )}
                                          <span className="md-ep-source-name">{cleanName}</span>
                                          {releaseYear && (
                                            <span className="md-episode-year">· {releaseYear}</span>
                                          )}
                                        </div>
                                        <div className="md-ep-source-actions">
                                          <button
                                            className="md-source-btn"
                                            onClick={() =>
                                              handleStartStream(magnetUri, src.infoHash, src.torrentUrl || null)
                                            }
                                          >
                                            ▶ Stream
                                          </button>
                                          <a
                                            href={magnetUri}
                                            className="md-source-btn ghost"
                                          >
                                            🧲 Magnet
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Top Billed Cast */}
        {topCast.length > 0 && (
          <section className="md-cast-section">
            <div className="md-section-heading">
              <h2>Cast</h2>
            </div>
            <div className="md-cast-scroll">
              {topCast.map((person) => {
                const profileImg = person.profile_path
                  ? `${IMAGE_BASE_W300}${person.profile_path}`
                  : null;
                const initials = person.name
                  ? person.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                  : "?";

                return (
                  <div
                    key={person.id || person.credit_id}
                    className="md-cast-card"
                  >
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
                      {person.character || "Cast"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Embedded Video Player Section */}
        {isPlayerActive && (
          <section ref={playerRef} className="md-inline-player-section">
            <div className="md-inline-player-header">
              <div className="md-inline-player-title-wrap">
                <h3 className="md-inline-player-title">{displayTitle}</h3>
              </div>
              <div className="md-inline-player-controls">
                <button
                  className="md-player-action-btn"
                  onClick={() => handleFetchSources("stream")}
                  title="Switch stream source"
                >
                  Change Source
                </button>
              </div>
            </div>
            <div className="md-inline-player-wrapper">
              {/* Poster Breathing + Pulsing Play Aura Overlay */}
              <div
                className={`md-player-poster-overlay ${
                  isVideoReady ? "is-hidden" : ""
                }`}
                style={{
                  backgroundImage: `url(${poster})`,
                }}
              >
                {/* Dark/Light breathing tint layer */}
                <div className="md-poster-breathing-tint" />

                {/* Option B: Modern Pulsing Play Aura Loader */}
                <div className="md-player-loader-center">
                  <div className="md-aura-ring-pulse">
                    <div className="md-aura-inner-glow" />
                    <div className="md-aura-play-icon">
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <polygon points="6 3 20 12 6 21" />
                      </svg>
                    </div>
                  </div>
                  <div className="md-loader-label">
                    {streamLoading
                      ? "Connecting to swarm..."
                      : "Buffering stream..."}
                  </div>
                </div>
              </div>

              {activeStreamUrl && (
                <video
                  src={activeStreamUrl}
                  controls
                  autoPlay
                  playsInline
                  className="md-inline-video"
                  onCanPlay={() => setIsVideoReady(true)}
                  onPlaying={() => setIsVideoReady(true)}
                  onWaiting={() => setIsVideoReady(false)}
                />
              )}
            </div>
          </section>
        )}

        <div className="md-divider" />

        {/* Similar / Recommended Movies using unified MovieSection */}
        {recommendations.length > 0 && (
          <MovieSection
            id="similar-movies"
            title="More Like This"
            movies={recommendations}
            scrollable={true}
          />
        )}

        {/* Trending Movies */}
        {trending.length > 0 && (
          <MovieSection
            id="detail-trending-movies"
            title="Trending"
            movies={trending}
            scrollable={true}
          />
        )}

        {/* Top Rated Movies */}
        {topRated.length > 0 && (
          <MovieSection
            id="detail-top-rated-movies"
            title="Top Rated"
            movies={topRated}
            scrollable={true}
          />
        )}

        {/* Popular Movies */}
        {popular.length > 0 && (
          <MovieSection
            id="detail-popular-movies"
            title="Popular"
            movies={popular}
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
          className={`md-modal-overlay ${isModalClosing ? "closing" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className={`md-modal ${isModalClosing ? "closing" : ""}`}>
            <button className="md-modal-close" onClick={closeModal}>
              &times;
            </button>

            <div>
              <h3 className="md-modal-title">
                {activeModalType === "stream"
                  ? `Stream — ${isTv && selectedEpisode ? `${displayTitle} E${String(selectedEpisode.episode_number).padStart(2,"0")} · ${selectedEpisode.name}` : displayTitle}`
                  : `Download — ${isTv && selectedEpisode ? `${displayTitle} E${String(selectedEpisode.episode_number).padStart(2,"0")} · ${selectedEpisode.name}` : displayTitle}`}
              </h3>

              {/* Phase 1: Scraping sources */}
              {scraping && (
                <div className="md-spinner-wrap">
                  <div className="spinner" style={{ margin: "0 auto" }}></div>
                  <p>Looking for {displayTitle}...</p>
                </div>
              )}

              {/* Phase 2: Connecting to swarm */}
              {!scraping && streamLoading && (
                <div className="md-spinner-wrap">
                  <div className="spinner" style={{ margin: "0 auto" }}></div>
                  <p>Getting your {isTv ? "episode" : "movie"}...</p>
                </div>
              )}

              {!scraping &&
                !streamLoading &&
                (!sources || sources.length === 0) && (
                  <div className="md-no-sources">
                    No torrent/stream sources found. Make sure
                    your scraper backend is running.
                  </div>
                )}

              {!scraping && !streamLoading && sources && sources.length > 0 && (
                <div className="md-source-list">
                  {sources.map((src, index) => {
                    const quality =
                      src.quality !== "Unknown" ? src.quality : null;
                    const magnetUri = src.magnet || src.link;
                    // Extract just name + year from the title for display
                    const releaseYear = src.title
                      ? src.title.match(/\b(19|20)\d{2}\b/)?.[0]
                      : null;
                    const cleanName = src.title
                      ? src.title.replace(/\.(mkv|mp4|avi|x264|x265|BluRay|WEBRip|HDTV|WEB-DL|10bit|HEVC|AAC|AC3|DDP5|H\.264|H\.265)\S*/gi, "").trim()
                      : "Unknown Release";

                    return (
                      <div key={index} className="md-source-row">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="md-source-title">{cleanName}</div>
                          <div className="md-source-meta">
                            {quality && (
                              <span className="md-source-quality">
                                {quality}
                              </span>
                            )}
                            {releaseYear && <span>· {releaseYear}</span>}
                          </div>
                        </div>
                        {activeModalType === "stream" ? (
                          <button
                            className="md-source-btn"
                            onClick={() =>
                              handleStartStream(
                                magnetUri,
                                src.infoHash,
                                src.torrentUrl || null,
                              )
                            }
                          >
                            ▶ Stream
                          </button>
                        ) : (
                          <a href={magnetUri} className="md-source-btn ghost">
                            🧲 Magnet
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
