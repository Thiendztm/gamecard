
const DEBUG = false; // Set to false in production
const debug = DEBUG ? console.log : () => {};

debug('Main menu loaded');

// Game rooms storage
let gameRooms = [];
let currentRoom = null;
// Use existing socket from client.js instead of declaring new one

// Initialize socket connection
function initializeSocket() {
    // socket is already initialized in client.js, just add event listeners
    
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('error', (data) => {
        console.log('Server error:', data);
        alert(data.message || 'Có lỗi xảy ra');
    });
    
    socket.on('roomCreated', (roomData) => {
        console.log('Room created:', roomData);
        gameRooms.push(roomData);
        updateRoomList();
    });
    
    socket.on('roomJoined', (roomData) => {
        console.log('Joined room:', roomData);
        currentRoom = roomData;
        openWaitingRoom(roomData);
    });
    
    socket.on('playerJoined', (data) => {
        console.log('Player joined:', data);
        if (currentRoom && currentRoom.id === data.roomId) {
            currentRoom.players = data.players;
            updateWaitingRoom();
        }
        updateRoomList();
    });
    
    socket.on('playerLeft', (data) => {
        console.log('Player left:', data);
        if (currentRoom && currentRoom.id === data.roomId) {
            currentRoom.players = data.players;
            updateWaitingRoom();
        }
        updateRoomList();
    });
    
    socket.on('playerReady', (data) => {
        console.log('Player ready status:', data);
        if (currentRoom && currentRoom.id === data.roomId) {
            updatePlayerStatus(data.playerId, data.ready);
        }
    });
    
    socket.on('gameStart', (data) => {
        console.log('Game starting:', data);
        window.location.href = 'gamePlay.html';
    });
    
    socket.on('roomList', (rooms) => {
        console.log('Room list updated:', rooms);
        gameRooms = rooms;
        updateRoomList();
    });
}

window.onload = function() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        console.log('No user found, redirecting to login');
        window.location.href = 'index.html';
        return;
    }
    
    const userData = JSON.parse(user);
    console.log('Welcome to main menu:', userData.username);

    const usernameElement = document.getElementById('username-display');
    if (usernameElement) {
        usernameElement.textContent = userData.username;
    }
    
    // Initialize socket connection
    initializeSocket();
    
    const logoMenu = document.getElementById('logo-menu');
    if (logoMenu) {
        logoMenu.classList.add('transition-animation');
        console.log('Logo transition animation triggered');
        
        setTimeout(() => {
            console.log('Starting menu buttons animation');
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

// Room panel functions
function openRoomPanel() {
    const roomPanel = document.getElementById('room-creation-panel');
    if (roomPanel) {
        roomPanel.classList.remove('hidden');
        console.log('Room creation panel opened');
    }
}

function closeRoomPanel() {
    const roomPanel = document.getElementById('room-creation-panel');
    if (roomPanel) {
        roomPanel.classList.add('hidden');
        console.log('Room creation panel closed');
    }
}

// Room browser functions
function openRoomBrowser() {
    const browserPanel = document.getElementById('room-browser-panel');
    if (browserPanel) {
        browserPanel.classList.remove('hidden');
        console.log('Room browser opened');
        
        // Set current username
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
        console.log('Room browser closed');
    }
}

function refreshRoomList() {
    console.log('Refreshing room list and cleaning up disconnected players...');
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
            <th>Loại trận</th>
            <th>Chủ phòng</th>
            <th>Ghi chú</th>
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
            <td>${room.type}</td>
            <td>${room.host}</td>
            <td>${room.note}</td>
            <td>${statusText}</td>
            <td>${playerCount}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    console.log(`Displayed ${gameRooms.length} rooms`);
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
                ready: false
            },
            password: enteredPassword
        });
    }
}

function createRoom() {
    debug('Creating room...');
    
    const type = document.querySelector('.type-select').value;
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
        host: user.username || 'Unknown',
        note: duelNote || 'Không có ghi chú',
        password: duelPassword,
        status: selectedTypes[0], // 'Khóa' or 'Công khai'
        maxPlayers: 2,
        players: [{
            id: user.username,
            name: user.username,
            ready: false
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
    currentRoom = roomData;
    
    const waitingPanel = document.getElementById('waiting-room-panel');
    if (waitingPanel) {
        waitingPanel.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = roomData.note || 'Phòng chờ';
        document.getElementById('room-host-display').textContent = roomData.host;
        document.getElementById('room-type-display').textContent = roomData.type;
        
        updateWaitingRoom();
        console.log('Waiting room opened for:', roomData.id);
    }
}

function closeWaitingRoom() {
    const waitingPanel = document.getElementById('waiting-room-panel');
    if (waitingPanel) {
        waitingPanel.classList.add('hidden');
        
        // Leave room via socket
        if (socket && currentRoom) {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            socket.emit('leaveRoom', {
                roomId: currentRoom.id,
                playerId: user.username
            });
        }
        
        currentRoom = null;
        console.log('Waiting room closed');
    }
}

function updateWaitingRoom() {
    if (!currentRoom) return;
    
    const players = currentRoom.players || [];
    
    // Update player slots
    for (let i = 0; i < 2; i++) {
        const player = players[i];
        const nameElement = document.getElementById(`player${i + 1}-name`);
        const statusElement = document.getElementById(`player${i + 1}-status`);
        
        if (player) {
            nameElement.textContent = player.name;
            statusElement.textContent = player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng';
            statusElement.className = player.ready ? 'player-status ready' : 'player-status';
        } else {
            nameElement.textContent = 'Đang chờ...';
            statusElement.textContent = 'Chưa sẵn sàng';
            statusElement.className = 'player-status';
        }
    }
    
    // Update ready button
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const currentPlayer = players.find(p => p.id === user.username);
    const readyBtn = document.getElementById('ready-btn');
    
    if (readyBtn && currentPlayer) {
        readyBtn.textContent = currentPlayer.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng';
        readyBtn.className = currentPlayer.ready ? 'ready-btn not-ready' : 'ready-btn';
    }
    
    // Check if both players are ready
    if (players.length === 2 && players.every(p => p.ready)) {
        setTimeout(() => {
            if (socket && currentRoom) {
                socket.emit('startGame', { roomId: currentRoom.id });
            }
        }, 1000);
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
    
    // Room creation panel elements
    const closeRoomBtn = document.querySelector('.close-room-panel');
    const hostDuelBtn = document.querySelector('.host-duel-btn');
    const roomPanelOverlay = document.querySelector('.room-panel-overlay');
    
    // Waiting room elements
    const closeWaitingRoomBtn = document.querySelector('.close-waiting-room');
    const leaveRoomBtn = document.querySelector('.leave-room-btn');
    const readyBtn = document.getElementById('ready-btn');
    const waitingRoomOverlay = document.querySelector('.waiting-room-overlay');
    
    // Room browser panel elements
    const refreshRoomsBtn = document.querySelector('.refresh-rooms-btn');
    const joinRoomBtn = document.querySelector('.join-room-btn');
    const cancelBrowserBtn = document.querySelector('.cancel-browser-btn');
    const roomBrowserOverlay = document.querySelector('.room-browser-overlay');
    const hostRoomBtn = document.querySelector('.host-room-btn');
    
    // Menu button handlers
    if (roomBtn) {
        roomBtn.onclick = function() {
            console.log('Tạo phòng clicked from main menu - opening room browser');
            openRoomBrowser();
        };
    }
    
    if (deckBtn) {
        deckBtn.onclick = function() {
            console.log('Xây dựng deck clicked');
            // TODO: Add deck builder functionality
        };
    }
    
    if (myProfileBtn) {
        myProfileBtn.onclick = function() {
            console.log('Xem hồ sơ clicked');
            // TODO: Add profile functionality
        };
    }
    
    if (exitBtn) {
        exitBtn.onclick = function() {
            console.log('Thoát clicked');
            logout();
        };
    }
    
    if (settingsBtn) {
        settingsBtn.onclick = function() {
            console.log('Cài đặt clicked');
            // TODO: Add settings functionality
        };
    }
    
    // Room creation panel event handlers
    if (closeRoomBtn) {
        closeRoomBtn.onclick = closeRoomPanel;
    }
    
    if (hostDuelBtn) {
        hostDuelBtn.onclick = function(e) {
            e.preventDefault();
            
            // Prevent double clicks
            if (hostDuelBtn.disabled) return;
            
            hostDuelBtn.disabled = true;
            hostDuelBtn.textContent = 'Đang tạo...';
            
            setTimeout(() => {
                createRoom();
                
                // Re-enable button after a short delay
                setTimeout(() => {
                    hostDuelBtn.disabled = false;
                    hostDuelBtn.textContent = 'Tạo phòng';
                }, 500);
            }, 50);
        };
    }
    
    if (roomPanelOverlay) {
        roomPanelOverlay.onclick = closeRoomPanel;
    }
    
    // Waiting room event handlers
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
    
    // Room browser panel event handlers
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
            console.log('Host room button clicked - opening creation panel over browser');
            openRoomPanel();
            // Don't close browser - let creation panel overlay on top
        };
    }
    
    // Room row selection
    document.addEventListener('click', function(e) {
        if (e.target.closest('.room-row')) {
            // Remove previous selection
            document.querySelectorAll('.room-row').forEach(row => {
                row.classList.remove('selected');
            });
            
            // Add selection to clicked row
            e.target.closest('.room-row').classList.add('selected');
            
            // Enable join button
            if (joinRoomBtn) {
                joinRoomBtn.disabled = false;
            }
        }
    });
    
    // Search functionality
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
    
    // Enter key support for room creation
    const roomInputs = document.querySelectorAll('.duel-note-input, .duel-password-input');
    roomInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                createRoom();
            }
        });
    });
    
    // Auto-select radio button based on password input
    const passwordInput = document.querySelector('.duel-password-input');
    if (passwordInput) {
        // Handle typing and pasting
        passwordInput.addEventListener('input', function() {
            const hasPassword = this.value.trim().length > 0;
            const radioButtons = document.querySelectorAll('input[name="duel-type"]');
            
            radioButtons.forEach(radio => {
                // Temporarily enable to change programmatically
                radio.disabled = false;
                
                if (hasPassword) {
                    // If password exists, select "Khóa"
                    radio.checked = (radio.value === 'Khóa');
                } else {
                    // If no password, select "Công khai"
                    radio.checked = (radio.value === 'Công khai');
                }
                
                // Re-disable to prevent manual interaction
                radio.disabled = true;
            });
            
            debug('Password input changed, auto-selected:', hasPassword ? 'Khóa' : 'Công khai');
        });
        
        // Handle paste events
        passwordInput.addEventListener('paste', function() {
            // Use setTimeout to wait for paste to complete
            setTimeout(() => {
                const hasPassword = this.value.trim().length > 0;
                const radioButtons = document.querySelectorAll('input[name="duel-type"]');
                
                radioButtons.forEach(radio => {
                    // Temporarily enable to change programmatically
                    radio.disabled = false;
                    
                    if (hasPassword) {
                        radio.checked = (radio.value === 'Khóa');
                    } else {
                        radio.checked = (radio.value === 'Công khai');
                    }
                    
                    // Re-disable to prevent manual interaction
                    radio.disabled = true;
                });
                
                debug('Password pasted, auto-selected:', hasPassword ? 'Khóa' : 'Công khai');
            }, 10);
        });
    }
});
