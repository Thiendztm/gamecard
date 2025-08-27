
const MAIN_MENU_DEBUG = false;
const debug = MAIN_MENU_DEBUG ? console.log : () => {};

debug('Main menu loaded');

let gameRooms = [];
let currentRoom = null;
let socket; // Declare socket variable

function initializeSocket() {
    // Prevent multiple socket initializations
    if (window.socketInitialized) {
        console.log('Socket already initialized, skipping');
        return;
    }
    window.socketInitialized = true;
    
    // Initialize socket connection
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket connected');
    });
    
    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        // Prevent automatic reconnection loops that could cause page reloads
        if (socket.connected === false) {
            console.log('Preventing reconnection loop');
            return;
        }
    });
    
    socket.on('error', (data) => {
        alert(data.message || 'Có lỗi xảy ra');
    });
    
    socket.on('roomCreated', (roomData) => {
        gameRooms.push(roomData);
        updateRoomList();
        
        // Join the created room immediately
        currentRoom = roomData;
        closeRoomPanel();
        openWaitingRoom(roomData);
    });
    
    socket.on('roomJoined', (roomData) => {
        currentRoom = roomData;
        openWaitingRoom(roomData);
    });
    
    socket.on('playerJoined', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            currentRoom.players = data.players;
            updateWaitingRoom();
        }
        updateRoomList();
    });
    
    socket.on('playerLeft', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            currentRoom.players = data.players;
            updateWaitingRoom();
        }
        updateRoomList();
    });
    
    socket.on('playerReady', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            updatePlayerStatus(data.playerId, data.ready);
        }
    });
    
    // Handle card game start for PvP mode
    socket.on('cardGameStarted', () => {
        console.log('Card game started - redirecting to gamePVP.html');
        
        // Store game data for PvP card battle
        const gameData = {
            roomId: currentRoom.id,
            gameMode: 'card',
            isAI: false,
            players: currentRoom.players
        };
        sessionStorage.setItem('gameData', JSON.stringify(gameData));
        sessionStorage.setItem('currentRoomId', currentRoom.id);
        sessionStorage.setItem('matchMode', 'pvp');
        
        // Redirect to PvP game page
        window.location.href = 'gamePVP.html';
    });
    
    socket.on('characterSelected', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            // Update character display for the player who selected
            const selectedDisplay = document.getElementById(`player${data.playerPosition}-selected`);
            if (selectedDisplay) {
                selectedDisplay.textContent = data.character === 'reimu' ? 'Reimu' : 'Marisa';
            }
            
            // Store the selection for synchronization
            const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
            roomCharacterSelections[data.playerId] = data.character;
            sessionStorage.setItem('roomCharacterSelections', JSON.stringify(roomCharacterSelections));
            
            console.log('Character selection received from server:', data);
            console.log('Updated roomCharacterSelections:', roomCharacterSelections);
            
            // Don't trigger character sprite update from main menu - only maps should handle this
            console.log('Character selection updated, but not triggering sprite update from main menu');
        }
    });
    
    socket.on('avatarUpdated', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            console.log(`Avatar updated for player ${data.playerId}: ${data.avatar}`);
            // Clear the avatar cache for this user to force reload
            userAvatars.delete(data.playerId);
            // Update the waiting room to show the new avatar
            updateWaitingRoom();
        }
    });
    
    socket.on('gameStart', (data) => {
        console.log('Game starting, redirecting to map...');
        console.log('Game start data received:', data);
        
        // Store game data in session storage for the map page
        sessionStorage.setItem('gameData', JSON.stringify(data));
        
        // Store room ID and current player ID for combat system
        sessionStorage.setItem('currentRoomId', data.roomId);
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        sessionStorage.setItem('currentPlayerId', user.username);
        
        // Store character selections from server for multiplayer battles
        if (data.characterSelections) {
            console.log('Storing character selections from server:', data.characterSelections);
            sessionStorage.setItem('roomCharacterSelections', JSON.stringify(data.characterSelections));
        }
        
        console.log('Combat session data stored:', {
            roomId: data.roomId,
            playerId: user.username,
            characterSelections: data.characterSelections
        });
        
        // Redirect to the randomly selected map
        window.location.href = data.selectedMap;
    });
    
    socket.on('roomList', (rooms) => {
        gameRooms = rooms;
        updateRoomList();
    });
}

// Character Selection Functions
let currentPlayer = null;
let selectedCharacter = null;

function initializeCharacterSelection() {
    // Skip initialization if Card mode is active
    if (window.cardModeActive) {
        console.log('Card mode active, skipping character selection initialization');
        return;
    }
    
    const characterModal = document.getElementById('character-modal');
    const characterButtons = document.querySelectorAll('.character-select-btn');
    const characterOptions = document.querySelectorAll('.character-btn');
    const confirmBtn = document.getElementById('confirm-character');
    const cancelBtn = document.getElementById('cancel-character');
    
    // Open modal when character select button is clicked
    characterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Double-check if Card mode became active after initialization
            if (window.cardModeActive) {
                console.log('Card mode active, ignoring character selection click');
                return;
            }
            
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            const playerNumber = btn.dataset.player;
            
            // Check if current room exists and has players (use global currentRoom variable)
            if (!currentRoom || !currentRoom.players || currentRoom.players.length < 2) {
                showMessage('Cần có đủ 2 người chơi mới có thể chọn nhân vật!', true);
                return;
            }
            
            // Check if this is the user's slot
            const playerIndex = parseInt(playerNumber) - 1;
            if (currentRoom.players[playerIndex] && currentRoom.players[playerIndex].name === user.username) {
                currentPlayer = playerNumber;
                showCharacterModal();
            } else {
                showMessage('Bạn chỉ có thể chọn nhân vật cho chính mình!', true);
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
            selectedCharacter = option.dataset.character;
        });
    });
    
    // Handle confirm button
    confirmBtn.addEventListener('click', () => {
        if (selectedCharacter && currentPlayer) {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            
            // Store character selection in room selections for sync
            const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
            roomCharacterSelections[user.username] = selectedCharacter;
            sessionStorage.setItem('roomCharacterSelections', JSON.stringify(roomCharacterSelections));
            
            // Emit character selection to server for real-time sync
            if (socket && currentRoom) {
                socket.emit('characterSelected', {
                    roomId: currentRoom.id,
                    playerId: user.username,
                    playerPosition: currentPlayer,
                    character: selectedCharacter
                });
            }
            
            // Get existing character selections (legacy support)
            const characterSelections = JSON.parse(sessionStorage.getItem('characterSelections') || '{}');
            characterSelections[user.username] = selectedCharacter;
            sessionStorage.setItem('characterSelections', JSON.stringify(characterSelections));
            
            console.log('Character selection saved:', characterSelections);
            
            // Update display
            const selectedDisplay = document.getElementById(`player${currentPlayer}-selected`);
            if (selectedDisplay) {
                selectedDisplay.textContent = selectedCharacter === 'reimu' ? 'Reimu' : 'Marisa';
            }
            
            // Close modal
            characterModal.style.display = 'none';
            showMessage(`Đã chọn nhân vật ${selectedCharacter === 'reimu' ? 'Reimu' : 'Marisa'}!`);
            
            // Reset selection
            currentPlayer = null;
            selectedCharacter = null;
        } else {
            // Don't allow confirmation without character selection
            // No message shown - just prevent confirmation
        }
    });
    
    // Handle cancel button
    cancelBtn.addEventListener('click', () => {
        characterModal.style.display = 'none';
        currentPlayer = null;
        selectedCharacter = null;
    });
    
    // Close modal when clicking outside
    characterModal.addEventListener('click', (e) => {
        if (e.target === characterModal) {
            characterModal.style.display = 'none';
            currentPlayer = null;
            selectedCharacter = null;
        }
    });
    
    // Initialize display based on existing selections
    updateCharacterDisplays();
}

function updateCharacterDisplays() {
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

// Function to enable character selection for Battle mode
function enableCharacterSelection() {
    console.log('=== ENABLING CHARACTER SELECTION FOR BATTLE MODE ===');
    
    // Clear the flag
    window.cardModeActive = false;
    
    // Remove any card mode indicators
    const cardModeIndicator = document.getElementById('card-mode-indicator');
    if (cardModeIndicator) {
        cardModeIndicator.remove();
    }
    
    // Re-enable character selection buttons
    const characterButtons = document.querySelectorAll('.character-select-btn');
    characterButtons.forEach(btn => {
        btn.disabled = false;
        btn.textContent = 'Chọn nhân vật';
        btn.style.cssText = '';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    });
    
    // Show character selection sections
    const characterSelections = document.querySelectorAll('.player-character-selection');
    characterSelections.forEach(selection => {
        selection.style.display = 'block';
    });
    
    // Re-initialize character selection
    initializeCharacterSelection();
    
    console.log('=== CHARACTER SELECTION ENABLED FOR BATTLE MODE ===');
}

// Function to disable character selection for Card mode with AI
function disableCharacterSelection() {
    console.log('=== DISABLING CHARACTER SELECTION FOR CARD MODE ===');
    
    // Force set the flag
    window.cardModeActive = true;
    
    // Wait a bit more for DOM to be fully ready
    setTimeout(() => {
        // Use more aggressive selectors to find all character buttons
        const allCharacterButtons = document.querySelectorAll('button[class*="character-select"], button[id*="char-btn"], .character-select-btn, button[data-player]');
        console.log('Found buttons to disable:', allCharacterButtons.length);
        
        if (allCharacterButtons.length === 0) {
            console.log('No buttons found, trying alternative selectors...');
            const alternativeButtons = document.querySelectorAll('button');
            console.log('All buttons found:', alternativeButtons.length);
            alternativeButtons.forEach((btn, i) => {
                if (btn.textContent.includes('Chọn nhân vật')) {
                    console.log(`Found character button ${i}:`, btn);
                    allCharacterButtons.push(btn);
                }
            });
        }
        
        // Disable all character selection buttons
        allCharacterButtons.forEach((btn, index) => {
            console.log(`Disabling button ${index + 1}:`, btn.id, btn.className, btn.textContent);
            
            // Clone and replace to remove all event listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Apply disable styles
            newBtn.disabled = true;
            newBtn.textContent = 'Không khả dụng';
            newBtn.style.cssText = `
                opacity: 0.3 !important;
                cursor: not-allowed !important;
                background-color: #444 !important;
                pointer-events: none !important;
                color: #888 !important;
                border-color: #444 !important;
            `;
            
            // Remove all event attributes
            newBtn.onclick = null;
            newBtn.onmousedown = null;
            newBtn.onmouseup = null;
            newBtn.addEventListener = () => {};
        });
        
        // Hide all character selection sections
        const characterSelections = document.querySelectorAll('.player-character-selection');
        console.log('Found character selection sections:', characterSelections.length);
        characterSelections.forEach(selection => {
            selection.style.display = 'none';
        });
        
        // Disable character modal
        const characterModal = document.getElementById('character-modal');
        if (characterModal) {
            characterModal.style.display = 'none';
            characterModal.onclick = null;
        }
        
        // Add visual indicator for AI Card mode only
        const waitingRoomContent = document.querySelector('.waiting-room-content');
        if (waitingRoomContent) {
            let cardModeIndicator = document.getElementById('card-mode-indicator');
            if (!cardModeIndicator) {
                cardModeIndicator = document.createElement('div');
                cardModeIndicator.id = 'card-mode-indicator';
                cardModeIndicator.style.cssText = `
                    background: #ff6b35;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 6px;
                    text-align: center;
                    margin: 15px 0;
                    font-weight: bold;
                    font-size: 16px;
                    border: 2px solid #ff8c42;
                    box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3);
                `;
                cardModeIndicator.innerHTML = '🎴 <strong>Chế độ Card AI</strong> - Không cần chọn nhân vật';
                
                // Insert at the very top
                const firstChild = waitingRoomContent.firstChild;
                if (firstChild) {
                    waitingRoomContent.insertBefore(cardModeIndicator, firstChild);
                } else {
                    waitingRoomContent.appendChild(cardModeIndicator);
                }
                console.log('Card mode AI indicator added');
            }
        }
        
        console.log('=== CHARACTER SELECTION DISABLED ===');
    }, 100);
}

// Function to add PvP card mode indicator
function addPvPCardModeIndicator() {
    const waitingRoomContent = document.querySelector('.waiting-room-content');
    if (waitingRoomContent) {
        let cardModeIndicator = document.getElementById('card-mode-indicator');
        if (!cardModeIndicator) {
            cardModeIndicator = document.createElement('div');
            cardModeIndicator.id = 'card-mode-indicator';
            cardModeIndicator.style.cssText = `
                background: #4CAF50;
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                text-align: center;
                margin: 15px 0;
                font-weight: bold;
                font-size: 16px;
                border: 2px solid #66BB6A;
                box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
            `;
            cardModeIndicator.innerHTML = '🎴 <strong>Chế độ Card PvP</strong> - Không cần chọn nhân vật';
            
            // Insert at the very top
            const firstChild = waitingRoomContent.firstChild;
            if (firstChild) {
                waitingRoomContent.insertBefore(cardModeIndicator, firstChild);
            } else {
                waitingRoomContent.appendChild(cardModeIndicator);
            }
            console.log('Card mode PvP indicator added');
        }
    }
}

// Function to show messages to user
function showMessage(message, isError = false) {
    // Create or get existing message element
    let messageElement = document.getElementById('game-message');
    if (!messageElement) {
        messageElement = document.createElement('div');
        messageElement.id = 'game-message';
        messageElement.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            border-radius: 6px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            max-width: 400px;
            text-align: center;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(messageElement);
    }
    
    // Set message style based on type
    messageElement.style.backgroundColor = isError ? '#ff4444' : '#44aa44';
    messageElement.textContent = message;
    messageElement.style.opacity = '1';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        if (messageElement) {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (messageElement && messageElement.parentNode) {
                    messageElement.parentNode.removeChild(messageElement);
                }
            }, 300);
        }
    }, 3000);
}

function showCharacterModal() {
    const modal = document.getElementById('character-modal');
    if (modal) {
        modal.style.display = 'flex';
        selectedCharacter = null;
        
        // Clear previous selections in modal
        const modalButtons = document.querySelectorAll('#character-modal .character-btn');
        modalButtons.forEach(btn => btn.classList.remove('selected'));
    }
}

function hideCharacterModal() {
    const modal = document.getElementById('character-modal');
    if (modal) {
        modal.style.display = 'none';
        currentSelectingPlayer = null;
        selectedCharacterInModal = null;
    }
}

function loadPlayerCharacterSelections() {
    // Load player 1 character
    const player1Character = sessionStorage.getItem('player1Character');
    const displayElement1 = document.getElementById('player1-selected');
    if (displayElement1) {
        if (player1Character) {
            const characterName = player1Character.charAt(0).toUpperCase() + player1Character.slice(1);
            displayElement1.textContent = characterName;
        } else {
            displayElement1.textContent = 'Chưa chọn';
        }
    }
    
    // Load player 2 character
    const player2Character = sessionStorage.getItem('player2Character');
    const displayElement2 = document.getElementById('player2-selected');
    if (displayElement2) {
        if (player2Character) {
            const characterName = player2Character.charAt(0).toUpperCase() + player2Character.slice(1);
            displayElement2.textContent = characterName;
        } else {
            displayElement2.textContent = 'Chưa chọn';
        }
    }
}

window.onload = function() {
    // Prevent multiple onload executions
    if (window.mainMenuLoaded) {
        console.log('Main menu already loaded, skipping');
        return;
    }
    window.mainMenuLoaded = true;
    
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const userData = JSON.parse(user);
    const usernameElement = document.getElementById('username-display');
    if (usernameElement) {
        usernameElement.textContent = userData.username;
    }
    
    initializeSocket();
    
    // Set test avatars for specific users
    setTestAvatars();
    
    // Clear any old character selections on page load
    sessionStorage.removeItem('selectedCharacter');
    sessionStorage.removeItem('gameCharacter');
    sessionStorage.removeItem('characterSelections');
    
    // Initialize character selection (will be skipped if cardModeActive is true)
    initializeCharacterSelection();
    
    // Emit userLogin event to register the user as online
    setTimeout(() => {
        socket.emit('userLogin', userData.username);
    }, 100); // Small delay to ensure socket is connected
    
    const logoMenu = document.getElementById('logo-menu');
    if (logoMenu) {
        logoMenu.classList.add('transition-animation');        
        setTimeout(() => {
            const menuButtons = document.querySelectorAll('.menu-button');
            menuButtons.forEach(button => {
                button.classList.add('animate');
            });
        }, 2000);
    }
};

function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

function openRoomPanel() {
    const roomPanel = document.getElementById('room-creation-panel');
    if (roomPanel) {
        roomPanel.classList.remove('hidden');
    }
}

function closeRoomPanel() {
    const roomPanel = document.getElementById('room-creation-panel');
    if (roomPanel) {
        roomPanel.classList.add('hidden');
    }
}

function openRoomBrowser() {
    const browserPanel = document.getElementById('room-browser-panel');
    if (browserPanel) {
        browserPanel.classList.remove('hidden');
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const usernameElement = document.getElementById('browser-username');
        if (usernameElement && user.username) {
            usernameElement.textContent = user.username;
        }
        
        refreshRoomList();
    }
}

function closeRoomBrowser() {
    const browserPanel = document.getElementById('room-browser-panel');
    if (browserPanel) {
        browserPanel.classList.add('hidden');
    }
}

function refreshRoomList() {
    if (socket) {
        socket.emit('getRoomList');
    }
}

function updateRoomList() {
    const table = document.querySelector('.room-list-table');
    if (!table) return;
    
    // Clear existing content
    table.innerHTML = '';
    
    // Create header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Ghi chú</th>
            <th>Mode</th>
            <th>Chủ phòng</th>
            <th>Loại trận</th>
            <th>Trạng thái</th>
            <th>Người chơi</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    tbody.id = 'room-list-body';
    
    gameRooms.forEach(room => {
        const row = document.createElement('tr');
        row.className = 'room-row';
        row.setAttribute('data-room-id', room.id);
        
        const statusText = room.status; // Remove icon, just show text
        const playerCount = `${room.players.length}/${room.maxPlayers}`;
        
        row.innerHTML = `
            <td>${room.note}</td>
            <td>${room.mode || 'Card'}</td>
            <td>${room.host}</td>
            <td>${room.type}</td>
            <td>${statusText}</td>
            <td>${playerCount}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    
}

function joinSelectedRoom() {
    const selectedRow = document.querySelector('.room-row.selected');
    if (!selectedRow) {
        alert('Vui lòng chọn một phòng để vào!');
        return;
    }
    
    const roomId = selectedRow.getAttribute('data-room-id');
    const room = gameRooms.find(r => r.id === roomId);
    
    if (!room) {
        alert('Phòng không tồn tại!');
        return;
    }
    
    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
        alert('Phòng đã đầy!');
        return;
    }
    
    let enteredPassword = '';
    
    // Check if room requires password
    if (room.status === 'Khóa') {
        enteredPassword = prompt('Nhập mật khẩu phòng:');
        if (enteredPassword === null) {
            // User cancelled the prompt
            return;
        }
    }
    
    // Join room via socket - let server validate password
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (socket) {
        socket.emit('joinRoom', {
            roomId: roomId,
            player: {
                id: user.username,
                name: user.username,
                ready: false,
                avatar: currentUserAvatar // Include current user's avatar
            },
            password: enteredPassword
        });
    }
}

function createRoom() {
    debug('Creating room...');
    
    const type = document.querySelector('.type-select').value;
    const mode = document.querySelector('.mode-select').value;
    const duelNote = document.querySelector('.duel-note-input').value.trim();
    const duelPassword = document.querySelector('.duel-password-input').value.trim();
    
    // Get selected duel types
    const selectedTypes = [];
    const typeCheckboxes = document.querySelectorAll('input[name="duel-type"]:checked');
    typeCheckboxes.forEach(checkbox => {
        selectedTypes.push(checkbox.value);
    });
    
    // If no types selected, default to "Công khai"
    if (selectedTypes.length === 0) {
        selectedTypes.push('Công khai');
        debug('No types selected, defaulting to Công khai');
    }
    
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const roomId = 'room_' + Date.now();
    
    const roomData = {
        id: roomId,
        type: type === 'single' ? 'Đánh với máy' : 'Đánh với người',
        gameMode: type === 'single' ? 'single' : 'match',
        mode: mode === 'battle' ? 'Battle' : (mode || 'Card'), // Ensure Battle mode is capitalized
        host: user.username || 'Unknown',
        note: duelNote || 'Không có ghi chú',
        password: duelPassword,
        status: selectedTypes[0], // 'Khóa' or 'Công khai'
        maxPlayers: 2,
        players: [{
            id: user.username,
            name: user.username,
            ready: false,
            avatar: currentUserAvatar // Include current user's avatar
        }],
        created: new Date()
    };
    
    debug('Creating room with data:', roomData);
    debug('Password field:', duelPassword);
    debug('Status:', selectedTypes[0]);
    
    // Create room via socket
    if (socket) {
        socket.emit('createRoom', roomData);
        debug('Room creation request sent');
    }
    
    // Close creation panel smoothly
    setTimeout(() => {
        closeRoomPanel();
        
        // Clear form after panel is closed
        setTimeout(() => {
            const noteInput = document.querySelector('.duel-note-input');
            const passwordInput = document.querySelector('.duel-password-input');
            if (noteInput) noteInput.value = '';
            if (passwordInput) passwordInput.value = '';
            
            // Reset radio buttons to default (Công khai)
            const radioButtons = document.querySelectorAll('input[name="duel-type"]');
            radioButtons.forEach(radio => {
                // Temporarily enable to change programmatically
                radio.disabled = false;
                radio.checked = (radio.value === 'Công khai');
                // Re-disable to prevent manual interaction
                radio.disabled = true;
            });
        }, 100);
    }, 50);
}

// Waiting Room functions
function openWaitingRoom(roomData) {
    console.log('=== OPENING WAITING ROOM ===');
    console.log('Room data received:', roomData);
    
    currentRoom = roomData;
    
    const waitingPanel = document.getElementById('waiting-room-panel');
    if (waitingPanel) {
        waitingPanel.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = roomData.note || 'Phòng chờ';
        document.getElementById('room-host-display').textContent = roomData.host;
        document.getElementById('room-type-display').textContent = roomData.type;
        
        // Debug all room properties
        console.log('Room properties check:');
        console.log('- gameMode:', roomData.gameMode);
        console.log('- mode:', roomData.mode);
        console.log('- type:', roomData.type);
        
        // Check if this is Card mode - set flag BEFORE updating UI
        const isCardModeAI = roomData.gameMode === 'single' && roomData.mode?.toLowerCase() === 'card';
        const isCardModePvP = roomData.gameMode === 'match' && roomData.mode?.toLowerCase() === 'card';
        const isBattleMode = roomData.mode?.toLowerCase() === 'battle';
        
        console.log('Card mode AI check:', isCardModeAI);
        console.log('Card mode PvP check:', isCardModePvP);
        console.log('Battle mode check:', isBattleMode);
        
        if (isCardModeAI) {
            window.cardModeActive = true;
            console.log('=== CARD MODE WITH AI DETECTED ===');
            console.log('Setting cardModeActive = true');
        } else if (isCardModePvP) {
            console.log('=== CARD MODE PVP DETECTED ===');
            // Set flag for PvP card game but stay in waiting room
            window.cardModePvP = true;
            // Add PvP card mode indicator
            setTimeout(() => {
                addPvPCardModeIndicator();
            }, 500);
        } else if (isBattleMode) {
            console.log('=== BATTLE MODE DETECTED ===');
            // Battle mode should allow character selection
            window.cardModeActive = false;
            window.cardModePvP = false;
        }
        
        updateWaitingRoom();
        
        // Only disable character selection for Card modes, NOT Battle mode
        if (isCardModeAI || isCardModePvP) {
            console.log('Scheduling character selection disable for card mode...');
            setTimeout(() => {
                console.log('Executing disableCharacterSelection for card mode...');
                disableCharacterSelection();
            }, 500);
        } else if (isBattleMode) {
            console.log('Battle mode detected - ensuring character selection is enabled');
            // Ensure character selection is enabled for battle mode
            window.cardModeActive = false;
            setTimeout(() => {
                enableCharacterSelection();
            }, 500);
        }
    } else {
        console.log('Waiting panel not found!');
    }
}

function closeWaitingRoom() {
    const waitingPanel = document.getElementById('waiting-room-panel');
    if (waitingPanel) {
        waitingPanel.classList.add('hidden');
        
        // Leave room via socket
        if (socket && currentRoom) {
            socket.emit('leaveRoom', {
                roomId: currentRoom.id,
                playerId: JSON.parse(sessionStorage.getItem('user') || '{}').username
            });
        }
        
        // Clear room data
        currentRoom = null;
        sessionStorage.removeItem('currentRoom');
        sessionStorage.removeItem('currentRoomId');
        
        // Reset Card mode flag and cleanup
        window.cardModeActive = false;
        
        // Remove card mode indicator if it exists
        const cardModeIndicator = document.getElementById('card-mode-indicator');
        if (cardModeIndicator) {
            cardModeIndicator.remove();
        }
        
        // Re-enable character selection for other modes
        const allCharacterButtons = document.querySelectorAll('button[id*="char-btn"], .character-select-btn');
        allCharacterButtons.forEach(btn => {
            btn.disabled = false;
            btn.textContent = 'Chọn nhân vật';
            btn.style.cssText = '';
            btn.onclick = null;
        });
        
        // Show character selection sections again
        const characterSelections = document.querySelectorAll('.player-character-selection');
        characterSelections.forEach(selection => {
            selection.style.display = '';
        });
    }
}

// Function to generate avatar for user
async function generateAvatar(username) {
    // Use current user's selected avatar if it's the current user
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (username === user.username && currentUserAvatar) {
        return currentUserAvatar;
    }
    
    // Fetch avatar for other users
    return await fetchUserAvatar(username);
}

// Function to set player avatar
async function setPlayerAvatar(playerIndex, username) {
    console.log(`Setting avatar for player ${playerIndex}, username: ${username}`);
    
    const avatarImg = document.getElementById(`player${playerIndex}-avatar-img`);
    const placeholder = document.getElementById(`player${playerIndex}-placeholder`);
    
    if (!avatarImg || !placeholder) {
        console.error(`Avatar elements not found for player ${playerIndex}`);
        return;
    }
    
    if (username && username !== 'Đang chờ...') {
        console.log(`Loading avatar for user: ${username}`);
        const avatarUrl = await generateAvatar(username);
        console.log(`Avatar URL for ${username}: ${avatarUrl}`);
        
        avatarImg.src = avatarUrl;
        avatarImg.style.display = 'block';
        placeholder.style.display = 'none';
        
        // Fallback to placeholder if image fails to load
        avatarImg.onerror = function() {
            console.error(`Failed to load avatar image: ${avatarUrl}`);
            avatarImg.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.textContent = username.substring(0, 2).toUpperCase();
        };
        
        avatarImg.onload = function() {
            console.log(`Avatar loaded successfully for ${username}: ${avatarUrl}`);
        };
    } else {
        console.log(`No username provided for player ${playerIndex}, showing placeholder`);
        avatarImg.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.textContent = `P${playerIndex}`;
    }
}

function updateWaitingRoom() {
    if (!currentRoom) return;
    
    const players = currentRoom.players || [];
    console.log('Updating waiting room with players:', players);
    
    // Update player count display
    const playerCountDisplay = document.getElementById('player-count-display');
    if (playerCountDisplay) {
        playerCountDisplay.textContent = `Người chơi (${players.length}/${currentRoom.maxPlayers || 2})`;
    }
    
    // Clear avatar cache to force reload of avatars
    userAvatars.clear();
    
    // Update player slots
    for (let i = 0; i < 2; i++) {
        const player = players[i];
        const nameElement = document.getElementById(`player${i + 1}-name`);
        const statusElement = document.getElementById(`player${i + 1}-status`);
        
        if (player) {
            console.log(`Setting up player ${i + 1}:`, player);
            nameElement.textContent = player.name;
            statusElement.textContent = player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng';
            statusElement.className = player.ready ? 'player-status ready' : 'player-status';
            
            // Set player avatar
            setPlayerAvatar(i + 1, player.name);
        } else {
            console.log(`No player for slot ${i + 1}`);
            nameElement.textContent = 'Đang chờ...';
            statusElement.textContent = 'Chưa sẵn sàng';
            statusElement.className = 'player-status';
            
            // Reset avatar to placeholder
            setPlayerAvatar(i + 1, null);
        }
    }
    
    // Update character displays (skip for Card mode with AI)
    if (!(currentRoom.gameMode === 'single' && currentRoom.mode === 'Card')) {
        updateCharacterDisplays();
    }
    
    // Update ready button
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const currentPlayer = players.find(p => p.id === user.username);
    const readyBtn = document.getElementById('ready-btn');
    
    if (readyBtn && currentPlayer) {
        // For Card mode with AI, change button text and behavior
        if (currentRoom.gameMode === 'single' && currentRoom.mode === 'Card') {
            readyBtn.textContent = 'Bắt đầu chơi';
            readyBtn.className = 'ready-btn';
            
            // Re-disable character selection after UI update
            setTimeout(() => {
                disableCharacterSelection();
            }, 50);
        } else {
            readyBtn.textContent = currentPlayer.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng';
            readyBtn.className = currentPlayer.ready ? 'ready-btn not-ready' : 'ready-btn';
        }
    }
    
    // Check if both players are ready (skip for Card mode with AI)
    if (!(currentRoom.gameMode === 'single' && currentRoom.mode === 'Card')) {
        if (players.length === 2 && players.every(p => p.ready)) {
            // Check if this is PvP Card mode
            if (currentRoom.gameMode === 'match' && currentRoom.mode?.toLowerCase() === 'card') {
                // Redirect to PvP card game
                setTimeout(() => {
                    window.location.href = `/gamePVP.html?roomId=${currentRoom.id}`;
                }, 1000);
            } else if (currentRoom.gameMode !== 'single' || currentRoom.mode !== 'Card') {
                // Regular game start for non-card modes
                setTimeout(() => {
                    if (socket && currentRoom) {
                        socket.emit('startGame', {
                            roomId: currentRoom.id
                        });
                    }
                }, 1000);
            }
        }
    }
}

function updatePlayerStatus(playerId, ready) {
    if (!currentRoom) return;
    
    const player = currentRoom.players.find(p => p.id === playerId);
    if (player) {
        player.ready = ready;
        updateWaitingRoom();
    }
}

function toggleReady() {
    if (!socket || !currentRoom) return;
    
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const currentPlayer = currentRoom.players.find(p => p.id === user.username);
    
    if (currentPlayer) {
        // Check if this is PvP Card mode first
        const isCardModePvP = currentRoom.gameMode === 'match' && currentRoom.mode?.toLowerCase() === 'card';
        
        if (isCardModePvP || window.cardModePvP) {
            console.log('PvP Card mode detected - using normal ready system');
            // For PvP card mode, use normal playerReady system but skip character check
            const newReadyState = !currentPlayer.ready;
            socket.emit('playerReady', {
                roomId: currentRoom.id,
                playerId: user.username,
                ready: newReadyState
            });
            return;
        }
        
        // For Card mode with AI, skip character selection requirement
        const isCardModeAI = currentRoom.gameMode === 'single' && currentRoom.mode === 'Card';
        const isAIMode = currentRoom.type === 'Đánh với máy';
        
        if (isCardModeAI || isAIMode || window.cardModeActive) {
            console.log('AI Card mode detected in toggleReady, redirecting to gameAI.html...');
            
            // Store game data for AI battle
            const gameData = {
                roomId: currentRoom.id,
                gameMode: 'card',
                isAI: true,
                players: currentRoom.players
            };
            sessionStorage.setItem('gameData', JSON.stringify(gameData));
            sessionStorage.setItem('currentRoomId', currentRoom.id);
            sessionStorage.setItem('currentPlayerId', user.username);
            sessionStorage.setItem('matchMode', 'ai');
            
            // Direct redirect to gameAI.html for AI Card battles
            window.location.href = 'gameAI.html';
            return;
        }
        
        // For Battle mode, allow ready without character selection requirement
        // Character selection is optional and will default if not selected
        
        const newReadyState = !currentPlayer.ready;
        socket.emit('playerReady', {
            roomId: currentRoom.id,
            playerId: user.username,
            ready: newReadyState
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const roomBtn = document.querySelector('.room-btn');
    const deckBtn = document.querySelector('.deck-btn');
    const myProfileBtn = document.querySelector('.my-profile-btn');
    const exitBtn = document.querySelector('.exit-btn');
    const settingsBtn = document.querySelector('.settings-btn');
    const closeRoomBtn = document.querySelector('.close-room-panel');
    const hostDuelBtn = document.querySelector('.host-duel-btn');
    const roomPanelOverlay = document.querySelector('.room-panel-overlay');
    const closeWaitingRoomBtn = document.querySelector('.close-waiting-room');
    const leaveRoomBtn = document.querySelector('.leave-room-btn');
    const readyBtn = document.getElementById('ready-btn');
    const waitingRoomOverlay = document.querySelector('.waiting-room-overlay');
    const refreshRoomsBtn = document.querySelector('.refresh-rooms-btn');
    const joinRoomBtn = document.querySelector('.join-room-btn');
    const cancelBrowserBtn = document.querySelector('.cancel-browser-btn');
    const roomBrowserOverlay = document.querySelector('.room-browser-overlay');
    const hostRoomBtn = document.querySelector('.host-room-btn');
    
    if (roomBtn) {
        roomBtn.onclick = function() {
            openRoomBrowser();
        };
    }
    
    if (deckBtn) {
        deckBtn.onclick = function() {
            // Play select sound effect
            if (window.sfxManager) {
                window.sfxManager.playSelect();
            }
            // Open deck builder modal
            openDeckBuilder();
        };
    }
    
    if (myProfileBtn) {
        myProfileBtn.onclick = function() {
            openProfile(); // Open current user's profile
        };
    }
    
    if (exitBtn) {
        exitBtn.onclick = function() {
            logout();
        };
    }
    
    if (settingsBtn) {
        settingsBtn.onclick = function() {
            if (window.__openSettingsOverlay) {
                window.__openSettingsOverlay();
            }
        };
    }
    
    if (closeRoomBtn) {
        closeRoomBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeRoomPanel();
        };
    }
    
    if (hostDuelBtn) {
        hostDuelBtn.onclick = function(e) {
            e.preventDefault();
            
            if (hostDuelBtn.disabled) return;
            
            hostDuelBtn.disabled = true;
            hostDuelBtn.textContent = 'Đang tạo...';
            
            setTimeout(() => {
                createRoom();
                setTimeout(() => {
                    hostDuelBtn.disabled = false;
                    hostDuelBtn.textContent = 'Tạo phòng';
                }, 500);
            }, 50);
        };
    }
    
    if (roomPanelOverlay) {
        roomPanelOverlay.onclick = function(e) {
            // Only close if clicking on the overlay itself, not its children
            if (e.target === roomPanelOverlay) {
                closeRoomPanel();
            }
        };
    }
    
    if (closeWaitingRoomBtn) {
        closeWaitingRoomBtn.onclick = closeWaitingRoom;
    }
    
    if (leaveRoomBtn) {
        leaveRoomBtn.onclick = closeWaitingRoom;
    }
    
    if (readyBtn) {
        readyBtn.onclick = toggleReady;
    }
    
    if (waitingRoomOverlay) {
        waitingRoomOverlay.onclick = closeWaitingRoom;
    }
    
    if (refreshRoomsBtn) {
        refreshRoomsBtn.onclick = refreshRoomList;
    }
    
    if (joinRoomBtn) {
        joinRoomBtn.onclick = joinSelectedRoom;
    }
    
    if (cancelBrowserBtn) {
        cancelBrowserBtn.onclick = closeRoomBrowser;
    }
    
    if (roomBrowserOverlay) {
        roomBrowserOverlay.onclick = closeRoomBrowser;
    }
    
    if (hostRoomBtn) {
        hostRoomBtn.onclick = function() {
            openRoomPanel();
        };
    }
    
    // Deck Builder Modal Event Listeners
    const closeDeckBuilderBtn = document.querySelector('.close-deck-builder');
    const deckBuilderOverlay = document.querySelector('.deck-builder-overlay');
    
    if (closeDeckBuilderBtn) {
        closeDeckBuilderBtn.onclick = function() {
            closeDeckBuilder();
        };
    }
    
    // Remove click outside to close for fullscreen modal
    
    document.addEventListener('click', function(e) {
        if (e.target.closest('.room-row')) {
            document.querySelectorAll('.room-row').forEach(row => {
                row.classList.remove('selected');
            });
            
            e.target.closest('.room-row').classList.add('selected');

            if (joinRoomBtn) {
                joinRoomBtn.disabled = false;
            }
        }
    });
    
    const searchInput = document.querySelector('.room-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const rows = document.querySelectorAll('.room-row');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
    
    const roomInputs = document.querySelectorAll('.duel-note-input, .duel-password-input');
    roomInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                createRoom();
            }
        });
    });
    
    const passwordInput = document.querySelector('.duel-password-input');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const hasPassword = this.value.trim().length > 0;
            const radioButtons = document.querySelectorAll('input[name="duel-type"]');
            
            radioButtons.forEach(radio => {
                radio.disabled = false;
                
                if (hasPassword) {
                    radio.checked = (radio.value === 'Khóa');
                } else {
                    radio.checked = (radio.value === 'Công khai');
                }

                radio.disabled = true;
            });
            
            debug('Password input changed, auto-selected:', hasPassword ? 'Khóa' : 'Công khai');
        });

        passwordInput.addEventListener('paste', function() {
            setTimeout(() => {
                const hasPassword = this.value.trim().length > 0;
                const radioButtons = document.querySelectorAll('input[name="duel-type"]');
                
                radioButtons.forEach(radio => {
                    radio.disabled = false;
                    
                    if (hasPassword) {
                        radio.checked = (radio.value === 'Khóa');
                    } else {
                        radio.checked = (radio.value === 'Công khai');
                    }

                    radio.disabled = true;
                });
                
                debug('Password pasted, auto-selected:', hasPassword ? 'Khóa' : 'Công khai');
            }, 10);
        });
    }
});

// Profile viewer functions
function openProfile(username = null) {
    const profileViewer = document.getElementById('profile-viewer');
    if (profileViewer) {
        profileViewer.style.display = 'flex';
        
        // Add click-outside-to-close functionality
        profileViewer.onclick = function(e) {
            // Only close if clicking on the profile-viewer background, not on the profile container
            if (e.target === profileViewer) {
                closeProfile();
            }
        };
        
        // Add avatar click handler when profile opens
        setTimeout(() => {
            const profileAvatar = document.getElementById('profile-avatar-img');
            const avatarContainer = document.querySelector('.avatar-container');
            
            if (profileAvatar) {
                profileAvatar.onclick = openAvatarSelector;
                console.log('Profile avatar click handler added in openProfile'); // Debug log
            }
            
            // Backup: Add click to container as well
            if (avatarContainer) {
                avatarContainer.onclick = openAvatarSelector;
                avatarContainer.style.cursor = 'pointer';
                console.log('Avatar container click handler added'); // Debug log
            }
        }, 100); // Small delay to ensure DOM is ready
        
        if (username) {
            loadUserProfile(username);
        } else {
            // Load current user's profile
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            if (user.username) {
                loadUserProfile(user.username);
            }
        }
    }
}

function closeProfile() {
    const profileViewer = document.getElementById('profile-viewer');
    if (profileViewer) {
        // Remove the click event listener
        profileViewer.onclick = null;
        profileViewer.style.display = 'none';
    }
}

// Debounce function để tránh spam API
let searchTimeout;

async function searchUserProfile() {
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Debounce 500ms
    searchTimeout = setTimeout(async () => {
        const searchInput = document.getElementById('profile-search-input');
        const username = searchInput.value.trim();
        
        if (!username) {
            alert('Vui lòng nhập tên người dùng!');
            return;
        }

        try {
            const response = await fetch('/api/user-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });

            const data = await response.json();

        if (data.success) {
            loadUserProfile(username, data.user);
        } else {
            alert(data.message || 'Không tìm thấy người dùng!');
        }
    } catch (error) {
        console.error('Search profile error:', error);
        alert('Lỗi khi tìm kiếm người dùng!');
    }
    }, 500); // Debounce delay
}

function loadUserProfile(username, userData = null) {
    // Update username display
    const usernameDisplay = document.getElementById('profile-username-text');
    if (usernameDisplay) {
        usernameDisplay.textContent = username;
    }

    if (userData) {
        // Update status
        const statusElement = document.getElementById('profile-status');
        if (statusElement) {
            statusElement.textContent = userData.isOnline ? 'Online' : 'Offline';
            statusElement.style.color = userData.isOnline ? '#00ff88' : '#ff6b6b';
        }

        // Update last seen
        const lastSeenElement = document.getElementById('profile-last-seen');
        if (lastSeenElement) {
            lastSeenElement.textContent = userData.isOnline ? 'Now' : formatDate(userData.lastSeen);
        }

        // Update registration date
        const registeredElement = document.getElementById('profile-registered');
        if (registeredElement) {
            registeredElement.textContent = formatDate(userData.registeredAt);
        }

        // Update stats
        updateProfileStats(userData.stats || {});
    } else {
        // Default values for current user
        updateDefaultProfileInfo();
    }

    // Clear search input
    const searchInput = document.getElementById('profile-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
}

function updateProfileStats(stats) {
    // AI stats
    const aiWins = document.getElementById('ai-wins');
    const aiLosses = document.getElementById('ai-losses');
    const aiDraws = document.getElementById('ai-draws');

    if (aiWins) aiWins.textContent = stats.aiWins || '0';
    if (aiLosses) aiLosses.textContent = stats.aiLosses || '0';
    if (aiDraws) aiDraws.textContent = stats.aiDraws || '0';

    // Online stats
    const onlineWins = document.getElementById('online-wins');
    const onlineLosses = document.getElementById('online-losses');
    const onlineDraws = document.getElementById('online-draws');

    if (onlineWins) onlineWins.textContent = stats.onlineWins || '0';
    if (onlineLosses) onlineLosses.textContent = stats.onlineLosses || '0';
    if (onlineDraws) onlineDraws.textContent = stats.onlineDraws || '0';
}

function updateDefaultProfileInfo() {
    // Set default online status for current user
    const statusElement = document.getElementById('profile-status');
    if (statusElement) {
        statusElement.textContent = 'Online';
        statusElement.style.color = '#00ff88';
    }

    const lastSeenElement = document.getElementById('profile-last-seen');
    if (lastSeenElement) {
        lastSeenElement.textContent = 'Now';
    }

    // Try to get registration date from session or use placeholder
    const registeredElement = document.getElementById('profile-registered');
    if (registeredElement) {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.registeredAt) {
            registeredElement.textContent = formatDate(user.registeredAt);
        } else {
            registeredElement.textContent = 'Unknown';
        }
    }

    // Use default stats
    updateProfileStats({});
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (error) {
        return 'Unknown';
    }
}

// Setup profile viewer event handlers
document.addEventListener('DOMContentLoaded', function() {
    const closeProfileBtn = document.getElementById('close-profile');
    const searchProfileBtn = document.getElementById('search-profile-btn');
    const profileSearchInput = document.getElementById('profile-search-input');

    if (closeProfileBtn) {
        closeProfileBtn.onclick = closeProfile;
    }

    if (searchProfileBtn) {
        searchProfileBtn.onclick = searchUserProfile;
    }

    if (profileSearchInput) {
        profileSearchInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                searchUserProfile();
            }
        };
    }
});

// Avatar Selector Functions
let currentUserAvatar = '/DesignHud/reimu2.png'; // Default avatar
let userAvatars = new Map(); // Cache for other users' avatars

async function fetchUserAvatar(username) {
    // Check cache first
    if (userAvatars.has(username)) {
        console.log(`Avatar cache hit for ${username}:`, userAvatars.get(username));
        return userAvatars.get(username);
    }
    
    // Check if we're in a room and the user has an avatar in room data
    if (currentRoom) {
        const player = currentRoom.players.find(p => p.id === username);
        if (player && player.avatar) {
            console.log(`Found avatar in room data for ${username}:`, player.avatar);
            userAvatars.set(username, player.avatar);
            return player.avatar;
        }
    }
    
    try {
        console.log(`Fetching avatar for user: ${username}`);
        const response = await fetch(`/api/profile/${username}`);
        const data = await response.json();
        
        console.log(`API response for ${username}:`, data);
        
        if (data.success && data.profile.avatar) {
            userAvatars.set(username, data.profile.avatar);
            console.log(`Avatar set for ${username}:`, data.profile.avatar);
            return data.profile.avatar;
        }
    } catch (error) {
        console.error('Error fetching user avatar:', error);
    }
    
    // Fallback to default
    const defaultAvatar = '/DesignHud/reimu2.png';
    userAvatars.set(username, defaultAvatar);
    console.log(`Using default avatar for ${username}:`, defaultAvatar);
    return defaultAvatar;
}

function openAvatarSelector() {
    console.log('openAvatarSelector called'); // Debug log
    const avatarSelector = document.getElementById('avatar-selector');
    console.log('Avatar selector element:', avatarSelector); // Debug log
    
    if (avatarSelector) {
        avatarSelector.style.display = 'flex';
        console.log('Avatar selector displayed'); // Debug log
        
        // Mark current avatar as selected
        const avatarOptions = document.querySelectorAll('.avatar-option');
        avatarOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.avatar === currentUserAvatar) {
                option.classList.add('selected');
            }
        });
    } else {
        console.log('Avatar selector element not found!'); // Debug log
    }
}

function closeAvatarSelector() {
    const avatarSelector = document.getElementById('avatar-selector');
    if (avatarSelector) {
        avatarSelector.style.display = 'none';
    }
}

async function selectAvatar(avatarPath) {
    currentUserAvatar = avatarPath;
    
    // Update profile avatar
    const profileAvatar = document.getElementById('profile-avatar-img');
    if (profileAvatar) {
        profileAvatar.src = avatarPath;
    }
    
    // Save avatar to server
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username) {
        try {
            await fetch('/api/update-avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    username: user.username, 
                    avatar: avatarPath 
                })
            });
            
            // Update cache
            userAvatars.set(user.username, avatarPath);
            console.log('Avatar saved to server:', avatarPath);
            
            // Broadcast avatar update to other players in the room
            if (currentRoom && socket) {
                socket.emit('avatarUpdate', {
                    roomId: currentRoom.id,
                    playerId: user.username,
                    avatar: avatarPath
                });
                console.log('Avatar update broadcasted to room:', currentRoom.id);
            }
        } catch (error) {
            console.error('Error saving avatar:', error);
        }
    }
    
    // Update current user's avatar in waiting room if they're in a room
    if (currentRoom && user.username) {
        const player = currentRoom.players.find(p => p.id === user.username);
        if (player) {
            const playerIndex = currentRoom.players.indexOf(player) + 1;
            await setPlayerAvatar(playerIndex, user.username);
        }
    }
    
    // Store avatar preference in sessionStorage
    sessionStorage.setItem('userAvatar', avatarPath);
    
    closeAvatarSelector();
}

// Function to set test avatars for specific users (local implementation)
async function setTestAvatars() {
    try {
        // Set predefined avatars for test users locally
        const testAvatars = {
            'thienmm': 'https://i.pravatar.cc/150?img=1',
            'thiendz': 'https://i.pravatar.cc/150?img=2',
            'testuser1': 'https://i.pravatar.cc/150?img=3',
            'testuser2': 'https://i.pravatar.cc/150?img=4'
        };
        
        // Store test avatars in local cache
        Object.entries(testAvatars).forEach(([username, avatarUrl]) => {
            userAvatars.set(username, avatarUrl);
        });
        
        console.log('Test avatars set successfully locally');
    } catch (error) {
        console.error('Error setting test avatars:', error);
    }
}

// Initialize avatar selector event handlers
document.addEventListener('DOMContentLoaded', function() {
    // Load saved avatar preference
    const savedAvatar = sessionStorage.getItem('userAvatar');
    if (savedAvatar) {
        currentUserAvatar = savedAvatar;
        const profileAvatar = document.getElementById('profile-avatar-img');
        if (profileAvatar) {
            profileAvatar.src = savedAvatar;
        }
    }
    
    // Profile avatar click handler
    const profileAvatar = document.getElementById('profile-avatar-img');
    if (profileAvatar) {
        profileAvatar.onclick = openAvatarSelector;
        console.log('Profile avatar click handler added'); // Debug log
    }
    
    // Close avatar selector on background click
    const avatarSelectorBackground = document.querySelector('.avatar-selector-background');
    if (avatarSelectorBackground) {
        avatarSelectorBackground.onclick = closeAvatarSelector;
    }
    
    // Prevent closing when clicking inside the container
    const avatarSelectorContainer = document.querySelector('.avatar-selector-container');
    if (avatarSelectorContainer) {
        avatarSelectorContainer.onclick = function(e) {
            e.stopPropagation(); // Ngăn event bubble lên background
        };
    }
    
    // Also allow clicking on the modal itself to close
    const avatarSelector = document.getElementById('avatar-selector');
    if (avatarSelector) {
        avatarSelector.onclick = function(e) {
            if (e.target === avatarSelector) {
                closeAvatarSelector();
            }
        };
    }
    
    // Avatar option click handlers
    const avatarOptions = document.querySelectorAll('.avatar-option');
    avatarOptions.forEach(option => {
        option.onclick = function() {
            selectAvatar(this.dataset.avatar);
        };
    });
});

// ===== DECK BUILDER FUNCTIONALITY =====
const deckBuilderRules = { HP_START:100, TURN_LIMIT:10, TURN_SECONDS:20, HAND_SIZE:5, DECK_MAX:15, TYPE_LIMIT:6 };
let deckList = [];

function openDeckBuilder() {
    const modal = document.getElementById('deck-builder-modal');
    if (modal) {
        modal.style.display = 'flex';
        initializeDeckBuilder();
    }
}

function closeDeckBuilder() {
    // Play cancel sound effect
    if (window.sfxManager) {
        window.sfxManager.playCancel();
    }
    
    const modal = document.getElementById('deck-builder-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function initializeDeckBuilder() {
    const $ = id => document.getElementById(id);
    
    // Initialize deck builder elements
    const submitBtn = $("submit-deck");
    const countTypes = arr => arr.reduce((a,t) => (a[t]++,a), {attack:0,defend:0,heal:0,curse:0});
    
    function refreshDeckUI() {
        const c = countTypes(deckList);
        $("cnt-attack").textContent = c.attack;
        $("cnt-defend").textContent = c.defend;
        $("cnt-heal").textContent = c.heal;
        $("cnt-curse").textContent = c.curse;
        $("deck-list").textContent = deckList.join(", ");
        
        // Render deck cards
        const deckDrop = $("deck-drop");
        deckDrop.innerHTML = "";
        deckList.forEach((type, idx) => {
            const card = document.createElement("div");
            card.className = "cardbtn";
            card.setAttribute("data-type", type);
            card.setAttribute("draggable", "true");
            card.title = type.charAt(0).toUpperCase() + type.slice(1);
            card.ondragstart = e => {
                e.dataTransfer.setData("text/plain", idx);
                e.dataTransfer.effectAllowed = "move";
            };
            card.ondragend = e => {
                if (e.dataTransfer.dropEffect === "none") {
                    deckList.splice(idx, 1);
                    refreshDeckUI();
                }
            };
            deckDrop.appendChild(card);
        });
        
        // Update submit button
        const remain = deckBuilderRules.DECK_MAX - deckList.length;
        submitBtn.disabled = remain !== 0;
        submitBtn.textContent = remain === 0
            ? "Xác nhận Deck (15/15)"
            : `Thêm ${remain} lá nữa (${deckList.length}/15)`;
        updateDeckListSelect();
    }
    
    // Drag & drop functionality
    const deckDrop = $("deck-drop");
    deckDrop.ondragover = e => { e.preventDefault(); deckDrop.style.background = "#232b3e33"; };
    deckDrop.ondragleave = e => { deckDrop.style.background = ""; };
    deckDrop.ondrop = e => {
        e.preventDefault();
        deckDrop.style.background = "";
        const type = e.dataTransfer.getData("card-type");
        if (type) {
            const c = countTypes(deckList);
            if (deckList.length >= deckBuilderRules.DECK_MAX) return alert("Đạt tối đa 15 lá.");
            if (c[type] >= deckBuilderRules.TYPE_LIMIT) return alert("Mỗi loại tối đa 6 lá.");
            deckList.push(type);
            refreshDeckUI();
        }
    };
    
    // Card samples drag functionality
    document.querySelectorAll("#card-samples .cardbtn").forEach(btn => {
        btn.ondragstart = e => {
            e.dataTransfer.setData("card-type", btn.getAttribute("data-type"));
            e.dataTransfer.effectAllowed = "copy";
        };
    });
    
    // Deck storage functions
    function getSavedDecks() {
        return JSON.parse(localStorage.getItem('savedDecks') || '{}');
    }
    
    function saveDeck(name, list) {
        if (!name) return alert('Vui lòng nhập tên deck!');
        const decks = getSavedDecks();
        decks[name] = list.slice();
        localStorage.setItem('savedDecks', JSON.stringify(decks));
        updateDeckListSelect();
        alert('Đã lưu deck!');
    }
    
    function deleteDeck(name) {
        const decks = getSavedDecks();
        if (decks[name]) { 
            delete decks[name]; 
            localStorage.setItem('savedDecks', JSON.stringify(decks)); 
        }
        updateDeckListSelect();
    }
    
    function updateDeckListSelect() {
        const decks = getSavedDecks();
        const sel = $("deck-list-select");
        const cur = sel.value;
        sel.innerHTML = '';
        Object.keys(decks).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; 
            opt.textContent = name;
            sel.appendChild(opt);
        });
        if (cur && decks[cur]) sel.value = cur;
    }
    
    // Button event listeners
    $("save-deck").onclick = () => {
        const name = $("deck-name").value.trim();
        if (!name) return alert('Vui lòng nhập tên deck!');
        if (deckList.length !== deckBuilderRules.DECK_MAX) return alert('Deck phải đủ 15 lá!');
        saveDeck(name, deckList);
    };
    
    $("load-deck").onclick = () => {
        const sel = $("deck-list-select");
        const decks = getSavedDecks();
        const name = sel.value;
        if (decks[name]) {
            deckList = decks[name].slice();
            $("deck-name").value = name;
            refreshDeckUI();
        }
    };
    
    $("delete-deck").onclick = () => {
        const sel = $("deck-list-select");
        const name = sel.value;
        if (name && confirm('Xóa deck này?')) deleteDeck(name);
    };
    
    $("new-deck").onclick = () => {
        deckList = [];
        $("deck-name").value = '';
        refreshDeckUI();
    };
    
    $("deck-list-select").onchange = () => {
        const sel = $("deck-list-select");
        $("deck-name").value = sel.value;
    };
    
    // Initialize UI
    setTimeout(() => {
        updateDeckListSelect();
        const sel = $("deck-list-select");
        if (sel.options.length > 0) {
            sel.selectedIndex = 0;
            $("load-deck").onclick();
        }
    }, 200);
    
    refreshDeckUI();
}
