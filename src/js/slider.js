import { attachTrailerButton } from "./trailer.js";
export function startHeroSlider(movies) {
  let i = 0;

  const heroTitle = document.querySelector(".hero-title");
  const slideImage = document.querySelector(".slide-image");
  const shortDesc = document.querySelector(".shortDesc");
  const hero = document.querySelector(".detailsBtn");

  function updateSlide() {
    const movie = movies[i];

    heroTitle.textContent = movie.title;
    shortDesc.textContent =
      movie.overview.length > 150
        ? movie.overview.slice(
            0,
            movie.overview.slice(0, 147).lastIndexOf(" ")
          ) + " ..."
        : movie.overview;

    slideImage.src = movie.backdrop_path
      ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
      : `https://image.tmdb.org/t/p/w500${movie.poster_path}`;

    attachTrailerButton(
      document.querySelector(".slider-trailer-btn"),
      movie.id
    );

    i = (i + 1) % movies.length;
  }

  hero.addEventListener("click", () => {
    const currentIndex = i === 0 ? movies.length - 1 : i - 1;
    const currentMovie = movies[currentIndex];
    sessionStorage.setItem("movieId", currentMovie.id);
    window.location.href = "/src/features/movie-detail.html";
  });
  updateSlide();
  setInterval(updateSlide, 10000);
}
