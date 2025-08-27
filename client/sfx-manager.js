class SFXManager {
    constructor() {
        this.sounds = {};
        this.volume = 0.7;
        this.enabled = true;
        this.initializeSounds();
    }

    initializeSounds() {
        // Sound mappings based on hd.txt instructions
        const soundFiles = {
            // UI Sounds
            back: 'cancel00.wav',      // For back/cancel actions
            cancel: 'cancel00.wav',    // Alias for back/cancel actions
            select: 'select00.wav',    // For selections/clicks
            
            // Combat Sounds
            attack: 'lazer00.wav',     // For attack actions
            skill: 'power1.wav',       // For skill usage
            heal: 'powerup.wav',       // For healing
            death: 'pldead00.wav',     // For death
            hit: 'tan00.wav',          // For damage taken
            special: 'nep00.wav'       // For special effects
        };

        // Add sounds from audio folder
        this.shieldSound = new Audio('/audio/shield.mp3');
        this.shieldSound.volume = this.volume;
        this.shieldSound.preload = 'auto';
        
        this.healSound = new Audio('/audio/heal.mp3');
        this.healSound.volume = this.volume;
        this.healSound.preload = 'auto';
        
        this.curseSound = new Audio('/audio/curse.mp3');
        this.curseSound.volume = this.volume;
        this.curseSound.preload = 'auto';
        
        this.attackSound = new Audio('/audio/attack.mp3');
        this.attackSound.volume = this.volume;
        this.attackSound.preload = 'auto';

        // Preload all sound files
        Object.keys(soundFiles).forEach(key => {
            this.sounds[key] = new Audio(`/sfx/${soundFiles[key]}`);
            this.sounds[key].volume = this.volume;
            this.sounds[key].preload = 'auto';
        });
    }

    play(soundName, volume = null) {
        if (!this.enabled) {
            return;
        }

        try {
            if (soundName === 'shield') {
                const sound = this.shieldSound.cloneNode();
                sound.volume = volume !== null ? volume : this.volume;
                sound.play().catch(e => {
                    console.log(`Could not play shield sound:`, e);
                });
            } else if (soundName === 'skillHeal') {
                const sound = this.healSound.cloneNode();
                sound.volume = volume !== null ? volume : this.volume;
                sound.play().catch(e => {
                    console.log(`Could not play heal sound:`, e);
                });
            } else if (soundName === 'skillCurse') {
                const sound = this.curseSound.cloneNode();
                sound.volume = volume !== null ? volume : this.volume;
                sound.play().catch(e => {
                    console.log(`Could not play curse sound:`, e);
                });
            } else if (soundName === 'skillAttack') {
                const sound = this.attackSound.cloneNode();
                sound.volume = volume !== null ? volume : this.volume;
                sound.play().catch(e => {
                    console.log(`Could not play attack sound:`, e);
                });
            } else if (this.sounds[soundName]) {
                const sound = this.sounds[soundName].cloneNode();
                sound.volume = volume !== null ? volume : this.volume;
                sound.play().catch(e => {
                    console.log(`Could not play sound ${soundName}:`, e);
                });
            }
        } catch (error) {
            console.log(`Error playing sound ${soundName}:`, error);
        }
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        Object.values(this.sounds).forEach(sound => {
            sound.volume = this.volume;
        });
        // Update audio folder sounds volume too
        if (this.shieldSound) {
            this.shieldSound.volume = this.volume;
        }
        if (this.healSound) {
            this.healSound.volume = this.volume;
        }
        if (this.curseSound) {
            this.curseSound.volume = this.volume;
        }
        if (this.attackSound) {
            this.attackSound.volume = this.volume;
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // UI Sound Methods
    playSelect() {
        this.play('select');
    }

    playCancel() {
        this.play('cancel');
    }

    // Combat Sound Methods
    playAttack() {
        this.play('attack');
    }

    playSkill() {
        this.play('power');
    }

    playHeal() {
        this.play('powerup');
    }

    playDamage() {
        this.play('hit');
    }

    playDeath() {
        this.play('death');
    }

    playSpecial() {
        this.play('special');
    }

    // Auto-play sounds based on combat actions
    playCombatSound(action, skillName = null) {
        switch (action) {
            case 'attack':
                this.playAttack();
                break;
            case 'skill':
                if (skillName && (skillName.includes('Heal') || skillName.includes('heal'))) {
                    this.playHeal();
                } else {
                    this.playSkill();
                }
                break;
            case 'damage':
                this.playDamage();
                break;
            case 'death':
                this.playDeath();
                break;
            case 'special':
                this.playSpecial();
                break;
        }
    }
}

// Global SFX Manager instance
window.sfxManager = new SFXManager();

// Auto-attach sound effects to common UI elements
document.addEventListener('DOMContentLoaded', function() {
    // Add select sound to all clickable buttons
    const buttons = document.querySelectorAll('button, .action-item, .skill-item, .menu-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.classList.contains('cancel-btn') || 
                button.textContent.includes('Quay') || 
                button.textContent.includes('Back')) {
                window.sfxManager.playCancel();
            } else {
                window.sfxManager.playSelect();
            }
        });
    });

    // Add cancel sound to back/close buttons
    const cancelButtons = document.querySelectorAll('.close-btn, .back-btn, .cancel-browser-btn, .close-room-panel, .leave-room-btn, [onclick*="history.back"]');
    cancelButtons.forEach(button => {
        button.addEventListener('click', () => {
            window.sfxManager.playCancel();
        });
    });

    // Add cancel sound for clicking outside modals/overlays to close them
    document.addEventListener('click', function(e) {
        // Check if clicking on modal overlay or background elements that close modals
        if (e.target.classList.contains('room-browser-overlay') ||
            e.target.classList.contains('room-panel-overlay') ||
            e.target.classList.contains('modal-overlay') ||
            e.target.classList.contains('game-over-modal') ||
            e.target.id === 'profile-viewer' ||
            e.target.id === 'avatar-selector' ||
            (e.target.tagName === 'DIV' && e.target.style.background && e.target.style.background.includes('rgba(0, 0, 0'))) {
            window.sfxManager.playCancel();
        }
    });
});
