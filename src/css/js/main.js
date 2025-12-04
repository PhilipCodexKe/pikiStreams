const API_KEY = "ab060bf4b27b23c908e05859d2ef7451";

let movies;
async function getTrending(movies) {
  const trendingRes = await fetch(
    "https://api.themoviedb.org/3/trending/movie/week?api_key=ab060bf4b27b23c908e05859d2ef7451"
  );
  console.log(trendingRes);
}
