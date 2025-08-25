// Combat System for Turn-based Battle
class CombatSystem {
    constructor() {
        this.socket = null;
        this.gameState = {
            playerHP: 150,
            opponentHP: 150,
            playerMP: 150,
            opponentMP: 150,
            playerDefenseCount: 3,
            opponentDefenseCount: 3,
            currentTurn: 0,
            playerAction: null,
            opponentAction: null,
            playerSkill: null,
            opponentSkill: null,
            waitingForOpponent: false,
            gameActive: false,
            roomId: null,
            playerId: null,
            playerAttackBonus: 0,
            playerAttackBonusTurns: 0,
            opponentAttackBonus: 0,
            opponentAttackBonusTurns: 0
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
                    // Use existing skills panel instead of modal
                    console.log('Skill button clicked, skillsSystem available:', !!window.skillsSystem);
                    if (window.skillsSystem) {
                        window.skillsSystem.showSkillsPanel();
                    } else {
                        // Try to initialize skills system if not available
                        if (window.SkillsSystem) {
                            window.skillsSystem = new window.SkillsSystem();
                            setTimeout(() => {
                                if (window.skillsSystem) {
                                    window.skillsSystem.showSkillsPanel();
                                }
                            }, 100);
                        } else {
                            this.updateStatus('Hệ thống kỹ năng chưa sẵn sàng');
                        }
                    }
                    return;
                }

                if (action) {
                    this.selectAction(action);
                }
            });
        });
    }

    // Handle action selection
    selectAction(action, skillData = null) {
        if (this.gameState.playerAction || this.gameState.waitingForOpponent) {
            return;
        }

        this.gameState.playerAction = action;
        this.gameState.playerSkill = skillData;
        this.gameState.waitingForOpponent = true;

        // Update UI to show selected action
        this.highlightSelectedAction(action, skillData);
        
        if (skillData) {
            this.updateStatus(`Đã chọn skill: ${skillData.name}. Đang đợi đối thủ...`);
        } else {
            this.updateStatus('Đang đợi đối thủ chọn hành động...');
        }
        
        // Disable all action buttons
        this.disableActionButtons();

        // Send action to server
        this.socket.emit('combatAction', {
            roomId: this.gameState.roomId,
            playerId: this.gameState.playerId,
            action: action,
            skill: skillData,
            turn: this.gameState.currentTurn
        });

        console.log('Action selected:', action, skillData ? `with skill: ${skillData.name}` : '');
    }

    // Highlight selected action
    highlightSelectedAction(action, skillData = null) {
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
        } else if (action === 'skill') {
            selectedItem = Array.from(actionItems).find(item => item.textContent.trim() === 'Kỹ năng');
            if (selectedItem && skillData) {
                selectedItem.innerHTML = `<div>Kỹ năng</div><div style="font-size: 0.8em; color: #ffd700;">${skillData.name}</div>`;
            }
        }

        if (selectedItem) {
            selectedItem.classList.add('selected');
            selectedItem.style.backgroundColor = 'rgba(255, 215, 0, 0.3)';
            selectedItem.style.borderColor = '#ffd700';
        }
    }

    // Show skill selection modal
    showSkillSelection() {
        if (!window.skillManager || !window.skillManager.initialized) {
            this.updateStatus('Hệ thống kỹ năng chưa sẵn sàng...');
            return;
        }

        const availableSkills = window.skillManager.getAllSkills().filter(skill => 
            skill.mpCost <= this.gameState.playerMP
        );

        if (availableSkills.length === 0) {
            this.updateStatus('Không đủ MP để sử dụng kỹ năng!');
            return;
        }

        // Create skill selection modal
        const modal = document.createElement('div');
        modal.className = 'skill-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        const modalContent = document.createElement('div');
        modalContent.className = 'skill-modal-content';
        modalContent.style.cssText = `
            background: linear-gradient(135deg, #2c1810, #4a2c1a);
            border: 2px solid #ffd700;
            border-radius: 10px;
            padding: 20px;
            max-width: 500px;
            max-height: 70vh;
            overflow-y: auto;
        `;

        let skillsHTML = `
            <h3 style="color: #ffd700; text-align: center; margin-bottom: 20px;">Chọn Kỹ Năng</h3>
            <div style="color: #fff; margin-bottom: 15px;">MP hiện tại: ${this.gameState.playerMP}</div>
        `;

        availableSkills.forEach(skill => {
            skillsHTML += `
                <div class="skill-option" data-skill-id="${skill.id}" style="
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 5px;
                    padding: 10px;
                    margin-bottom: 10px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">
                    <div style="color: #ffd700; font-weight: bold; margin-bottom: 5px;">${skill.name}</div>
                    <div style="color: #fff; font-size: 0.9em; margin-bottom: 5px;">${skill.description}</div>
                    <div style="color: #ff6b6b; font-size: 0.8em;">Tốn ${skill.mpCost} MP</div>
                </div>
            `;
        });

        skillsHTML += `
            <div style="text-align: center; margin-top: 20px;">
                <button class="cancel-skill-btn" style="
                    background: #666;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                ">Hủy</button>
            </div>
        `;

        modalContent.innerHTML = skillsHTML;
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Add hover effects and click handlers
        const skillOptions = modalContent.querySelectorAll('.skill-option');
        skillOptions.forEach(option => {
            option.addEventListener('mouseenter', () => {
                option.style.backgroundColor = 'rgba(255, 215, 0, 0.2)';
                option.style.borderColor = '#ffd700';
            });
            option.addEventListener('mouseleave', () => {
                option.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                option.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            });
            option.addEventListener('click', () => {
                const skillId = option.dataset.skillId;
                const selectedSkill = window.skillManager.getSkill(skillId);
                if (selectedSkill) {
                    this.selectAction('skill', selectedSkill);
                    document.body.removeChild(modal);
                }
            });
        });

        // Cancel button
        const cancelBtn = modalContent.querySelector('.cancel-skill-btn');
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    // Handle opponent action
    handleOpponentAction(data) {
        if (data.playerId === this.gameState.playerId) {
            return; // Ignore own actions
        }

        this.gameState.opponentAction = data.action;
        this.gameState.opponentSkill = data.skill;
        console.log('Opponent selected:', data.action, data.skill ? `with skill: ${data.skill.name}` : '');

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
            playerSkill: this.gameState.playerSkill,
            opponentSkill: this.gameState.opponentSkill,
            turn: this.gameState.currentTurn,
            playerMP: this.gameState.playerMP,
            opponentMP: this.gameState.opponentMP,
            playerAttackBonus: this.gameState.playerAttackBonus,
            playerAttackBonusTurns: this.gameState.playerAttackBonusTurns
        });
    }

    // Resolve turn with results from server
    resolveTurn(data) {
        const { playerDamage, opponentDamage, playerDefenseUsed, opponentDefenseUsed, playerHeal, opponentHeal, playerMPUsed, opponentMPUsed, playerAttackBonus, playerAttackBonusTurns, opponentAttackBonus, opponentAttackBonusTurns } = data;

        // Update HP (damage and healing)
        // Player takes opponentDamage, Opponent takes playerDamage
        this.gameState.playerHP = Math.max(0, Math.min(150, this.gameState.playerHP - opponentDamage + (playerHeal || 0)));
        this.gameState.opponentHP = Math.max(0, Math.min(150, this.gameState.opponentHP - playerDamage + (opponentHeal || 0)));

        // Update MP consumption
        if (playerMPUsed) {
            this.gameState.playerMP = Math.max(0, this.gameState.playerMP - playerMPUsed);
        }
        if (opponentMPUsed) {
            this.gameState.opponentMP = Math.max(0, this.gameState.opponentMP - opponentMPUsed);
        }

        // Update defense counts
        if (playerDefenseUsed) {
            this.gameState.playerDefenseCount--;
        }
        if (opponentDefenseUsed) {
            this.gameState.opponentDefenseCount--;
        }

        // Sync buff state from server
        if (typeof playerAttackBonus !== 'undefined') {
            this.gameState.playerAttackBonus = playerAttackBonus;
        }
        if (typeof playerAttackBonusTurns !== 'undefined') {
            this.gameState.playerAttackBonusTurns = playerAttackBonusTurns;
        }
        if (typeof opponentAttackBonus !== 'undefined') {
            this.gameState.opponentAttackBonus = opponentAttackBonus;
        }
        if (typeof opponentAttackBonusTurns !== 'undefined') {
            this.gameState.opponentAttackBonusTurns = opponentAttackBonusTurns;
        }

        // Show buff status messages
        if (this.gameState.playerSkill && this.gameState.playerSkill.special === 'enhance_attack_2_turns') {
            this.updateStatus('Witch Leyline kích hoạt! Tấn công được cường hóa +5 sát thương trong 2 lượt!');
        }
        if (this.gameState.playerAttackBonusTurns === 0 && this.gameState.playerAttackBonus === 0) {
            this.updateStatus('Hiệu ứng Witch Leyline đã hết! Sát thương tấn công trở về bình thường.');
        }

        // Update displays
        this.updateHealthDisplays();
        this.updateDefenseCounter();

        // Show turn results with skill info
        this.showTurnResults(data);

        // Check for game over
        if (this.gameState.playerHP <= 0 || this.gameState.opponentHP <= 0) {
            this.endGame(this.gameState.playerHP > 0 ? { winner: 'player' } : { winner: 'opponent' });
            return;
        }

        // Start new turn
        this.startNewTurn();
    }

    // Show turn results with skill information
    showTurnResults(data) {
        const { playerAction, opponentAction, playerDamage, opponentDamage, playerHeal, opponentHeal, playerSkill, opponentSkill, playerMPUsed, opponentMPUsed } = data;
        
        let resultText = `Lượt ${this.gameState.currentTurn}: `;
        
        // Player action description
        if (playerAction === 'skill' && playerSkill) {
            resultText += `Bạn đã sử dụng ${playerSkill.name}`;
            if (playerDamage > 0) resultText += ` gây ${playerDamage} sát thương`;
            if (playerHeal > 0) resultText += ` hồi ${playerHeal} HP`;
            if (playerMPUsed > 0) resultText += `, tốn ${playerMPUsed} MP`;
        } else if (playerAction === 'attack') {
            resultText += `Bạn tấn công gây ${playerDamage} sát thương`;
        } else if (playerAction === 'defense') {
            resultText += `Bạn phòng thủ`;
        }
        
        resultText += '. ';
        
        // Opponent action description  
        if (opponentAction === 'skill' && opponentSkill) {
            resultText += `Đối thủ sử dụng ${opponentSkill.name}`;
            if (opponentDamage > 0) resultText += ` gây ${opponentDamage} sát thương`;
            if (opponentHeal > 0) resultText += ` hồi ${opponentHeal} HP`;
            if (opponentMPUsed > 0) resultText += `, tốn ${opponentMPUsed} MP`;
        } else if (opponentAction === 'attack') {
            resultText += `Đối thủ tấn công gây ${opponentDamage} sát thương`;
        } else if (opponentAction === 'defense') {
            resultText += `Đối thủ phòng thủ`;
        }

        this.updateStatus(resultText);
    }

    // Start new turn
    startNewTurn() {
        this.gameState.currentTurn++;
        this.gameState.playerAction = null;
        this.gameState.opponentAction = null;
        this.gameState.playerSkill = null;
        this.gameState.opponentSkill = null;
        this.gameState.waitingForOpponent = false;

        // Reset UI
        this.enableActionButtons();
        this.clearActionSelection();
        
        // Reset skills panel state
        if (window.skillsSystem && window.skillsSystem.resetPanelState) {
            window.skillsSystem.resetPanelState();
        }
        
        this.updateStatus(`Lượt ${this.gameState.currentTurn}: Chọn hành động của bạn`);
        this.updateTurnDisplay();
    }

    // Update health and MP displays
    updateHealthDisplays() {
        console.log('Updating health and MP displays:', this.gameState.playerHP, this.gameState.opponentHP, this.gameState.playerMP, this.gameState.opponentMP);
        
        // Update player health and MP - try multiple methods
        if (window.characterManager) {
            window.characterManager.updateUserHealth(this.gameState.playerHP);
            window.characterManager.updateOpponentHealth(this.gameState.opponentHP);
            
            // Update MP if methods exist
            if (window.characterManager.updateUserMana) {
                window.characterManager.updateUserMana(this.gameState.playerMP);
            }
            if (window.characterManager.updateOpponentMana) {
                window.characterManager.updateOpponentMana(this.gameState.opponentMP);
            }
        }
        
        // Direct update as fallback for HP
        const userHpText = document.getElementById('user-hp-text');
        if (userHpText) {
            userHpText.textContent = `HP: ${Math.max(0, this.gameState.playerHP)}`;
        }
        
        const opponentHpText = document.getElementById('opponent-hp-text');
        if (opponentHpText) {
            opponentHpText.textContent = `HP: ${Math.max(0, this.gameState.opponentHP)}`;
        }
        
        // Direct update for MP
        const userMpText = document.getElementById('user-mp-text');
        if (userMpText) {
            userMpText.textContent = `MP: ${Math.max(0, this.gameState.playerMP)}`;
        }
        
        const opponentMpText = document.getElementById('opponent-mp-text');
        if (opponentMpText) {
            opponentMpText.textContent = `MP: ${Math.max(0, this.gameState.opponentMP)}`;
        }
        
        console.log('Health and MP display elements found:', !!userHpText, !!opponentHpText, !!userMpText, !!opponentMpText);
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
        const winnerName = data.winnerName || 'Người chơi';
        let message = '';
        
        if (winner === 'player') {
            message = '🎉 Bạn đã thắng! 🎉';
        } else {
            message = '💀 Bạn đã thua! 💀';
        }

        this.updateStatus(message);
        
        // Show game over modal after delay
        setTimeout(() => {
            this.showGameOverModal(winner === 'player', winnerName);
        }, 2000);
    }

    // Show game over modal
    showGameOverModal(isWinner, winnerName) {
        const modal = document.createElement('div');
        modal.className = 'game-over-modal';
        modal.innerHTML = `
            <div class="game-over-content">
                <h2>${isWinner ? 'Chiến thắng!' : 'Thất bại!'}</h2>
                <p>Người chơi **${winnerName}** đã chiến thắng!</p>
                <button class="return-btn" id="returnToMenuBtn">Quay về menu</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Force navigation after 2 seconds if button doesn't work
        setTimeout(() => {
            console.log('Auto-navigation fallback - redirecting to main menu');
            window.location.replace('main_menu.html');
        }, 2000);
        
        // Add return button functionality with immediate navigation
        setTimeout(() => {
            const returnBtn = document.getElementById('returnToMenuBtn');
            if (returnBtn) {
                console.log('Return button found, adding navigation');
                
                // Force immediate navigation on any interaction
                const forceNavigate = function() {
                    console.log('Force navigation triggered');
                    window.location.replace('main_menu.html');
                };
                
                // Replace button content with direct navigation
                returnBtn.innerHTML = 'Quay về menu (Click anywhere)';
                returnBtn.style.cssText = 'position: relative; z-index: 9999; pointer-events: auto; cursor: pointer;';
                
                // Add listeners to button and modal
                returnBtn.onclick = forceNavigate;
                returnBtn.addEventListener('click', forceNavigate);
                returnBtn.addEventListener('mousedown', forceNavigate);
                
                // Also add to modal itself as backup
                const modal = document.querySelector('.game-over-modal');
                if (modal) {
                    modal.addEventListener('click', forceNavigate);
                    modal.style.cursor = 'pointer';
                    console.log('Modal click navigation added');
                }
                
                console.log('Return button navigation setup complete');
            } else {
                console.error('Return button not found');
            }
        }, 100);
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
                
                // Expose combat system globally for skills integration
                window.combatSystem = combatSystem;
            } else {
                // Fallback: Initialize without socket for local testing
                combatSystem = new CombatSystem();
                combatSystem.initialize(null);
                window.combatSystem = combatSystem;
            }
        }, 3000); // Increased delay to ensure character manager is ready
    }
});

// Additional fallback: Ensure combat system is available for skills
window.ensureCombatSystem = function() {
    if (!window.combatSystem && (window.location.pathname.includes('map') || document.body.style.backgroundImage.includes('map'))) {
        combatSystem = new CombatSystem();
        combatSystem.initialize(window.socket || null);
        window.combatSystem = combatSystem;
    }
    return window.combatSystem;
};
