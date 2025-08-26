class MusicPlayer {
    constructor() {
        this.audio = document.getElementById('audio-player');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.progress = document.getElementById('progress');
        this.progressBar = document.querySelector('.progress-bar');
        this.currentTimeEl = document.getElementById('current-time');
        this.durationEl = document.getElementById('duration');
        this.songTitle = document.getElementById('song-title');
        this.albumImage = document.getElementById('album-image');

        this.songs = [
            {
                title: 'BGM 1',
                src: 'audio/bgm1.mp3',
                image: '../DesignHud/background6.png'
            },
            {
                title: 'BGM 2',
                src: 'audio/bgm2.mp3',
                image: '../DesignHud/background2.jpg'
            },
            {
                title: 'BGM 3',
                src: 'audio/bgm3.mp3',
                image: '../assets/bg3.png'
            },
            {
                title: 'BGM 4',
                src: 'audio/bgm4.mp3',
                image: '../assets/bg4.jpg'
            },
            {
                title: 'BGM 5',
                src: 'audio/bgm5.mp3',
                image: '../assets/bg5.png'
            }
        ];

        this.currentSongIndex = 0;
        this.isPlaying = false;
        this.volume = 0.6; // Default volume

        this.init();
    }

    init() {
        this.loadSong(this.currentSongIndex);
        this.bindEvents();
        this.audio.volume = this.volume;
        
        // Auto-play music on page load
        this.autoPlay();
    }

    autoPlay() {
        // Try to auto-play after a short delay to ensure page is loaded
        setTimeout(() => {
            this.play().catch(error => {
                console.log('Auto-play prevented by browser:', error);
                // If auto-play fails, just keep the play button ready
            });
        }, 500);
    }

    bindEvents() {
        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        // Previous button
        this.prevBtn.addEventListener('click', () => {
            this.previousSong();
        });

        // Next button
        this.nextBtn.addEventListener('click', () => {
            this.nextSong();
        });

        // Progress bar click
        this.progressBar.addEventListener('click', (e) => {
            this.setProgress(e);
        });

        // Audio events
        this.audio.addEventListener('loadedmetadata', () => {
            this.updateDuration();
        });

        this.audio.addEventListener('timeupdate', () => {
            this.updateProgress();
        });

        this.audio.addEventListener('ended', () => {
            this.nextSong();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'ArrowLeft':
                    this.previousSong();
                    break;
                case 'ArrowRight':
                    this.nextSong();
                    break;
            }
        });
    }

    loadSong(index) {
        const song = this.songs[index];
        this.audio.src = song.src;
        this.songTitle.textContent = song.title;
        this.albumImage.src = song.image;
        this.albumImage.alt = song.title;
        
        // Reset progress
        this.progress.style.width = '0%';
        this.currentTimeEl.textContent = '0:00';
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        const playPromise = this.audio.play();
        this.isPlaying = true;
        this.playPauseBtn.textContent = '⏸';
        return playPromise;
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.playPauseBtn.textContent = '▶';
    }

    previousSong() {
        this.currentSongIndex = (this.currentSongIndex - 1 + this.songs.length) % this.songs.length;
        this.loadSong(this.currentSongIndex);
        if (this.isPlaying) {
            this.play();
        }
    }

    nextSong() {
        this.currentSongIndex = (this.currentSongIndex + 1) % this.songs.length;
        this.loadSong(this.currentSongIndex);
        if (this.isPlaying) {
            this.play();
        }
    }

    setProgress(e) {
        const width = this.progressBar.clientWidth;
        const clickX = e.offsetX;
        const duration = this.audio.duration;

        this.audio.currentTime = (clickX / width) * duration;
    }

    updateProgress() {
        const { duration, currentTime } = this.audio;
        
        if (duration) {
            const progressPercent = (currentTime / duration) * 100;
            this.progress.style.width = `${progressPercent}%`;
            
            this.currentTimeEl.textContent = this.formatTime(currentTime);
        }
    }

    updateDuration() {
        const duration = this.audio.duration;
        if (duration) {
            this.durationEl.textContent = this.formatTime(duration);
        }
    }

    formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = this.volume;
    }

    getVolume() {
        return this.volume;
    }
}

// Initialize the music player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.musicPlayer = new MusicPlayer();
});
