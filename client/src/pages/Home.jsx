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
} from "../services/api";

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [trendingTv, setTrendingTv] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [latest, setLatest] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [trendingData, trendingTvData, topData, latestData, upcomingData] =
          await Promise.all([
            fetchTrending(),
            fetchTrendingTv(),
            fetchTopRated(),
            fetchLatest(),
            fetchUpcoming(),
          ]);
        setTrending(trendingData);
        setTrendingTv(trendingTvData);
        setTopRated(topData);
        setLatest(latestData);
        setUpcoming(upcomingData);
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
      {/* Phase 2 — Cinematic Hero */}
      <HeroBanner movies={trending} />

      {/* Phase 3 — Spotlight cards (top 2 trending as landscape banners) */}
      <SpotlightRow movies={trending} />

      {/* Movie & TV sections */}
      <div className="home-sections">
        <MovieSection
          id="trending-section"
          title="Trending Now"
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
          title="Top Rated"
          movies={topRated}
          scrollable
        />
        <MovieSection
          id="latest-section"
          title="Latest Movies"
          movies={latest}
          scrollable
        />
        <MovieSection
          id="upcoming-section"
          title="Upcoming Releases"
          movies={upcoming}
          scrollable
        />
      </div>
    </div>
  );
}
