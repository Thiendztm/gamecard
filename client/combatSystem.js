// Combat System for Turn-based Battle
class CombatSystem {
    constructor() {
        this.socket = null;
        this.gameState = {
            playerHP: 100,
            opponentHP: 100,
            playerDefenseCount: 3,
            opponentDefenseCount: 3,
            currentTurn: 0,
            playerAction: null,
            opponentAction: null,
            waitingForOpponent: false,
            gameActive: false,
            roomId: null,
            playerId: null
        };
        this.actionButtons = null;
        this.statusDisplay = null;
        this.initialized = false;
    }

    // Initialize combat system
    initialize(socket) {
        if (this.initialized) {
            console.log('Combat system already initialized');
            return;
        }

        this.socket = socket;
        this.setupSocketListeners();
        
        // Wait for character manager to be ready
        setTimeout(() => {
            this.createCombatUI();
            this.setupActionButtons();
            
            // Get room and player info
            const currentRoom = JSON.parse(sessionStorage.getItem('currentRoom') || '{}');
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            
            this.gameState.roomId = currentRoom.id;
            this.gameState.playerId = user.username;
            this.gameState.gameActive = true;
            
            this.initialized = true;
            console.log('Combat system initialized');
            
            // Start the game at turn 1
            this.gameState.currentTurn = 1;
            this.updateStatus(`Lượt ${this.gameState.currentTurn}: Chọn hành động của bạn`);
            this.updateTurnDisplay();
        }, 1000);
    }

    // Setup socket event listeners
    setupSocketListeners() {
        if (!this.socket) return;

        // Listen for opponent actions
        this.socket.on('combatAction', (data) => {
            console.log('Received combat action:', data);
            this.handleOpponentAction(data);
        });

        // Listen for turn resolution
        this.socket.on('turnResolved', (data) => {
            console.log('Turn resolved:', data);
            this.resolveTurn(data);
        });

        // Listen for game over
        this.socket.on('gameOver', (data) => {
            console.log('Game over:', data);
            this.endGame(data);
        });
    }

    // Create combat UI elements
    createCombatUI() {
        // Update action items to be clickable buttons
        const actionItems = document.querySelectorAll('.action-item');
        actionItems.forEach((item, index) => {
            item.style.cursor = 'pointer';
            item.style.padding = '10px 20px';
            item.style.border = '2px solid rgba(255, 255, 255, 0.3)';
            item.style.borderRadius = '8px';
            item.style.transition = 'all 0.3s ease';
            item.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            
            // Add hover effects
            item.addEventListener('mouseenter', () => {
                if (!item.classList.contains('disabled')) {
                    item.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    item.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                }
            });
            
            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('selected')) {
                    item.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                    item.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
            });
        });

        // Create status display
        this.createStatusDisplay();
        
        // Create defense counter display
        this.createDefenseCounter();
    }

    // Create status display
    createStatusDisplay() {
        // Remove existing status if any
        const existingStatus = document.getElementById('combat-status');
        if (existingStatus) {
            existingStatus.remove();
        }

        const statusDiv = document.createElement('div');
        statusDiv.id = 'combat-status';
        statusDiv.className = 'combat-status';
        statusDiv.innerHTML = `
            <div class="turn-info">Lượt ${this.gameState.currentTurn}</div>
            <div class="action-status">Chọn hành động của bạn</div>
        `;
        
        // Add to action panel - position at top right
        const actionPanel = document.querySelector('.action-panel');
        if (actionPanel) {
            // Insert as first child to position at top
            actionPanel.insertBefore(statusDiv, actionPanel.firstChild);
        }
        
        this.statusDisplay = statusDiv;
    }

    // Create defense counter display
    createDefenseCounter() {
        // Remove existing counter if any
        const existingCounter = document.getElementById('defense-counter');
        if (existingCounter) {
            existingCounter.remove();
        }

        const counterDiv = document.createElement('div');
        counterDiv.id = 'defense-counter';
        counterDiv.className = 'defense-counter';
        counterDiv.innerHTML = `
            <div class="counter-label">Phòng thủ còn lại:</div>
            <div class="counter-value">${this.gameState.playerDefenseCount}/3</div>
        `;
        
        // Add to user stats
        const userStats = document.getElementById('user-stats');
        if (userStats) {
            userStats.appendChild(counterDiv);
        }
        
        this.defenseCounter = counterDiv;
    }

    // Setup action button event listeners
    setupActionButtons() {
        const actionItems = document.querySelectorAll('.action-item');
        
        actionItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                if (item.classList.contains('disabled') || this.gameState.waitingForOpponent) {
                    return;
                }

                let action = null;
                const text = item.textContent.trim();
                
                if (text === 'Đánh') {
                    action = 'attack';
                } else if (text === 'Phòng thủ') {
                    if (this.gameState.playerDefenseCount <= 0) {
                        this.updateStatus('Bạn đã hết lượt phòng thủ!');
                        return;
                    }
                    action = 'defense';
                } else if (text === 'Kỹ năng') {
                    // Skip skill for now - not implemented
                    this.updateStatus('Kỹ năng chưa được triển khai');
                    return;
                }

                if (action) {
                    this.selectAction(action);
                }
            });
        });
    }

    // Handle action selection
    selectAction(action) {
        if (this.gameState.playerAction || this.gameState.waitingForOpponent) {
            return;
        }

        this.gameState.playerAction = action;
        this.gameState.waitingForOpponent = true;

        // Update UI to show selected action
        this.highlightSelectedAction(action);
        this.updateStatus('Đang đợi đối thủ chọn hành động...');
        
        // Disable all action buttons
        this.disableActionButtons();

        // Send action to server
        this.socket.emit('combatAction', {
            roomId: this.gameState.roomId,
            playerId: this.gameState.playerId,
            action: action,
            turn: this.gameState.currentTurn
        });

        console.log('Action selected:', action);
    }

    // Highlight selected action
    highlightSelectedAction(action) {
        const actionItems = document.querySelectorAll('.action-item');
        
        actionItems.forEach(item => {
            item.classList.remove('selected');
            item.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            item.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        });

        let selectedItem = null;
        if (action === 'attack') {
            selectedItem = Array.from(actionItems).find(item => item.textContent.trim() === 'Đánh');
        } else if (action === 'defense') {
            selectedItem = Array.from(actionItems).find(item => item.textContent.trim() === 'Phòng thủ');
        }

        if (selectedItem) {
            selectedItem.classList.add('selected');
            selectedItem.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
            selectedItem.style.borderColor = 'rgba(0, 255, 0, 0.8)';
        }
    }

    // Handle opponent action
    handleOpponentAction(data) {
        if (data.playerId === this.gameState.playerId) {
            return; // Ignore own actions
        }

        this.gameState.opponentAction = data.action;
        console.log('Opponent selected:', data.action);

        // If both players have selected actions, resolve the turn
        if (this.gameState.playerAction && this.gameState.opponentAction) {
            this.requestTurnResolution();
        }
    }

    // Request turn resolution from server
    requestTurnResolution() {
        this.socket.emit('resolveTurn', {
            roomId: this.gameState.roomId,
            playerId: this.gameState.playerId,
            playerAction: this.gameState.playerAction,
            opponentAction: this.gameState.opponentAction,
            turn: this.gameState.currentTurn
        });
    }

    // Resolve turn with results from server
    resolveTurn(data) {
        const { playerDamage, opponentDamage, playerDefenseUsed, opponentDefenseUsed } = data;

        // Update HP
        this.gameState.playerHP = Math.max(0, this.gameState.playerHP - playerDamage);
        this.gameState.opponentHP = Math.max(0, this.gameState.opponentHP - opponentDamage);

        // Update defense counts
        if (playerDefenseUsed) {
            this.gameState.playerDefenseCount--;
        }
        if (opponentDefenseUsed) {
            this.gameState.opponentDefenseCount--;
        }

        // Update UI
        this.updateHealthDisplays();
        this.updateDefenseCounter();

        // Show turn results
        this.showTurnResults(data);

        // Check for game over
        if (this.gameState.playerHP <= 0 || this.gameState.opponentHP <= 0) {
            const winner = this.gameState.playerHP > 0 ? 'player' : 'opponent';
            this.endGame({ winner });
            return;
        }

        // Start next turn
        setTimeout(() => {
            this.startNewTurn();
        }, 3000);
    }

    // Show turn results
    showTurnResults(data) {
        const { playerAction, opponentAction, playerDamage, opponentDamage } = data;
        
        let resultText = `Lượt ${this.gameState.currentTurn}: `;
        
        if (playerAction === 'attack' && opponentAction === 'attack') {
            resultText += `Cả hai đánh nhau! Bạn nhận ${playerDamage} sát thương, đối thủ nhận ${opponentDamage} sát thương.`;
        } else if (playerAction === 'attack' && opponentAction === 'defense') {
            resultText += `Bạn tấn công nhưng đối thủ phòng thủ thành công!`;
        } else if (playerAction === 'defense' && opponentAction === 'attack') {
            resultText += `Đối thủ tấn công nhưng bạn phòng thủ thành công!`;
        } else if (playerAction === 'defense' && opponentAction === 'defense') {
            resultText += `Cả hai đều phòng thủ, không có sát thương nào!`;
        }

        this.updateStatus(resultText);
    }

    // Start new turn
    startNewTurn() {
        this.gameState.currentTurn++;
        this.gameState.playerAction = null;
        this.gameState.opponentAction = null;
        this.gameState.waitingForOpponent = false;

        // Reset UI
        this.enableActionButtons();
        this.clearActionSelection();
        this.updateStatus(`Lượt ${this.gameState.currentTurn}: Chọn hành động của bạn`);
        this.updateTurnDisplay();
    }

    // Update health displays
    updateHealthDisplays() {
        console.log('Updating health displays:', this.gameState.playerHP, this.gameState.opponentHP);
        
        // Update player health - try multiple methods
        if (window.characterManager) {
            window.characterManager.updateUserHealth(this.gameState.playerHP);
            window.characterManager.updateOpponentHealth(this.gameState.opponentHP);
        }
        
        // Direct update as fallback
        const userHpText = document.getElementById('user-hp-text');
        if (userHpText) {
            userHpText.textContent = `HP: ${Math.max(0, this.gameState.playerHP)}`;
        }
        
        const opponentHpText = document.getElementById('opponent-hp-text');
        if (opponentHpText) {
            opponentHpText.textContent = `HP: ${Math.max(0, this.gameState.opponentHP)}`;
        }
        
        console.log('Health display elements found:', !!userHpText, !!opponentHpText);
    }

    // Update defense counter
    updateDefenseCounter() {
        const counterValue = document.querySelector('.counter-value');
        if (counterValue) {
            counterValue.textContent = `${this.gameState.playerDefenseCount}/3`;
            
            // Change color if running low
            if (this.gameState.playerDefenseCount <= 1) {
                counterValue.style.color = '#ff6b6b';
            } else {
                counterValue.style.color = '#fff';
            }
        }
    }

    // Update turn display
    updateTurnDisplay() {
        const turnInfo = document.querySelector('.turn-info');
        if (turnInfo) {
            turnInfo.textContent = `Lượt ${this.gameState.currentTurn}`;
        }
    }

    // Update status message
    updateStatus(message) {
        const actionStatus = document.querySelector('.action-status');
        if (actionStatus) {
            actionStatus.textContent = message;
        }
    }

    // Disable action buttons
    disableActionButtons() {
        const actionItems = document.querySelectorAll('.action-item');
        actionItems.forEach(item => {
            item.classList.add('disabled');
            item.style.opacity = '0.5';
            item.style.cursor = 'not-allowed';
        });
    }

    // Enable action buttons
    enableActionButtons() {
        const actionItems = document.querySelectorAll('.action-item');
        actionItems.forEach(item => {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.cursor = 'pointer';
        });
    }

    // Clear action selection
    clearActionSelection() {
        const actionItems = document.querySelectorAll('.action-item');
        actionItems.forEach(item => {
            item.classList.remove('selected');
            item.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            item.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        });
    }

    // End game
    endGame(data) {
        this.gameState.gameActive = false;
        this.disableActionButtons();

        const winner = data.winner;
        let message = '';
        
        if (winner === 'player') {
            message = '🎉 Bạn đã thắng! 🎉';
        } else {
            message = '💀 Bạn đã thua! 💀';
        }

        this.updateStatus(message);
        
        // Show game over modal after delay
        setTimeout(() => {
            this.showGameOverModal(winner === 'player');
        }, 2000);
    }

    // Show game over modal
    showGameOverModal(isWinner) {
        const modal = document.createElement('div');
        modal.className = 'game-over-modal';
        modal.innerHTML = `
            <div class="game-over-content">
                <h2>${isWinner ? 'Chiến thắng!' : 'Thất bại!'}</h2>
                <p>${isWinner ? 'Chúc mừng bạn đã thắng trận đấu!' : 'Hãy cố gắng hơn trong lần sau!'}</p>
                <button class="return-btn" onclick="window.location.href='main_menu.html'">Quay về menu</button>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
}

// Global combat system instance
let combatSystem = null;

// Initialize combat system when page loads (only on map pages)
window.addEventListener('load', () => {
    // Only initialize on map pages
    if (window.location.pathname.includes('map') || document.body.style.backgroundImage.includes('map')) {
        // Wait for socket connection and character manager
        setTimeout(() => {
            if (window.socket || window.io) {
                const socket = window.socket || window.io();
                combatSystem = new CombatSystem();
                combatSystem.initialize(socket);
            }
        }, 3000); // Increased delay to ensure character manager is ready
    }
});
