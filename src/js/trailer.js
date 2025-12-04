// trailer.js
import { getTrailers } from "./api.js";

// Select modal elements
const modal = document.getElementById("trailerModal");
const iframe = document.getElementById("trailerIframe");
const closeEls = modal.querySelectorAll("[data-close]");
const backdrop = modal.querySelector(".trailer-backdrop");

// Open modal with a YouTube key
export function openTrailer(youtubeKey) {
  if (!youtubeKey) return console.error("No YouTube key provided");
  iframe.src = `https://www.youtube.com/embed/${youtubeKey}?autoplay=1`;
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

// Close modal
export function closeTrailer() {
  iframe.src = "";
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

// Setup modal close listeners (run once)
closeEls.forEach((el) => el.addEventListener("click", closeTrailer));
backdrop.addEventListener("click", closeTrailer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTrailer();
});

export function attachTrailerButton(button, movieId) {
  button.addEventListener("click", async () => {
    try {
      const videos = await getTrailers(movieId);
      const trailer = videos.find(
        (v) => v.type === "Trailer" && v.site === "YouTube"
      );
      if (!trailer) return console.log("No trailer found");
      openTrailer(trailer.key);
    } catch (err) {
      console.error("Failed to fetch trailer:", err);
    }
  });
}
