import { getMovieDetails, getTrailers, API_KEY, LATEST_URL } from "../js/api.js";

let movieId = sessionStorage.getItem("recommendedMovieId");

if (!movieId) {
  movieId = sessionStorage.getItem("movieId");
}
if (movieId) {
  // Update URL after loading
  const newAddress = `movie-detail.html?id=${movieId}`;
  window.history.replaceState(null, "", newAddress);
  loadMovie(movieId);
  loadRecommendations(movieId);
  loadLatestMovies();
} else {
  console.error("No movie ID found");
}

// Scroll Buttons Logic
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

async function loadRecommendations(movieId) {
  const url = `https://api.themoviedb.org/3/movie/${movieId}/recommendations?api_key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  // Populate OLD overlay container (2 movies - hidden on mobile)
  const container = document.querySelector(".movie-card");
  container.innerHTML = "";

  data.results.slice(0, 2).forEach((movie) => {
    const img = movie.poster_path
      ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
      : "no-poster.jpg";

    const card = document.createElement("div");
    card.classList.add("rec-card");

    card.innerHTML = `
      <img src="${img}" />
    `;

    card.addEventListener("click", () => {
      sessionStorage.setItem("recommendedMovieId", movie.id);
      window.location.href = "/src/features/movie-detail.html";
    });

    container.appendChild(card);
  });

  // Populate NEW similar movies section (ALL movies)
  const similarContainer = document.getElementById("similarMoviesContainer");
  if (similarContainer) {
    similarContainer.innerHTML = "";

    data.results.forEach((movie) => {
      const img = movie.poster_path
        ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
        : "no-poster.jpg";

      const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
      const year = movie.release_date ? movie.release_date.split("-")[0] : "";
      // Runtime is not available in recommendations API, using placeholder
      const runtime = "~120m"; // Typical movie length

      const card = document.createElement("div");
      card.classList.add("rec-card");

      card.innerHTML = `
        <img src="${img}" alt="${movie.title}" />
        <div class="rec-info">
          <h4>${movie.title}</h4>
          <div class="rec-meta">
            <span class="rec-rating">⭐ ${rating}</span>
            ${year ? `<span class="rec-year">${year}</span>` : ""}
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        sessionStorage.setItem("recommendedMovieId", movie.id);
        window.location.href = "/src/features/movie-detail.html";
      });

      similarContainer.appendChild(card);
    });
  }
}

// LOAD LATEST MOVIES
async function loadLatestMovies() {
  const res = await fetch(LATEST_URL);
  const data = await res.json();

  const latestContainer = document.getElementById("latestMoviesContainer");
  if (latestContainer) {
    latestContainer.innerHTML = "";

    data.results.forEach((movie) => {
      const img = movie.poster_path
        ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
        : "no-poster.jpg";

      const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
      const year = movie.release_date ? movie.release_date.split("-")[0] : "";

      const card = document.createElement("div");
      card.classList.add("rec-card");

      card.innerHTML = `
        <img src="${img}" alt="${movie.title}" />
        <div class="rec-info">
          <h4>${movie.title}</h4>
          <div class="rec-meta">
            <span class="rec-rating">⭐ ${rating}</span>
            ${year ? `<span class="rec-year">${year}</span>` : ""}
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        sessionStorage.setItem("recommendedMovieId", movie.id);
        window.location.href = "/src/features/movie-detail.html";
      });

      latestContainer.appendChild(card);
    });
  }
}

// MAIN LOADER
async function loadMovie(id) {
  try {
    const movie = await getMovieDetails(id);
    const trailers = await getTrailers(id);

    if (!movie) throw new Error("Movie not found");

    fillMovieDetails(movie, trailers);
    loadMagnetLinks(movie.title);
  } catch (err) {
    console.error(err);
    document.body.innerHTML =
      "<p>Could not load movie details. Try again later.</p>";
  }
}

// FILL HTML CONTENT
function fillMovieDetails(movie, trailers) {
  // ---- BACKDROP ----
  const backdrop = movie.backdrop_path
    ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
    : "";

  document.querySelector(".backdrop img").src = backdrop;

  // ---- STORE PLAYER BANNER ----
  const banner = document.querySelector(".store-player-banner");
  if (banner) {
    banner.style.backgroundImage = `url('${backdrop}')`;
  }

  // ---- POSTER ----
  const poster = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "poster.jpg";

  document.querySelector(".poster img").src = poster;

  // ---- TITLE ----
  document.querySelector(".title").textContent = `${movie.title} (${new Date(
    movie.release_date
  ).getFullYear()})`;

  // ---- META ----
  const genres = movie.genres.map((g) => g.name).join(" • ");
  const rating = movie.vote_average.toFixed(1);
  const runtime = movie.runtime ? `${movie.runtime}m` : "";

  document.querySelector(
    ".meta"
  ).textContent = `${runtime} • ${genres} • ${rating} Rating`;

  // ---- OVERVIEW ----
  document.querySelector(".overview").textContent = movie.overview;

  // ---- TRAILER ----
  const trailerKey = trailers?.length ? trailers[0].key : null;

  if (trailerKey) {
    const trailerBtn = document.querySelector(".btn-primary");
    const playerSection = document.querySelector(".media-player-section");
    const banner = document.querySelector(".store-player-banner");
    const playBtn = document.querySelector(".store-play-btn");

    // Helper to load player
    const loadInlinePlayer = () => {
      if (banner) {
        banner.innerHTML = `
          <iframe 
            width="100%" 
            height="100%" 
            src="https://www.youtube.com/embed/${trailerKey}?autoplay=1" 
            title="YouTube video player" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
          </iframe>
        `;
      }
    };

    // Watch Trailer Button - Smooth Scroll ONLY
    trailerBtn.addEventListener("click", () => {
      if (playerSection) {
        playerSection.scrollIntoView({ behavior: "smooth" });
        // loadInlinePlayer(); // Removed auto-play
      }
    });

    // Banner Play Button - Trigger Play
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        loadInlinePlayer();
      });
    }
  }

  // ---- CAST ----
  const castContainer = document.querySelector(".cast-scroll");
  castContainer.innerHTML = "";

  movie.credits.cast.slice(0, 10).forEach((actor) => {
    const img = actor.profile_path
      ? `https://image.tmdb.org/t/p/w200${actor.profile_path}`
      : "cast.jpg";

    castContainer.innerHTML += `
      <div class="cast-card">
        <img src="${img}" alt="${actor.name}" />
        <p class="cast-name">${actor.name}</p>
        <p class="cast-role">as ${actor.character}</p>
      </div>
    `;
  });

  const list = document.querySelector(".details-section ul");

  list.innerHTML = `
    <li><strong>Status:</strong> ${movie.status}</li>
    <li><strong>Language:</strong> ${movie.original_language.toUpperCase()}</li>
    <li><strong>Budget:</strong> $${movie.budget.toLocaleString()}</li>
    <li><strong>Revenue:</strong> $${movie.revenue.toLocaleString()}</li>
  `;
}

async function loadMagnetLinks(title) {
  const container = document.querySelector(".movie-info");
  const downloadSection = document.createElement("div");
  downloadSection.className = "download-section";
  downloadSection.innerHTML = "<h3>Searching for Download Links...</h3>";
  container.appendChild(downloadSection);

  try {
    // Check Session Storage
    const storageKey = `magnets_${title}`;
    const cachedData = sessionStorage.getItem(storageKey);

    if (cachedData) {
      console.log('Using cached magnet links');
      const data = JSON.parse(cachedData);
      displayDownloadOptions(data, title, downloadSection);
      injectStreamButton(data, title);
      return;
    }

    // Fetch if not cached
    const res = await fetch(`http://localhost:3000/api/scrape/${encodeURIComponent(title)}`);
    const data = await res.json();

    if (data.success && data.data.length > 0) {
      // Save to Session Storage
      sessionStorage.setItem(storageKey, JSON.stringify(data.data));
      displayDownloadOptions(data.data, title, downloadSection);
      injectStreamButton(data.data, title);
    } else {
      downloadSection.innerHTML = "<h3>No links found</h3>";
    }
  } catch (error) {
    console.error("Error fetching magnets:", error);
    downloadSection.innerHTML = "<h3>Error loading links</h3>";
  }
}

function injectStreamButton(magnets, title) {
  const actionsContainer = document.querySelector(".actions");
  if (!actionsContainer || document.querySelector(".btn-stream")) return;

  const streamBtn = document.createElement("button");
  streamBtn.className = "btn-secondary btn-stream";
   streamBtn.innerHTML = "▶ Stream Now";

  // Insert after Trailer button
  const trailerBtn = actionsContainer.querySelector(".btn-primary");
  if (trailerBtn) {
    trailerBtn.parentNode.insertBefore(streamBtn, trailerBtn.nextSibling);
  } else {
    actionsContainer.appendChild(streamBtn);
  }

  streamBtn.addEventListener("click", () => {
    const sortedMagnets = getSortedMagnets(magnets);
    if (sortedMagnets.length > 0) {
      openVideoPlayer(sortedMagnets[0].link, title, sortedMagnets);
    } else {
      alert("No suitable stream found.");
    }
  });
}

function getSortedMagnets(magnets) {
  // Helper to parse size string to MB
  const parseSize = (sizeStr) => {
    if (!sizeStr || sizeStr === 'Unknown') return Infinity;
    const match = sizeStr.match(/([\d\.]+)\s*([GM]B)/i);
    if (!match) return Infinity;
    let val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit.includes('G')) val *= 1024;
    return val;
  };

  // Sort by: 1. 720p (priority), 2. Size (ascending)
  return [...magnets].sort((a, b) => {
      const isA720 = a.quality === '720p';
      const isB720 = b.quality === '720p';

      if (isA720 && !isB720) return -1;
      if (!isA720 && isB720) return 1;

      return parseSize(a.size) - parseSize(b.size);
  });
}

function selectBestMagnet(magnets) {
    const sorted = getSortedMagnets(magnets);
    return sorted[0];
}

import { CustomVideoPlayer } from "../js/player.js";

// Inject Player CSS dynamically
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '../css/player.css';
document.head.appendChild(link);

function openVideoPlayer(magnet, title, allMagnets = []) {
  // Encode title for query param
  const encodedTitle = encodeURIComponent(title);
  const streamUrl = `http://localhost:3001/stream/${encodeURIComponent(magnet)}?title=${encodedTitle}`;
  
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "black";
  overlay.style.zIndex = "10000";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";

  // Container for Custom Player
  const playerContainer = document.createElement("div");
  playerContainer.style.width = "100%";
  playerContainer.style.height = "100%";
  overlay.appendChild(playerContainer);

  document.body.appendChild(overlay);

  const closePlayer = () => {
      document.body.removeChild(overlay);
  };

  // Initialize Custom Player
  const player = new CustomVideoPlayer(playerContainer, streamUrl, title, closePlayer);

  // Error Handling & Retry Logic (Listen to custom event from player)
  playerContainer.addEventListener("videoerror", (e) => {
    console.error("Video Error:", e.detail);
    
    // Show loading/error message in the container
    playerContainer.innerHTML = `
        <div style="color:white; text-align:center;">
            <h3>Stream failed or rejected.</h3>
            <p>Trying next source...</p>
        </div>
    `;
    
    // Find current magnet index
    const currentIndex = allMagnets.findIndex(m => m.link === magnet);
    
    // Try next magnet if available
    if (currentIndex !== -1 && currentIndex < allMagnets.length - 1) {
        const nextMagnet = allMagnets[currentIndex + 1];
        console.log("Retrying with next magnet:", nextMagnet.title);
        
        setTimeout(() => {
            document.body.removeChild(overlay);
            openVideoPlayer(nextMagnet.link, title, allMagnets);
        }, 1500);
    } else {
        playerContainer.innerHTML = `
            <div style="color:white; text-align:center;">
                <h3>No suitable streams found.</h3>
                <button class="btn-primary" onclick="document.body.removeChild(this.closest('div').parentNode.parentNode)">Close</button>
            </div>
        `;
    }
  });
}

function displayDownloadOptions(links, title, container) {
  container.innerHTML = ""; // Clear loading text

  // Action Buttons Container
  const btnContainer = document.createElement("div");
  btnContainer.className = "download-actions-container";

  // Download Button
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn btn-primary";
  downloadBtn.textContent = "Download Movie";
  
  // Stream Button
  const streamBtn = document.createElement("button");
  streamBtn.className = "btn btn-secondary btn-stream";
  streamBtn.textContent = "Stream Movie";

  btnContainer.appendChild(downloadBtn);
  btnContainer.appendChild(streamBtn);
  container.appendChild(btnContainer);

  // Create Modal (Reused for both)
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "download-modal-overlay";
  
  const modalContent = document.createElement("div");
  modalContent.className = "download-modal";
  
  modalContent.innerHTML = `
    <button class="close-modal-btn">&times;</button>
    <h3 id="modal-title">Options for "${title}"</h3>
    <div class="magnet-list"></div>
    <div id="player-container" style="display:none; width:100%; height:400px; background:#000;"></div>
  `;

  const list = modalContent.querySelector(".magnet-list");
  const modalTitle = modalContent.querySelector("#modal-title");
  const playerContainer = modalContent.querySelector("#player-container");

  // Helper to populate list
  const populateList = (isStream) => {
      list.innerHTML = "";
      playerContainer.style.display = "none";
      playerContainer.innerHTML = "";
      list.style.display = "block";
      modalTitle.textContent = isStream ? `Stream "${title}"` : `Download "${title}"`;

      links.forEach(link => {
        const btn = document.createElement("a");
        if (!isStream) {
            btn.href = link.link; // Direct magnet link for download
        }
        btn.className = "btn-secondary magnet-btn";

        const quality = link.quality !== 'Unknown' ? link.quality : '';
        const size = link.size !== 'Unknown' ? link.size : '';
        const meta = [quality, size].filter(Boolean).join(' • ');

        btn.innerHTML = `
            <span style="font-weight: bold;">${link.title}</span>
            <span style="color: #aaa; margin-left: 10px;">${meta}</span>
        `;

        if (isStream) {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                startStream(link.link, playerContainer, list, title);
            });
        }

        list.appendChild(btn);
      });
  };

  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Event Listeners
  downloadBtn.addEventListener("click", () => {
    populateList(false);
    modalOverlay.classList.add("active");
  });

  streamBtn.addEventListener("click", () => {
    populateList(true);
    modalOverlay.classList.add("active");
  });

  const closeBtn = modalContent.querySelector(".close-modal-btn");
  closeBtn.addEventListener("click", () => {
    modalOverlay.classList.remove("active");
    playerContainer.innerHTML = ""; // Stop video
  });

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove("active");
      playerContainer.innerHTML = ""; // Stop video
    }
  });
}

function startStream(magnetURI, playerContainer, listContainer, title) {
    listContainer.style.display = "none";
    playerContainer.style.display = "block";

    // Encode title for query param (important for strict matching on server)
    const encodedTitle = encodeURIComponent(title);
    const streamUrl = `http://localhost:3001/stream/${encodeURIComponent(magnetURI)}?title=${encodedTitle}`;
    
    // Clear previous content
    playerContainer.innerHTML = '';

    const onClose = () => {
        playerContainer.style.display = "none";
        playerContainer.innerHTML = ""; // Kill video instance
        listContainer.style.display = "block";
    };

    // Initialize Custom Player
    new CustomVideoPlayer(playerContainer, streamUrl, title, onClose);
}
