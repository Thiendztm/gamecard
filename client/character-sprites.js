// Character sprite display system
function displayCharacterSprites() {
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
    
    // Display current user's character sprite (bottom right)
    if (userCharacter && (userCharacter === 'reimu' || userCharacter === 'marisa')) {
        console.log('Creating user sprite for character:', userCharacter);
        
        const characterSprite = document.createElement('img');
        characterSprite.id = 'character-sprite';
        characterSprite.src = `/DesignHud/${userCharacter}map.png`;
        characterSprite.alt = userCharacter;
        characterSprite.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 120px;
            height: 120px;
            z-index: 1000;
            border-radius: 10px;
            border: 2px solid rgba(255, 255, 255, 0.5);
            background: rgba(0, 0, 0, 0.3);
            padding: 5px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        `;
        
        characterSprite.onerror = function() {
            console.error('Failed to load character sprite:', this.src);
        };
        
        characterSprite.onload = function() {
            console.log('Character sprite loaded successfully:', this.src);
        };
        
        document.body.appendChild(characterSprite);
    }
    
    // Display opponent's character sprite (center top above action panel)
    if (opponentCharacter && (opponentCharacter === 'reimu' || opponentCharacter === 'marisa')) {
        console.log('Creating opponent sprite for character:', opponentCharacter);
        
        const opponentSprite = document.createElement('img');
        opponentSprite.id = 'opponent-character-sprite';
        opponentSprite.src = `/DesignHud/${opponentCharacter}map2.png`;
        opponentSprite.alt = `opponent-${opponentCharacter}`;
        opponentSprite.style.cssText = `
            position: fixed;
            top: 50px;
            left: 50%;
            transform: translateX(-50%);
            width: 150px;
            height: 150px;
            z-index: 1000;
            border-radius: 10px;
            border: 2px solid rgba(255, 255, 255, 0.5);
            background: rgba(0, 0, 0, 0.3);
            padding: 5px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        `;
        
        opponentSprite.onerror = function() {
            console.error('Failed to load opponent sprite:', this.src);
        };
        
        opponentSprite.onload = function() {
            console.log('Opponent sprite loaded successfully:', this.src);
        };
        
        document.body.appendChild(opponentSprite);
    } else {
        console.log('No opponent character selected or invalid character');
    }
}

// Initialize character sprites when page loads
window.addEventListener('load', () => {
    displayCharacterSprites();
});
