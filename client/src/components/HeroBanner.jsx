import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  IMAGE_BASE_ORIGINAL,
  IMAGE_BASE_W500,
  GENRES,
  fetchTrailers,
} from "../services/api";
import TrailerModal from "./TrailerModal";

/* ─── helpers ─────────────────────────────────────────── */
function getYear(item) {
  const dateStr = item.release_date || item.first_air_date;
  return dateStr ? dateStr.split("-")[0] : "";
}

function getGenres(item) {
  return (item.genre_ids || [])
    .map((id) => GENRES[id])
    .filter(Boolean)
    .slice(0, 3);
}

/** Split title: first word gets white style, rest get gradient. */
function splitTitle(title = "") {
  const words = title.split(" ");
  if (words.length < 2) return { main: title, sub: "" };
  return { main: words[0], sub: words.slice(1).join(" ") };
}

/** Build a ★ row — filled up to Math.round(score/2), empty for the rest */
function StarRow({ score }) {
  const filled = Math.round((score || 0) / 2); // out of 5
  return (
    <div className="hero-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`hero-star${i < filled ? "" : " empty"}`}>
          ★
        </span>
      ))}
    </div>
  );
}

/* ─── component ────────────────────────────────────────── */
export default function HeroBanner({ movies = [], tvShows = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [fading, setFading] = useState(false);
  const navigate = useNavigate();

  // Interleave Movie -> TV -> Movie -> TV (total 4 items)
  const heroItems = [];
  const maxLen = Math.max(movies.length, tvShows.length);
  for (let i = 0; i < maxLen && heroItems.length < 4; i++) {
    if (movies[i]) heroItems.push({ ...movies[i], media_type: "movie" });
    if (heroItems.length < 4 && tvShows[i])
      heroItems.push({ ...tvShows[i], media_type: "tv" });
  }

  const currentItem = heroItems[currentIndex];

  /* Auto-rotate every 8 s with a quick fade transition */
  useEffect(() => {
    if (heroItems.length === 0) return;
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % heroItems.length);
        setFading(false);
      }, 400);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroItems.length]);

  if (!currentItem) return null;

  const isTv =
    currentItem.media_type === "tv" || Boolean(currentItem.first_air_date);
  const title = currentItem.title || currentItem.name || "";
  const linkUrl = isTv ? `/tv/${currentItem.id}` : `/movie/${currentItem.id}`;

  /* Derived data */
  const backdropUrl = currentItem.backdrop_path
    ? `${IMAGE_BASE_ORIGINAL}${currentItem.backdrop_path}`
    : "";

  const posterUrl = (item) =>
    item.poster_path
      ? `${IMAGE_BASE_W500}${item.poster_path}`
      : "https://via.placeholder.com/92x138?text=?";

  const rating = currentItem.vote_average
    ? currentItem.vote_average.toFixed(1)
    : "N/A";
  const voteCount = currentItem.vote_count
    ? currentItem.vote_count.toLocaleString()
    : "—";
  const year = getYear(currentItem);
  const genres = getGenres(currentItem);
  const { main: titleMain, sub: titleSub } = splitTitle(title);

  /* Switch slide */
  const switchTo = (idx) => {
    if (idx === currentIndex) return;
    setFading(true);
    setTimeout(() => {
      setCurrentIndex(idx);
      setFading(false);
    }, 300);
  };

  /* Trailer */
  const handleWatchTrailer = async () => {
    try {
      const trailers = await fetchTrailers(currentItem.id, isTv);
      const official =
        trailers.find((t) => t.type === "Trailer" && t.site === "YouTube") ||
        trailers[0];
      setTrailerKey(official ? official.key : null);
    } catch {
      setTrailerKey(null);
    }
    setIsTrailerOpen(true);
  };

  return (
    <>
      <section className="hero">
        {/* ── Background image ── */}
        <div
          className={`hero-bg${fading ? " hero-fading" : ""}`}
          style={{
            backgroundImage: backdropUrl ? `url(${backdropUrl})` : undefined,
          }}
        />

        {/* ── Decorative layers ── */}
        <div className="hero-purple-glow" />
        <div className="hero-gradient" />
        <div className="hero-accent-line" />

        {/* ── Main content ── */}
        <div className={`hero-content${fading ? " hero-fading" : ""}`}>
          {/* Mobile Poster (shown on compact/phone view up top) */}
          <div className="hero-mobile-poster">
            <img src={posterUrl(currentItem)} alt={title} />
          </div>

          {/* Eyebrow row */}
          <div className="hero-eyebrow">
            <span className="hero-rank">
              #{currentIndex + 1} Trending This Week
            </span>
            <div className="hero-eyebrow-line" />
            <span className="hero-type-badge">
              {isTv ? "TV Series" : "Movie"}
            </span>
          </div>

          {/* Title */}
          <h1 className="hero-title">
            <span className="hero-title-main">{titleMain}</span>
            {titleSub && <span className="hero-title-sub"> {titleSub}</span>}
          </h1>

          {/* Rating row */}
          <div className="hero-rating-row">
            <div className="hero-imdb-score">
              <span className="score-num">{rating}</span>
            </div>
            <StarRow score={parseFloat(rating)} />
            {voteCount !== "—" && (
              <span className="hero-vote-count">{voteCount} ratings</span>
            )}
          </div>

          {/* Genre / year tags */}
          <div className="hero-tags">
            {genres.map((g) => (
              <span key={g} className="hero-tag">
                {g}
              </span>
            ))}
            {year && <span className="hero-tag">{year}</span>}
          </div>

          {/* Overview */}
          <p className="hero-desc">
            {currentItem.overview
              ? `${currentItem.overview.slice(0, 200)}${currentItem.overview.length > 200 ? "…" : ""}`
              : ""}
          </p>

          {/* Actions */}
          <div className="hero-actions">
            <button
              className="btn-hero-watch"
              onClick={() => navigate(linkUrl)}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Watch Now
            </button>

            <button className="btn-hero-trailer" onClick={handleWatchTrailer}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Trailer
            </button>
          </div>
        </div>

        {/* ── Thumbnail strip (right) ── */}
        <div className="hero-thumbnails">
          {heroItems.map((m, i) => (
            <div
              key={`${m.id}-${m.media_type || "item"}`}
              className={`hero-thumb${i === currentIndex ? " active" : ""}`}
              onClick={() => switchTo(i)}
              role="button"
              aria-label={m.title || m.name}
            >
              <img src={posterUrl(m)} alt={m.title || m.name} loading="lazy" />
            </div>
          ))}
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
