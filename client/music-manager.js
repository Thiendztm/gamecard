// Music Manager for persistent audio across page reloads
class MusicManager {
    constructor() {
        this.audio = null;
        this.musicIcon = null;
        this.volumeSlider = null;
        this.volumeText = null;
        this.isPlaying = false;
        this.currentVolume = 0.5;
        this.currentTime = 0;
        this.initialized = false;
    }

    // Initialize music manager
    initialize() {
        if (this.initialized) {
            console.log('Music manager already initialized');
            return;
        }

        this.audio = document.getElementById('backgroundMusic');
        this.musicIcon = document.getElementById('musicIcon');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeText = document.getElementById('volumeText');

        if (!this.audio || !this.musicIcon || !this.volumeSlider || !this.volumeText) {
            console.log('Music elements not found, retrying...');
            setTimeout(() => this.initialize(), 500);
            return;
        }

        // Load saved music state
        this.loadMusicState();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Auto-play if was playing before
        if (this.isPlaying) {
            this.playMusic();
        }

        this.initialized = true;
        console.log('Music manager initialized');
    }

    // Load music state from localStorage
    loadMusicState() {
        const savedState = localStorage.getItem('musicState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.isPlaying = state.isPlaying || false;
                this.currentVolume = state.volume || 0.5;
                this.currentTime = state.currentTime || 0;
                
                // Apply loaded state
                this.audio.volume = this.currentVolume;
                this.audio.currentTime = this.currentTime;
                this.volumeSlider.value = this.currentVolume * 100;
                this.volumeText.textContent = Math.round(this.currentVolume * 100) + '%';
                
                // Update icon based on state
                if (this.isPlaying) {
                    this.musicIcon.textContent = '🎵';
                } else {
                    this.musicIcon.textContent = '🔇';
                }
                
                console.log('Music state loaded:', state);
            } catch (error) {
                console.error('Error loading music state:', error);
                this.setDefaultState();
            }
        } else {
            this.setDefaultState();
        }
    }

    // Set default music state
    setDefaultState() {
        this.isPlaying = true; // Auto-play by default
        this.currentVolume = 0.5;
        this.currentTime = 0;
        
        this.audio.volume = this.currentVolume;
        this.volumeSlider.value = 50;
        this.volumeText.textContent = '50%';
        this.musicIcon.textContent = '🎵';
    }

    // Save music state to localStorage
    saveMusicState() {
        const state = {
            isPlaying: this.isPlaying,
            volume: this.currentVolume,
            currentTime: this.audio ? this.audio.currentTime : 0
        };
        
        localStorage.setItem('musicState', JSON.stringify(state));
        console.log('Music state saved:', state);
    }

    // Setup event listeners
    setupEventListeners() {
        // Music icon click - toggle play/pause
        this.musicIcon.addEventListener('click', () => {
            this.toggleMusic();
        });

        // Volume slider
        this.volumeSlider.addEventListener('input', (e) => {
            this.setVolume(e.target.value / 100);
        });

        // Save state periodically while playing
        this.audio.addEventListener('timeupdate', () => {
            if (this.isPlaying) {
                this.currentTime = this.audio.currentTime;
                // Save state every 5 seconds to avoid too frequent saves
                if (Math.floor(this.currentTime) % 5 === 0) {
                    this.saveMusicState();
                }
            }
        });

        // Handle audio end (though loop should prevent this)
        this.audio.addEventListener('ended', () => {
            this.audio.currentTime = 0;
            if (this.isPlaying) {
                this.audio.play();
            }
        });

        // Save state when page is about to unload
        window.addEventListener('beforeunload', () => {
            this.saveMusicState();
        });

        // Save state when page loses focus
        window.addEventListener('blur', () => {
            this.saveMusicState();
        });
    }

    // Play music
    playMusic() {
        this.audio.play().then(() => {
            this.isPlaying = true;
            this.musicIcon.textContent = '🎵';
            this.saveMusicState();
            console.log('Music started playing');
        }).catch((error) => {
            console.log('Auto-play prevented - user interaction required:', error);
            this.isPlaying = false;
            this.musicIcon.textContent = '🔇';
        });
    }

    // Pause music
    pauseMusic() {
        this.audio.pause();
        this.isPlaying = false;
        this.musicIcon.textContent = '🔇';
        this.saveMusicState();
        console.log('Music paused');
    }

    // Toggle music play/pause
    toggleMusic() {
        if (this.isPlaying) {
            this.pauseMusic();
        } else {
            this.playMusic();
        }
    }

    // Set volume
    setVolume(volume) {
        this.currentVolume = volume;
        this.audio.volume = volume;
        this.volumeText.textContent = Math.round(volume * 100) + '%';

        // Update icon based on volume
        if (volume === 0) {
            this.musicIcon.textContent = '🔇';
        } else if (this.isPlaying) {
            this.musicIcon.textContent = '🎵';
        }

        this.saveMusicState();
    }

    // Get current playing state
    getPlayingState() {
        return {
            isPlaying: this.isPlaying,
            volume: this.currentVolume,
            currentTime: this.audio ? this.audio.currentTime : 0
        };
    }
}

// Global music manager instance
let musicManager = null;

// Initialize music manager when page loads
window.addEventListener('load', () => {
    // Only initialize on map pages
    if (window.location.pathname.includes('map') || document.body.style.backgroundImage.includes('map')) {
        musicManager = new MusicManager();
        
        // Wait a bit for DOM elements to be ready
        setTimeout(() => {
            musicManager.initialize();
        }, 500);
    }
});

// Export for global access
window.musicManager = musicManager;
