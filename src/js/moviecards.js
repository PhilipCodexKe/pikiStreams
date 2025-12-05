export function createMovieCard(movie, isClickable = true) {
  const GENRES = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Science Fiction",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
  };

  const genres = movie.genre_ids
    .map((id) => GENRES[id])
    .slice(0, 2)
    .join(", ");

  const poster = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "poster.jpg";

  const year = movie.release_date ? movie.release_date.split("-")[0] : "N/A";

  const card = document.createElement("article");
  card.classList.add("movie-card");
  card.dataset.id = movie.id; // store movie ID in a data attribute

  card.innerHTML = `
    <div class="poster-wrap">
      <img class="poster" src="${poster}" alt="${movie.title}" />
      <span class="rating-badge">${movie.vote_average.toFixed(1)}</span>
    </div>
    <div class="card-body">
      <h3 class="movie-title">${movie.title}</h3>
      <span class="genre">${genres}</span>
      <span class="year" style="display:block; font-size: 0.85rem; color: #9aa3ad; margin-top: 4px;">${year}</span>
    </div>
  `;

  if (isClickable) {
    card.addEventListener("click", () => {
      sessionStorage.removeItem("recommendedMovieId");
      sessionStorage.setItem("movieId", movie.id);
      // Navigate to detail page
      window.location.href = "/src/features/movie-detail.html";
    });
  } else {
    card.classList.add("unclickable");
  }

  return card;
}
