export class CustomVideoPlayer {
    constructor(container, videoSrc, title, onClose) {
        this.container = container;
        this.videoSrc = videoSrc;
        this.title = title;
        this.onClose = onClose;
        
        this.render();
        this.initElements();
        this.addEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="custom-video-wrapper paused loading" tabindex="0">
                <video src="${this.videoSrc}" autoplay></video>
                
                <div class="video-loader"></div>
                
                <div class="big-play-btn">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>

                <div class="video-controls">
                    <div class="progress-container">
                        <div class="progress-filled"></div>
                    </div>
                    
                    <div class="controls-row">
                        <div class="left-controls">
                            <button class="control-btn play-btn" title="Play/Pause">
                                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </button>
                            
                            <div class="volume-wrapper">
                                <div class="volume-container">
                                    <input type="range" class="volume-slider" min="0" max="1" step="0.05" value="1">
                                </div>
                                <button class="control-btn volume-btn" title="Mute/Unmute">
                                    <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                                </button>
                            </div>

                            <div class="time-display">0:00 / 0:00</div>
                            <div style="color:white; font-weight:bold; margin-left:15px;">${this.title}</div>
                        </div>

                        <div class="right-controls">
                            <button class="control-btn fullscreen-btn" title="Fullscreen">
                                <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                            </button>
                            <button class="control-btn close-btn" title="Close">
                                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    initElements() {
        this.wrapper = this.container.querySelector('.custom-video-wrapper');
        this.video = this.wrapper.querySelector('video');
        this.playBtn = this.wrapper.querySelector('.play-btn');
        this.bigPlayBtn = this.wrapper.querySelector('.big-play-btn');
        this.progressContainer = this.wrapper.querySelector('.progress-container');
        this.progressFilled = this.wrapper.querySelector('.progress-filled');
        this.volumeSlider = this.wrapper.querySelector('.volume-slider');
        this.volumeBtn = this.wrapper.querySelector('.volume-btn');
        this.fullscreenBtn = this.wrapper.querySelector('.fullscreen-btn');
        this.closeBtn = this.wrapper.querySelector('.close-btn');
        this.timeDisplay = this.wrapper.querySelector('.time-display');

        // Focus wrapper for keyboard events
        this.wrapper.focus();
    }

    addEventListeners() {
        // Play/Pause
        const togglePlay = () => {
            if (this.video.paused) {
                this.video.play();
            } else {
                this.video.pause();
            }
        };

        this.video.addEventListener('click', togglePlay);
        this.playBtn.addEventListener('click', togglePlay);
        this.bigPlayBtn.addEventListener('click', togglePlay);

        this.video.addEventListener('play', () => {
            this.wrapper.classList.remove('paused');
            this.updatePlayIcon(true);
        });

        this.video.addEventListener('pause', () => {
            this.wrapper.classList.add('paused');
            this.updatePlayIcon(false);
        });

        // Loading State
        this.video.addEventListener('waiting', () => this.wrapper.classList.add('loading'));
        this.video.addEventListener('playing', () => this.wrapper.classList.remove('loading'));
        this.video.addEventListener('canplay', () => this.wrapper.classList.remove('loading'));

        // Progress
        this.video.addEventListener('timeupdate', () => this.handleProgress());
        this.progressContainer.addEventListener('click', (e) => this.scrub(e));
        
        // Volume
        this.volumeSlider.addEventListener('input', () => this.video.volume = this.volumeSlider.value);
        this.volumeBtn.addEventListener('click', () => {
            if (this.video.volume > 0) {
                this.lastVolume = this.video.volume;
                this.video.volume = 0;
                this.volumeSlider.value = 0;
            } else {
                this.video.volume = this.lastVolume || 1;
                this.volumeSlider.value = this.lastVolume || 1;
            }
        });

        // Fullscreen
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // Close
        this.closeBtn.addEventListener('click', () => {
            if (this.onClose) this.onClose();
        });

        // Keyboard Shortcuts
        this.wrapper.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Error handling
        this.video.addEventListener('error', (e) => {
            console.error("Video Error:", this.video.error);
            // Dispatch custom event for parent to handle retry
            const event = new CustomEvent('videoerror', { detail: this.video.error });
            this.container.dispatchEvent(event);
        });
    }

    updatePlayIcon(isPlaying) {
        const icon = isPlaying 
            ? '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        this.playBtn.innerHTML = icon;
    }

    handleProgress() {
        const percent = (this.video.currentTime / this.video.duration) * 100;
        this.progressFilled.style.width = `${percent}%`;
        
        // Update Time
        const current = this.formatTime(this.video.currentTime);
        const duration = this.formatTime(this.video.duration);
        this.timeDisplay.textContent = `${current} / ${duration}`;
    }

    scrub(e) {
        const scrubTime = (e.offsetX / this.progressContainer.offsetWidth) * this.video.duration;
        this.video.currentTime = scrubTime;
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.wrapper.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    handleKeydown(e) {
        switch(e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault(); // Prevent scrolling
                if (this.video.paused) this.video.play();
                else this.video.pause();
                break;
            case 'f':
                this.toggleFullscreen();
                break;
            case 'm':
                this.video.muted = !this.video.muted;
                break;
            case 'arrowright':
                this.video.currentTime += 10;
                break;
            case 'arrowleft':
                this.video.currentTime -= 10;
                break;
            case 'arrowup':
                e.preventDefault();
                this.video.volume = Math.min(1, this.video.volume + 0.1);
                this.volumeSlider.value = this.video.volume;
                break;
            case 'arrowdown':
                e.preventDefault();
                this.video.volume = Math.max(0, this.video.volume - 0.1);
                this.volumeSlider.value = this.video.volume;
                break;
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
}
