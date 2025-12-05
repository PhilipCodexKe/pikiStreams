import { getMovies, searchMovies, TRENDING_URL, TOP_RATED_URL, LATEST_URL, UPCOMING_URL } from "./api.js";
import { createMovieCard } from "./moviecards.js";
import { startHeroSlider } from "./slider.js";

function putMovies(movies, container, isClickable = true) {
  container.innerHTML = "";
  movies.forEach((movie) => container.appendChild(createMovieCard(movie, isClickable)));
}

async function loadHomepage() {
  const trendingContainer = document.querySelector("#trending-movies");
  const topRatedContainer = document.querySelector("#top-rated-movies");
  const latestContainer = document.querySelector("#latest-movies");
  const upcomingContainer = document.querySelector("#upcoming-movies");

  const trending = await getMovies(TRENDING_URL);
  putMovies(trending, trendingContainer);
  startHeroSlider(trending);

  const topRated = await getMovies(TOP_RATED_URL);
  putMovies(topRated, topRatedContainer);

  const latest = await getMovies(LATEST_URL);
  putMovies(latest, latestContainer);

  const upcoming = await getMovies(UPCOMING_URL);
  putMovies(upcoming, upcomingContainer, false);

  // Hide loader
  const loader = document.getElementById("page-loader");
  if (loader) {
    loader.classList.add("hidden");
  }
}

const scrollBtns = document.querySelectorAll(".scroll-right, .scroll-left");

scrollBtns.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const targetId = btn.dataset.target;
    const container = document.getElementById(targetId);

    if (!container) return;

    const scrllAmnt = 600;
    if (btn.classList.contains("scroll-left")) {
      container.scrollBy({ left: -scrllAmnt, behavior: "smooth" });
    } else {
      container.scrollBy({ left: scrllAmnt, behavior: "smooth" });
    }
  });
});

loadHomepage();

const searchInput = document.getElementById("search-input");
const homeContent = document.getElementById("home-content");
const searchResults = document.getElementById("search-results");
const searchSuggestions = document.getElementById("search-suggestions");

// Debounce utility function
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// Render search suggestions
function renderSuggestions(movies) {
  if (!movies || movies.length === 0) {
    searchSuggestions.innerHTML = '<div class="no-suggestions">No movies found</div>';
    searchSuggestions.classList.add("active");
    return;
  }

  const suggestionsHTML = movies
    .slice(0, 6)
    .map((movie) => {
      const poster = movie.poster_path
        ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
        : "poster.jpg";
      const year = movie.release_date ? movie.release_date.split("-")[0] : "N/A";
      const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";

      return `
        <div class="suggestion-item" data-movie-id="${movie.id}">
          <img src="${poster}" alt="${movie.title}" class="suggestion-poster" />
          <div class="suggestion-info">
            <h4 class="suggestion-title">${movie.title}</h4>
            <div class="suggestion-meta">
              <span class="suggestion-year">${year}</span>
              <span class="suggestion-rating">${rating}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  searchSuggestions.innerHTML = suggestionsHTML;
  searchSuggestions.classList.add("active");

  // Add click handlers to suggestions
  document.querySelectorAll(".suggestion-item").forEach((item) => {
    item.addEventListener("click", () => {
      const movieId = item.dataset.movieId;
      sessionStorage.removeItem("recommendedMovieId");
      sessionStorage.setItem("movieId", movieId);
      window.location.href = "/src/features/movie-detail.html";
    });
  });
}

// Hide suggestions
function hideSuggestions() {
  searchSuggestions.classList.remove("active");
}

// Fetch and display suggestions
const fetchSuggestions = debounce(async (query) => {
  if (!query || query.trim().length < 2) {
    hideSuggestions();
    return;
  }

  const movies = await searchMovies(query);
  const filteredMovies = movies.filter((movie) => movie.poster_path);
  renderSuggestions(filteredMovies);
}, 300);

// Input event for suggestions
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  fetchSuggestions(query);
});

// Enter key for full search
searchInput.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();

    if (query) {
      hideSuggestions();
      homeContent.style.display = "none";
      searchResults.style.display = "grid";
      searchResults.innerHTML = ""; // Clear previous results

      const movies = await searchMovies(query);
      const filteredMovies = movies.filter((movie) => movie.poster_path);
      putMovies(filteredMovies, searchResults);
    } else {
      homeContent.style.display = "block";
      searchResults.style.display = "none";
    }
  }
});

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
    hideSuggestions();
  }
});
