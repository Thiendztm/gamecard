// sound.js - Quản lý hiệu ứng âm thanh thẻ bài cho Touhou FM: Card Battle
// Sử dụng: playCardSound('attack' | 'shield' | 'heal' | 'curse')

// Audio unlock status
let audioUnlocked = false;

const SOUND_PATHS = {
    attack: './audio/attack.mp3',
    shield: './audio/shield.mp3',
    heal: './audio/heal.mp3',
    curse: './audio/curse.mp3',
    // Game result sounds
    win: './audio/bgm1.mp3', // use existing bgm file
    lose: './sfx/pldead00.wav', // player death sound
    draw: './audio/heal.mp3' // use existing heal sound
};

// Function to unlock audio on first user interaction
function unlockAudio() {
    if (audioUnlocked) return;
    
    try {
        // Use existing audio file instead of data URL to avoid CSP issues
        const audio = new Audio('./audio/heal.mp3');
        audio.volume = 0.01; // Very quiet
        audio.play().then(() => {
            audioUnlocked = true;
            console.log('[SOUND] Audio unlocked');
            
            // Also trigger BGM unlock if available
            if (window.BGM && typeof window.BGM.triggerGesture === 'function') {
                window.BGM.triggerGesture();
                console.log('[SOUND] Triggered BGM gesture unlock');
            }
        }).catch(() => {
            console.log('[SOUND] Audio still locked');
        });
    } catch (e) {
        console.log('[SOUND] Audio unlock failed:', e);
    }
}

// Add global click listener to unlock audio
if (typeof document !== 'undefined') {
    const unlockOnce = () => {
        unlockAudio();
        document.removeEventListener('click', unlockOnce);
        document.removeEventListener('keydown', unlockOnce);
        document.removeEventListener('touchstart', unlockOnce);
    };
    
    document.addEventListener('click', unlockOnce);
    document.addEventListener('keydown', unlockOnce);
    document.addEventListener('touchstart', unlockOnce);
}

// Preload âm thanh (tạo function để clone Audio khi play)
const soundBuffers = {};
for (const type in SOUND_PATHS) {
    soundBuffers[type] = [];
    // Preload 1 instance để browser load file
    const audio = new Audio(SOUND_PATHS[type]);
    audio.preload = 'auto';
    soundBuffers[type].push(audio);
}

function getSfxVolume() {
        try {
                const settings = JSON.parse(localStorage.getItem('gameSettings')) || {};
                // SFX không phụ thuộc bgmMuted hoặc mute cũ; dùng khóa riêng sfxMuted/sfxVolume
                if (settings.sfxMuted === true) return 0;
                if (typeof settings.sfxVolume === 'number') return settings.sfxVolume;
                return 0.8;
        } catch {
                return 0.8;
        }
}

// API đơn giản để các phần khác có thể chỉnh SFX mà không ảnh hưởng BGM
window.setSfxMute = function(m){
    try {
        const s = JSON.parse(localStorage.getItem('gameSettings'))||{};
        s.sfxMuted = !!m; localStorage.setItem('gameSettings', JSON.stringify(s));
    } catch {}
};
window.setSfxVolume = function(v){
    try {
        const s = JSON.parse(localStorage.getItem('gameSettings'))||{};
        s.sfxVolume = Math.max(0, Math.min(1, v)); localStorage.setItem('gameSettings', JSON.stringify(s));
    } catch {}
};

/**
 * Phát hiệu ứng âm thanh thẻ bài
 * @param {"attack"|"shield"|"heal"|"curse"} type
 */
function playCardSound(type) {
    console.log('[SOUND] Attempting to play card sound:', type);
    
    if (!audioUnlocked) {
        console.log('[SOUND] Audio not unlocked yet, trying to unlock...');
        unlockAudio();
        return;
    }
    
    if (!SOUND_PATHS[type]) {
        console.warn('[SOUND] No sound path for card type:', type);
        return;
    }
    const volume = getSfxVolume();
    console.log('[SOUND] SFX Volume:', volume);
    if (volume === 0) {
        console.log('[SOUND] SFX Volume is 0, skipping sound');
        return;
    }
    
    try {
        // Tạo instance mới để phát đồng thời
        const audio = new Audio(SOUND_PATHS[type]);
        audio.volume = volume;
        
        // Add event listeners for debugging
        audio.addEventListener('loadstart', () => console.log('[SOUND] Loading started:', type));
        audio.addEventListener('canplay', () => console.log('[SOUND] Can play:', type));
        audio.addEventListener('error', (e) => console.error('[SOUND] Audio error:', type, e));
        
        console.log('[SOUND] Playing card sound:', SOUND_PATHS[type], 'at volume:', volume);
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('[SOUND] Card sound played successfully:', type);
            }).catch(e => {
                console.error('[SOUND] Could not play card sound:', type, e);
                // Try to resume audio context if suspended
                if (e.name === 'NotAllowedError') {
                    console.log('[SOUND] Audio blocked by browser policy. Need user interaction.');
                }
            });
        }
    } catch (e) {
        console.error('[SOUND] Exception playing card sound:', type, e);
    }
}

/**
 * Phát nhạc kết quả trận đấu
 * @param {"win"|"lose"|"draw"} resultType
 */
function playGameResultSound(resultType) {
    console.log('[SOUND] Attempting to play result sound:', resultType);
    
    if (!audioUnlocked) {
        console.log('[SOUND] Audio not unlocked yet, trying to unlock...');
        unlockAudio();
        return;
    }
    
    if (!SOUND_PATHS[resultType]) {
        console.warn('[SOUND] No sound path for result type:', resultType);
        return;
    }
    const volume = getSfxVolume();
    console.log('[SOUND] SFX Volume:', volume);
    if (volume === 0) {
        console.log('[SOUND] SFX Volume is 0, skipping sound');
        return;
    }
    // Tạo instance mới để phát nhạc kết quả
    const audio = new Audio(SOUND_PATHS[resultType]);
    audio.volume = volume;
    console.log('[SOUND] Playing result sound:', SOUND_PATHS[resultType], 'at volume:', volume);
    audio.play().then(() => {
        console.log('[SOUND] Result sound played successfully');
    }).catch(e => {
        console.error('[SOUND] Could not play result sound:', e);
    });
}

// Cho phép import qua <script src="/scripts/sound.js"></script>
window.playCardSound = playCardSound;
window.playGameResultSound = playGameResultSound;

// Debug function to check audio status
window.debugAudio = function() {
    const volume = getSfxVolume();
    const settings = JSON.parse(localStorage.getItem('gameSettings')) || {};
    console.log('[AUDIO DEBUG] SFX Volume:', volume);
    console.log('[AUDIO DEBUG] Settings:', settings);
    console.log('[AUDIO DEBUG] Sound paths:', SOUND_PATHS);
    
    // Test if files are accessible
    const testAudio = new Audio(SOUND_PATHS.attack);
    testAudio.oncanplaythrough = () => console.log('[AUDIO DEBUG] attack.mp3 can play');
    testAudio.onerror = (e) => console.error('[AUDIO DEBUG] attack.mp3 error:', e);
    testAudio.load();
    
    return {volume, settings, paths: SOUND_PATHS};
};

// Auto-unlock audio on page load with enhanced triggers
function initAutoUnlock() {
  console.log('🔊 Initializing enhanced auto-unlock system...');
  
  // Try to unlock immediately (may fail on some browsers)
  unlockAudio();
  
  // Force unlock on any interaction
  const forceUnlock = () => {
    console.log('🔊 Force unlocking audio due to user interaction');
    unlockAudio();
    
    // Test play with existing audio file to avoid CSP issues
    const testAudio = new Audio('./audio/heal.mp3');
    testAudio.volume = 0.01;
    testAudio.play().catch(e => console.log('Test audio failed:', e));
  };
  
  // Multiple interaction types
  ['click', 'keydown', 'touchstart', 'mousedown', 'pointerdown'].forEach(event => {
    document.addEventListener(event, forceUnlock, { once: true });
  });
  
  // Also try unlock when window gains focus
  window.addEventListener('focus', unlockAudio, { once: true });
}

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoUnlock);
} else {
  initAutoUnlock();
}
