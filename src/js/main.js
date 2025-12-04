import { getMovies, searchMovies, TRENDING_URL, TOP_RATED_URL, LATEST_URL } from "./api.js";
import { createMovieCard } from "./moviecards.js";
import { startHeroSlider } from "./slider.js";

function putMovies(movies, container) {
  container.innerHTML = "";
  movies.forEach((movie) => container.appendChild(createMovieCard(movie)));
}

async function loadHomepage() {
  const trendingContainer = document.querySelector("#trending-movies");
  const topRatedContainer = document.querySelector("#top-rated-movies");
  const latestContainer = document.querySelector("#latest-movies");

  const trending = await getMovies(TRENDING_URL);
  putMovies(trending, trendingContainer);
  startHeroSlider(trending);

  const topRated = await getMovies(TOP_RATED_URL);
  putMovies(topRated, topRatedContainer);

  const latest = await getMovies(LATEST_URL);
  putMovies(latest, latestContainer);
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

searchInput.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();

    if (query) {
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
