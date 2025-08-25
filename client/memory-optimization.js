// Memory optimization utilities
class MemoryOptimizer {
    constructor() {
        this.imageCache = new Map();
        this.audioCache = new Map();
        this.maxCacheSize = 5; // Limit cached items
    }

    // Optimize image loading
    optimizeImages() {
        // Use lazy loading for background images
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            observer.observe(img);
        });
    }

    // Clean up unused resources
    cleanup() {
        // Clear excessive cache
        if (this.imageCache.size > this.maxCacheSize) {
            const firstKey = this.imageCache.keys().next().value;
            this.imageCache.delete(firstKey);
        }

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    // Optimize audio loading
    optimizeAudio() {
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
            // Only load when needed
            audio.preload = 'none';
            
            // Clean up when not playing
            audio.addEventListener('ended', () => {
                audio.currentTime = 0;
                audio.src = '';
                audio.load();
            });
        });
    }

    // Reduce DOM manipulation
    batchDOMUpdates(updates) {
        requestAnimationFrame(() => {
            updates.forEach(update => update());
        });
    }
}

// Initialize memory optimizer
const memoryOptimizer = new MemoryOptimizer();

// Auto cleanup every 30 seconds
setInterval(() => {
    memoryOptimizer.cleanup();
}, 30000);

// Optimize on page load
window.addEventListener('load', () => {
    memoryOptimizer.optimizeImages();
    memoryOptimizer.optimizeAudio();
});

// Make globally available
window.memoryOptimizer = memoryOptimizer;
