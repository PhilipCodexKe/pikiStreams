import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import MovieDetail from './pages/MovieDetail';

// Import all existing styles
import './styles/index.css';
import './styles/header.css';
import './styles/header-response.css';
import './styles/main-index-response.css';
import './styles/loader.css';
import './styles/trailer.css';
import './styles/movie-card.css';
import './styles/movie-card-response.css';
import './styles/player.css';

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
      </Routes>
    </div>
  );
}
