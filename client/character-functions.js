// Character selection and sprite management functions
class CharacterManager {
    constructor() {
        this.currentPlayer = null;
        this.selectedCharacter = null;
        this.socket = null;
    }

    // Initialize character selection system
    initializeCharacterSelection() {
        const characterModal = document.getElementById('character-modal');
        const characterButtons = document.querySelectorAll('.character-select-btn');
        const characterOptions = document.querySelectorAll('.character-btn');
        const confirmBtn = document.getElementById('confirm-character');
        const cancelBtn = document.getElementById('cancel-character');
        
        // Clear old character data
        sessionStorage.removeItem('player1Character');
        sessionStorage.removeItem('player2Character');
        sessionStorage.removeItem('player1Name');
        sessionStorage.removeItem('player2Name');
        sessionStorage.removeItem('currentPlayerPosition');
        
        // Open modal when character select button is clicked
        characterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                const playerNumber = btn.dataset.player;
                
                // Check if current room exists and has players
                const currentRoom = JSON.parse(sessionStorage.getItem('currentRoom') || '{}');
                if (!currentRoom || !currentRoom.players || currentRoom.players.length < 2) {
                    this.showMessage('Cần có đủ 2 người chơi mới có thể chọn nhân vật!', true);
                    return;
                }
                
                // Check if this is the user's slot
                const playerIndex = parseInt(playerNumber) - 1;
                if (currentRoom.players[playerIndex] && currentRoom.players[playerIndex].name === user.username) {
                    this.currentPlayer = playerNumber;
                    this.showCharacterModal();
                } else {
                    this.showMessage('Bạn chỉ có thể chọn nhân vật cho chính mình!', true);
                }
            });
        });
        
        // Handle character option selection
        characterOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove selected class from all options
                characterOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Add selected class to clicked option
                option.classList.add('selected');
                this.selectedCharacter = option.dataset.character;
            });
        });
        
        // Handle confirm button
        confirmBtn.addEventListener('click', () => {
            if (this.selectedCharacter && this.currentPlayer) {
                this.confirmCharacterSelection();
            }
        });
        
        // Handle cancel button
        cancelBtn.addEventListener('click', () => {
            this.hideCharacterModal();
        });
        
        // Close modal when clicking outside
        characterModal.addEventListener('click', (e) => {
            if (e.target === characterModal) {
                this.hideCharacterModal();
            }
        });
        
        // Initialize display based on existing selections
        this.updateCharacterDisplays();
    }

    // Show character selection modal
    showCharacterModal() {
        const modal = document.getElementById('character-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.selectedCharacter = null;
            
            // Clear previous selections in modal
            const modalButtons = document.querySelectorAll('#character-modal .character-btn');
            modalButtons.forEach(btn => btn.classList.remove('selected'));
        }
    }

    // Hide character selection modal
    hideCharacterModal() {
        const modal = document.getElementById('character-modal');
        if (modal) {
            modal.style.display = 'none';
            this.currentPlayer = null;
            this.selectedCharacter = null;
        }
    }

    // Confirm character selection
    confirmCharacterSelection() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        // Store character selection in room selections for sync
        const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
        roomCharacterSelections[user.username] = this.selectedCharacter;
        sessionStorage.setItem('roomCharacterSelections', JSON.stringify(roomCharacterSelections));
        
        // Emit character selection to server for real-time sync
        const currentRoom = JSON.parse(sessionStorage.getItem('currentRoom') || '{}');
        if (this.socket && currentRoom) {
            this.socket.emit('characterSelected', {
                roomId: currentRoom.id,
                playerId: user.username,
                playerPosition: this.currentPlayer,
                character: this.selectedCharacter
            });
        }
        
        // Get existing character selections (legacy support)
        const characterSelections = JSON.parse(sessionStorage.getItem('characterSelections') || '{}');
        characterSelections[user.username] = this.selectedCharacter;
        sessionStorage.setItem('characterSelections', JSON.stringify(characterSelections));
        
        console.log('Character selection saved:', characterSelections);
        
        // Update display
        this.updateCharacterDisplays();
        
        // Hide modal
        this.hideCharacterModal();
        
        this.showMessage(`Đã chọn nhân vật: ${this.selectedCharacter === 'reimu' ? 'Reimu' : 'Marisa'}`, false);
    }

    // Update character displays in waiting room
    updateCharacterDisplays() {
        // Get room character selections (synced from server)
        const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
        
        // Update displays to show "Chưa chọn" by default
        const player1Display = document.getElementById('player1-selected');
        const player2Display = document.getElementById('player2-selected');
        
        if (player1Display) {
            player1Display.textContent = 'Chưa chọn';
        }
        
        if (player2Display) {
            player2Display.textContent = 'Chưa chọn';
        }
        
        // Update displays based on room players and their character selections
        const currentRoom = JSON.parse(sessionStorage.getItem('currentRoom') || '{}');
        if (currentRoom && currentRoom.players) {
            currentRoom.players.forEach((player, index) => {
                const playerPosition = index + 1;
                const display = document.getElementById(`player${playerPosition}-selected`);
                const playerCharacter = roomCharacterSelections[player.name];
                
                if (display) {
                    if (playerCharacter) {
                        display.textContent = playerCharacter === 'reimu' ? 'Reimu' : 'Marisa';
                    } else {
                        display.textContent = 'Chưa chọn';
                    }
                }
            });
        }
    }

    // Display character sprites on map pages
    displayCharacterSprites() {
        // Only run on map pages to prevent infinite loading on main menu
        if (!window.location.pathname.includes('map') && !document.body.style.backgroundImage.includes('map')) {
            console.log('Not on map page, skipping character sprite display');
            return;
        }
        
        // Prevent multiple calls within short time period
        const now = Date.now();
        if (this.lastSpriteUpdate && (now - this.lastSpriteUpdate) < 2000) {
            console.log('Skipping sprite update - too soon after last update');
            return;
        }
        this.lastSpriteUpdate = now;
        
        // Check if sprites already exist to prevent duplicate requests
        if (document.getElementById('character-sprite') || document.getElementById('opponent-character-sprite')) {
            console.log('Character sprites already exist, skipping creation');
            return;
        }
        
        // Get current user info
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const currentUsername = user.username;
        
        console.log('=== Character Sprite Debug ===');
        console.log('Current user:', currentUsername);
        
        // Clear any existing character sprites first
        const existingSprite = document.getElementById('character-sprite');
        if (existingSprite) {
            existingSprite.remove();
        }
        
        const existingOpponentSprite = document.getElementById('opponent-character-sprite');
        if (existingOpponentSprite) {
            existingOpponentSprite.remove();
        }
        
        // Get the character selection data with proper validation
        const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
        console.log('Room character selections:', roomCharacterSelections);
        
        // Find current user's character selection
        const userCharacter = roomCharacterSelections[currentUsername];
        console.log('User character:', userCharacter);
        
        // Find opponent's character selection
        let opponentCharacter = null;
        for (const [username, character] of Object.entries(roomCharacterSelections)) {
            if (username !== currentUsername) {
                opponentCharacter = character;
                console.log('Opponent character:', opponentCharacter, 'by user:', username);
                break;
            }
        }
        
        // Only create sprites if character data exists and we have valid selections
        if (Object.keys(roomCharacterSelections).length === 0) {
            console.log('No character selections found, skipping sprite creation');
            return;
        }
        
        // Display current user's character sprite (bottom right)
        if (userCharacter && (userCharacter === 'reimu' || userCharacter === 'marisa')) {
            this.createUserSprite(userCharacter);
        }
        
        // Display opponent's character sprite (center top above action panel)
        if (opponentCharacter && (opponentCharacter === 'reimu' || opponentCharacter === 'marisa')) {
            this.createOpponentSprite(opponentCharacter);
        } else {
            console.log('No opponent character selected or invalid character');
        }
    }

    // Create user character sprite
    createUserSprite(character) {
        // Check if sprite already exists to prevent duplicates
        if (document.getElementById('character-sprite')) {
            console.log('User sprite already exists, skipping creation');
            return;
        }
        
        console.log('Creating user sprite for character:', character);
        
        const characterSprite = document.createElement('img');
        characterSprite.id = 'character-sprite';
        characterSprite.src = `/DesignHud/${character}4.png`;
        characterSprite.alt = character;
        characterSprite.className = 'character-sprite user-sprite';
        
        characterSprite.onerror = function() {
            console.error('Failed to load character sprite:', this.src);
            // Remove failed sprite to prevent accumulation
            this.remove();
        };
        
        characterSprite.onload = function() {
            console.log('Character sprite loaded successfully:', this.src);
        };
        
        // Add sprite to user-section instead of action panel directly
        const userSection = document.querySelector('.user-section');
        if (userSection) {
            userSection.appendChild(characterSprite);
        } else {
            document.body.appendChild(characterSprite);
        }
        
        // Create health and mana stats for user
        this.createUserBars();
    }

    // Create health and mana stats for user
    createUserBars() {
        // Remove existing stats if any
        const existingStats = document.getElementById('user-stats');
        if (existingStats) {
            existingStats.remove();
        }

        // Create stats container
        const statsContainer = document.createElement('div');
        statsContainer.id = 'user-stats';
        statsContainer.className = 'user-stats';

        // Create HP text
        const hpText = document.createElement('div');
        hpText.className = 'stat-text hp-text';
        hpText.id = 'user-hp-text';
        hpText.textContent = 'HP: 150';

        // Create MP text
        const mpText = document.createElement('div');
        mpText.className = 'stat-text mp-text';
        mpText.id = 'user-mp-text';
        mpText.textContent = 'MP: 150';

        // Add to container
        statsContainer.appendChild(hpText);
        statsContainer.appendChild(mpText);

        // Add stats to user-section first (before sprite)
        const userSection = document.querySelector('.user-section');
        if (userSection) {
            userSection.insertBefore(statsContainer, userSection.firstChild);
        } else {
            document.body.appendChild(statsContainer);
        }
    }

    // Update user health (numeric value)
    updateUserHealth(value) {
        const hpText = document.getElementById('user-hp-text');
        if (hpText) {
            hpText.textContent = `HP: ${Math.max(0, value)}`;
        }
    }

    // Update user mana (numeric value)
    updateUserMana(value) {
        const mpText = document.getElementById('user-mp-text');
        if (mpText) {
            mpText.textContent = `MP: ${Math.max(0, value)}`;
        }
    }

    // Create opponent character sprite
    createOpponentSprite(character) {
        // Check if sprite already exists to prevent duplicates
        if (document.getElementById('opponent-character-sprite')) {
            console.log('Opponent sprite already exists, skipping creation');
            return;
        }
        
        console.log('Creating opponent sprite for character:', character);
        
        const opponentSprite = document.createElement('img');
        opponentSprite.id = 'opponent-character-sprite';
        opponentSprite.src = `/DesignHud/${character}map2.png`;
        opponentSprite.alt = `opponent-${character}`;
        opponentSprite.className = 'character-sprite opponent-sprite';
        
        opponentSprite.onerror = function() {
            console.error('Failed to load opponent sprite:', this.src);
            // Remove failed sprite to prevent accumulation
            this.remove();
        };
        
        opponentSprite.onload = function() {
            console.log('Opponent sprite loaded successfully:', this.src);
            // Show action panel after 2 second delay
            setTimeout(() => {
                const actionPanel = document.querySelector('.action-panel');
                if (actionPanel) {
                    actionPanel.classList.add('show');
                    console.log('Action panel shown after 2 second delay');
                }
            }, 3000);
        };
        
        document.body.appendChild(opponentSprite);
        
        // Create health and mana stats for opponent
        this.createOpponentBars();
    }

    // Create health and mana stats for opponent
    createOpponentBars() {
        // Remove existing stats if any
        const existingStats = document.getElementById('opponent-stats');
        if (existingStats) {
            existingStats.remove();
        }

        // Create stats container
        const statsContainer = document.createElement('div');
        statsContainer.id = 'opponent-stats';
        statsContainer.className = 'opponent-stats';

        // Create HP text
        const hpText = document.createElement('div');
        hpText.className = 'stat-text hp-text';
        hpText.id = 'opponent-hp-text';
        hpText.textContent = 'HP: 150';

        // Create MP text
        const mpText = document.createElement('div');
        mpText.className = 'stat-text mp-text';
        mpText.id = 'opponent-mp-text';
        mpText.textContent = 'MP: 150';

        // Add to container
        statsContainer.appendChild(hpText);
        statsContainer.appendChild(mpText);

        // Add to document
        document.body.appendChild(statsContainer);
    }

    // Update opponent health (numeric value)
    updateOpponentHealth(value) {
        const hpText = document.getElementById('opponent-hp-text');
        if (hpText) {
            hpText.textContent = `HP: ${Math.max(0, value)}`;
        }
    }

    // Update opponent mana (numeric value)
    updateOpponentMana(value) {
        const mpText = document.getElementById('opponent-mp-text');
        if (mpText) {
            mpText.textContent = `MP: ${Math.max(0, value)}`;
        }
    }

    // Show message to user
    showMessage(message, isError = false) {
        // Create or get existing message element
        let messageEl = document.getElementById('character-message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'character-message';
            messageEl.className = 'character-message';
            document.body.appendChild(messageEl);
        }
        
        messageEl.textContent = message;
        messageEl.className = `character-message ${isError ? 'error' : 'success'}`;
        messageEl.style.display = 'block';
        
        // Hide message after 3 seconds
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }

    // Set socket instance
    setSocket(socket) {
        this.socket = socket;
    }
}

// Global character manager instance
const characterManager = new CharacterManager();

// Global functions for backward compatibility
function displayCharacterSprites() {
    // Add global throttling to prevent excessive calls
    if (window.lastGlobalSpriteCall && (Date.now() - window.lastGlobalSpriteCall) < 3000) {
        console.log('Global sprite call throttled');
        return;
    }
    window.lastGlobalSpriteCall = Date.now();
    
    characterManager.displayCharacterSprites();
}

function initializeCharacterSelection() {
    characterManager.initializeCharacterSelection();
}

function updateCharacterDisplays() {
    characterManager.updateCharacterDisplays();
}

// Initialize character sprites when page loads (only on map pages)
window.addEventListener('load', () => {
    // Only display character sprites on map pages, not on main menu
    if (window.location.pathname.includes('map') || document.body.style.backgroundImage.includes('map')) {
        // Check if already initialized to prevent duplicate calls
        if (window.spritesInitialized) {
            console.log('Sprites already initialized, skipping');
            return;
        }
        window.spritesInitialized = true;
        
        // Add delay to ensure all data is loaded
        setTimeout(() => {
            displayCharacterSprites();
        }, 1000);
    }
});
