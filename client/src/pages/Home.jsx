import React, { useEffect, useState } from 'react';
import HeroBanner from '../components/HeroBanner';
import MovieSection from '../components/MovieSection';
import { fetchTrending, fetchTopRated, fetchLatest, fetchUpcoming } from '../services/api';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [latest, setLatest] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [trendingData, topData, latestData, upcomingData] = await Promise.all([
          fetchTrending(),
          fetchTopRated(),
          fetchLatest(),
          fetchUpcoming(),
        ]);
        setTrending(trendingData);
        setTopRated(topData);
        setLatest(latestData);
        setUpcoming(upcomingData);
      } catch (err) {
        console.error('Error loading home data:', err);
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
      <HeroBanner movies={trending} />
      <div style={{ padding: '20px 0' }}>
        <MovieSection id="trending-section" title="Trending Now" movies={trending} scrollable />
        <MovieSection id="top-rated-section" title="Top Rated" movies={topRated} scrollable />
        <MovieSection id="latest-section" title="Latest Movies" movies={latest} scrollable />
        <MovieSection id="upcoming-section" title="Upcoming Releases" movies={upcoming} scrollable />
      </div>
    </div>
  );
}
