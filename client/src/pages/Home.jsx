import React, { useEffect, useState } from "react";
import HeroBanner from "../components/HeroBanner";
import SpotlightRow from "../components/SpotlightRow";
import MovieSection from "../components/MovieSection";
import {
  fetchTrending,
  fetchTrendingTv,
  fetchTopRated,
  fetchLatest,
  fetchUpcoming,
  fetchMoviesByGenre,
  fetchTopRatedTv,
  fetchTvByGenre,
} from "../services/api";

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [trendingTv, setTrendingTv] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [latest, setLatest] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [actionMovies, setActionMovies] = useState([]);
  const [romanceMovies, setRomanceMovies] = useState([]);
  const [animationMovies, setAnimationMovies] = useState([]);
  const [horrorMovies, setHorrorMovies] = useState([]);

  // TV / Series states
  const [topRatedTv, setTopRatedTv] = useState([]);
  const [crimeTv, setCrimeTv] = useState([]);
  const [dramaTv, setDramaTv] = useState([]);
  const [sciFiTv, setSciFiTv] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [
          trendingData,
          trendingTvData,
          topData,
          latestData,
          upcomingData,
          actionData,
          romanceData,
          animationData,
          horrorData,
          topRatedTvData,
          crimeTvData,
          dramaTvData,
          sciFiTvData,
        ] = await Promise.all([
          fetchTrending(),
          fetchTrendingTv(),
          fetchTopRated(),
          fetchLatest(),
          fetchUpcoming(),
          fetchMoviesByGenre(28), // Action
          fetchMoviesByGenre(10749), // Romance
          fetchMoviesByGenre(16), // Animation
          fetchMoviesByGenre(27), // Horror
          fetchTopRatedTv(),
          fetchTvByGenre(80), // Crime (TV)
          fetchTvByGenre(18), // Drama (TV)
          fetchTvByGenre(10765), // Sci-Fi & Fantasy (TV)
        ]);
        setTrending(trendingData);
        setTrendingTv(trendingTvData);
        setTopRated(topData);
        setLatest(latestData);
        setUpcoming(upcomingData);
        setActionMovies(actionData);
        setRomanceMovies(romanceData);
        setAnimationMovies(animationData);
        setHorrorMovies(horrorData);
        setTopRatedTv(topRatedTvData);
        setCrimeTv(crimeTvData);
        setDramaTv(dramaTvData);
        setSciFiTv(sciFiTvData);
      } catch (err) {
        console.error("Error loading home data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div id="page-loader">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div id="home-content">
      {/* Phase 2 — Cinematic Hero: Alternating Movie > TV > Movie > TV */}
      <HeroBanner movies={trending} tvShows={trendingTv} />
      {/* Phase 3 — Spotlight cards: 1st movie as New Release, 1st TV show as Trending Series */}
      <SpotlightRow movies={trending} tvShows={trendingTv} />
      <div className="home-sections">
        <MovieSection
          id="trending-section"
          title="Movies Trending Now"
          movies={trending}
          scrollable
        />
        <MovieSection
          id="trending-tv-section"
          title="Trending TV Shows"
          movies={trendingTv}
          scrollable
          isTv={true}
        />
        <MovieSection
          id="top-rated-section"
          title="Top Rated Movies"
          movies={topRated}
          scrollable
        />
        <MovieSection
          id="top-series-section"
          title="Top Series"
          movies={topRatedTv}
          scrollable
          isTv={true}
        />
        <MovieSection
          id="latest-section"
          title="Latest Movies"
          movies={latest}
          scrollable
        />
        <MovieSection
          id="scifi-series-section"
          title="Sci-Fi Series"
          movies={sciFiTv}
          scrollable
          isTv={true}
        />
        <MovieSection
          id="action-movies-section"
          title="Action Movies"
          movies={actionMovies}
          scrollable
        />
        <MovieSection
          id="romance-movies-section"
          title="Romance Movies"
          movies={romanceMovies}
          scrollable
        />
        <MovieSection
          id="animation-movies-section"
          title="Animation Movies"
          movies={animationMovies}
          scrollable
        />
        <MovieSection
          id="horror-movies-section"
          title="Horror Movies"
          movies={horrorMovies}
          scrollable
        />
        <MovieSection
          id="crime-series-section"
          title="Crime Series"
          movies={crimeTv}
          scrollable
          isTv={true}
        />
        <MovieSection
          id="drama-series-section"
          title="Drama Series"
          movies={dramaTv}
          scrollable
          isTv={true}
        />
      </div>
    </div>
  );
}
