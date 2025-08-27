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
        
        // Force MP to be 150 - override any potential issues
        this.gameState.playerMP = 150;
        this.gameState.opponentMP = 150;
        
        // Debug: Log constructor MP values
        console.log('=== CONSTRUCTOR DEBUG ===');
        console.log('Constructor playerMP:', this.gameState.playerMP);
        console.log('Constructor opponentMP:', this.gameState.opponentMP);
        
        this.actionButtons = null;
        this.statusDisplay = null;
        this.initialized = false;
        this.isAIMode = false; // Track if this is AI battle mode
        this.aiSkills = []; // Available AI skills
    }

    // Initialize combat system
    initialize(socket) {
        this.socket = socket;
        this.isAIMode = window.isAIBattle || false;
        
        // Get multiplayer game data from sessionStorage
        if (!this.isAIMode) {
            const roomId = sessionStorage.getItem('currentRoomId');
            const playerId = sessionStorage.getItem('currentPlayerId');
            
            if (roomId && playerId) {
                this.gameState.roomId = roomId;
                this.gameState.playerId = playerId;
                console.log('Combat system initialized with:', { roomId, playerId });
            } else {
                console.warn('Missing roomId or playerId for multiplayer combat');
            }
        }
        
        // Initialize UI elements will be done after socket setup
        
        // Load AI skills for AI mode
        if (this.isAIMode) {
            this.loadAISkills();
        }
        
        console.log('Combat system AI mode:', this.isAIMode);
        
        if (this.isAIMode) {
            this.initializeAIMode();
        } else {
            this.setupSocketListeners();
        }
        
        this.createCombatUI();
        this.setupActionButtons();
        
        // Debug: Log MP after setup
        console.log('=== AFTER SETUP ===');
        console.log('After setup playerMP:', this.gameState.playerMP);
        console.log('After setup opponentMP:', this.gameState.opponentMP);
        
        // Wait for character manager to be ready
        setTimeout(() => {
            // Force MP to 150 again before game starts
            this.gameState.playerMP = 150;
            this.gameState.opponentMP = 150;
            
            console.log('=== FORCED MP RESET BEFORE GAME START ===');
            console.log('Forced playerMP to:', this.gameState.playerMP);
            console.log('Forced opponentMP to:', this.gameState.opponentMP);
            
            this.gameState.gameActive = true;
            this.gameState.currentTurn = 1;
            this.updateStatus(`Lượt ${this.gameState.currentTurn}: Chọn hành động của bạn`);
            this.updateTurnDisplay();
            
            // Debug: Log MP values after initialization
            console.log('=== AFTER INITIALIZATION ===');
            console.log('Final playerMP:', this.gameState.playerMP);
            console.log('Final opponentMP:', this.gameState.opponentMP);
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
                    // Shield sound will be played when defense actually blocks damage
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

        // Play selection sound
        if (window.sfxManager) {
            window.sfxManager.playSelect();
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

        if (this.isAIMode) {
            // AI mode: simulate opponent action after delay
            setTimeout(() => {
                this.simulateAIOpponentAction();
            }, 1500);
        } else {
            // Multiplayer mode: send action to server
            this.socket.emit('combatAction', {
                roomId: this.gameState.roomId,
                playerId: this.gameState.playerId,
                action: action,
                skill: skillData,
                turn: this.gameState.currentTurn
            });
        }

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
            if (window.sfxManager) {
                window.sfxManager.playCancel();
            }
            document.body.removeChild(modal);
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (window.sfxManager) {
                    window.sfxManager.playCancel();
                }
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

    // Request turn resolution from server or simulate locally for AI
    requestTurnResolution() {
        if (this.isAIMode) {
            // AI mode: resolve turn locally
            this.resolveAITurn();
        } else {
            // Multiplayer mode: send to server
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
    }

    // Resolve turn with results from server
    resolveTurn(data) {
        const { playerDamage, opponentDamage, playerDefenseUsed, opponentDefenseUsed, playerHeal, opponentHeal, playerMPUsed, opponentMPUsed, playerAttackBonus, playerAttackBonusTurns, opponentAttackBonus, opponentAttackBonusTurns, playerAction, opponentAction, playerSkill, opponentSkill } = data;

        // Play combat sounds based on actions
        this.playCombatSounds(data);

        // Update HP (damage and healing)
        // Player takes opponentDamage, Opponent takes playerDamage
        const oldPlayerHP = this.gameState.playerHP;
        const oldOpponentHP = this.gameState.opponentHP;
        
        this.gameState.playerHP = Math.max(0, Math.min(150, this.gameState.playerHP - opponentDamage + (playerHeal || 0)));
        this.gameState.opponentHP = Math.max(0, Math.min(150, this.gameState.opponentHP - playerDamage + (opponentHeal || 0)));
        
        // Play damage sound effects when HP is reduced
        if (window.sfxManager) {
            if (opponentDamage > 0 && this.gameState.playerHP < oldPlayerHP) {
                // Player takes damage - use tan00.wav (hit sound)
                setTimeout(() => window.sfxManager.play('hit'), 100);
            }
            if (playerDamage > 0 && this.gameState.opponentHP < oldOpponentHP) {
                // Opponent takes damage - don't play hit sound, let skill sounds play instead
                // setTimeout(() => window.sfxManager.play('hit'), 300);
                
                // Play character-specific attack animation for basic attacks
                if (playerAction === 'attack') {
                    this.playBasicAttackAnimation(() => {
                        // Hit effect plays after projectile reaches target
                        this.playOpponentHitEffect();
                    });
                } else if (playerAction === 'skill' && playerSkill && (playerSkill.name === 'Illusion Laser' || playerSkill.name === 'Magic Missile' || playerSkill.name === 'Love Sign "Master Spark"' || playerSkill.name === 'Spirit Sign "Dream Seal"' || playerSkill.name === 'Youkai Buster' || playerSkill.name === 'Witch Leyline' || playerSkill.name === 'Dimensional Rift')) {
                    // These skills handle their own hit effect timing with animation callbacks
                    // Do nothing here - hit effect is triggered by their animation callbacks
                } else {
                    // For other skills, play hit effect immediately
                    this.playOpponentHitEffect();
                }
            }
        }

        // Play shield sound when defense actually blocks damage
        if (window.sfxManager) {
            if (playerDefenseUsed && opponentDamage === 0) {
                // Player successfully blocked damage
                setTimeout(() => window.sfxManager.play('shield'), 200);
            }
            if (opponentDefenseUsed && playerDamage === 0) {
                // Opponent successfully blocked damage  
                setTimeout(() => window.sfxManager.play('shield'), 400);
            }
        }

        // Update MP consumption
        if (playerMPUsed) {
            console.log('=== MP CONSUMPTION DEBUG ===');
            console.log('Before MP consumption - playerMP:', this.gameState.playerMP);
            console.log('MP cost for skill:', playerMPUsed);
            this.gameState.playerMP = Math.max(0, this.gameState.playerMP - playerMPUsed);
            console.log('After MP consumption - playerMP:', this.gameState.playerMP);
        }
        if (opponentMPUsed) {
            console.log('Opponent MP before:', this.gameState.opponentMP);
            console.log('Opponent MP cost:', opponentMPUsed);
            this.gameState.opponentMP = Math.max(0, this.gameState.opponentMP - opponentMPUsed);
            console.log('Opponent MP after:', this.gameState.opponentMP);
        }

        // Defense counts are already decremented in AI mode, skip for regular mode
        if (!this.isAIMode) {
            if (playerDefenseUsed) {
                this.gameState.playerDefenseCount = Math.max(0, this.gameState.playerDefenseCount - 1);
            }
            if (opponentDefenseUsed) {
                this.gameState.opponentDefenseCount = Math.max(0, this.gameState.opponentDefenseCount - 1);
            }
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
        console.log('=== HEALTH/MP DISPLAY UPDATE ===');
        console.log('Current playerHP:', this.gameState.playerHP);
        console.log('Current opponentHP:', this.gameState.opponentHP);
        console.log('Current playerMP:', this.gameState.playerMP);
        console.log('Current opponentMP:', this.gameState.opponentMP);
        
        // Force MP to stay at correct values before updating display
        if (this.gameState.playerMP < 0 || this.gameState.playerMP > 150) {
            console.log('WARNING: playerMP out of range, correcting...');
            this.gameState.playerMP = Math.max(0, Math.min(150, this.gameState.playerMP));
        }
        if (this.gameState.opponentMP < 0 || this.gameState.opponentMP > 150) {
            console.log('WARNING: opponentMP out of range, correcting...');
            this.gameState.opponentMP = Math.max(0, Math.min(150, this.gameState.opponentMP));
        }
        
        // Update player health and MP - try multiple methods
        if (window.characterManager) {
            window.characterManager.updateUserHealth(this.gameState.playerHP);
            window.characterManager.updateOpponentHealth(this.gameState.opponentHP);
            
            // Update MP if methods exist
            if (window.characterManager.updateUserMana) {
                console.log('Calling characterManager.updateUserMana with:', this.gameState.playerMP);
                window.characterManager.updateUserMana(this.gameState.playerMP);
            }
            if (window.characterManager.updateOpponentMana) {
                console.log('Calling characterManager.updateOpponentMana with:', this.gameState.opponentMP);
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
            console.log('Direct MP update - setting user MP text to:', this.gameState.playerMP);
            userMpText.textContent = `MP: ${Math.max(0, this.gameState.playerMP)}`;
        }
        
        const opponentMpText = document.getElementById('opponent-mp-text');
        if (opponentMpText) {
            console.log('Direct MP update - setting opponent MP text to:', this.gameState.opponentMP);
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

    // Play combat sounds based on actions
    playCombatSounds(data) {
        if (!window.sfxManager) return;
        
        const { playerAction, opponentAction, playerSkill, opponentSkill } = data;
        
        // Play sounds for player actions - no sound for basic attack
        if (playerAction === 'skill' && playerSkill) {
            this.playSkillSound(playerSkill.name, 'player');
        }
        
        // Play sounds for opponent actions with delay - no sound for basic attack
        setTimeout(() => {
            if (opponentAction === 'skill' && opponentSkill) {
                this.playSkillSound(opponentSkill.name, 'opponent');
            }
        }, 500);
    }

    // Play specific sound for each skill
    playSkillSound(skillName, caster = 'player') {
        if (!window.sfxManager) return;
        
        console.log('Playing skill sound for:', skillName, 'by', caster);
        
        // Only play visual animations for the current player's skills
        // Sound effects can play for both, but animations should only show for player's actions
        const shouldPlayAnimation = (caster === 'player');
        
        if (skillName === 'Spirit Sign "Dream Seal"') {
            console.log('Playing power1.wav for Spirit Sign Dream Seal');
            window.sfxManager.play('skill'); // power1.wav
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playDreamSealAnimation(() => {
                    // Hit effect plays when dream seal finishes
                    this.playOpponentHitEffect();
                });
            }
        } else if (skillName === 'Heal') {
            console.log('Playing heal.mp3 for Heal');
            window.sfxManager.play('skillHeal'); // heal.mp3
        } else if (skillName === 'Youkai Buster') {
            console.log('Playing curse.mp3 for Youkai Buster');
            window.sfxManager.play('skillCurse'); // curse.mp3
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playYoukaieBusterAnimation(() => {
                    // Hit effect plays when knives reach target
                    this.playOpponentHitEffect();
                });
            }
        } else if (skillName === 'Dimensional Rift') {
            console.log('Playing attack.mp3 for Dimensional Rift');
            window.sfxManager.play('skillAttack'); // attack.mp3
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playDimensionalRiftAnimation(() => {
                    // Hit effect plays when rift reaches target
                    this.playOpponentHitEffect();
                });
            }
        } else if (skillName === 'Hakurei Amulet') {
            console.log('Playing attack.mp3 for Hakurei Amulet');
            window.sfxManager.play('skillAttack'); // attack.mp3
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playKnifeThrowAnimation();
            }
        } else if (skillName === 'Magic Missile') {
            console.log('Playing attack.mp3 for Magic Missile');
            window.sfxManager.play('skillAttack'); // attack.mp3
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playMagicMissileAnimation(() => {
                    // Hit effect plays when missiles reach target
                    this.playOpponentHitEffect();
                });
            }
        } else if (skillName === 'Illusion Laser') {
            console.log('Playing lazer00.wav for Illusion Laser');
            window.sfxManager.play('attack'); // lazer00.wav
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playLaserBeamAnimation(() => {
                    // Hit effect plays when laser reaches target
                    this.playOpponentHitEffect();
                });
            }
        } else if (skillName === 'Witch Leyline') {
            console.log('Playing powerup.wav for Witch Leyline');
            window.sfxManager.play('heal'); // powerup.wav
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playWitchLeylineAnimation(() => {
                    // Hit effect plays when leyline finishes
                    this.playOpponentHitEffect();
                });
            }
        } else if (skillName === 'Love Sign "Master Spark"') {
            console.log('Playing nep00.wav for Love Sign Master Spark');
            window.sfxManager.play('special'); // nep00.wav
            // Only play animation if it's the player's skill
            if (shouldPlayAnimation) {
                this.playMasterSparkAnimation(() => {
                    // Hit effect plays when master spark reaches target
                    this.playOpponentHitEffect();
                });
            }
        } else {
            // Default skill sound for other skills
            console.log('Playing default skill sound for:', skillName);
            window.sfxManager.play('skill');
        }
    }

    // Play opponent hit effect when taking damage
    playOpponentHitEffect() {
        const opponentSprite = document.querySelector('.opponent-sprite');
        if (!opponentSprite) return;

        // Store original position and style
        const originalTransform = opponentSprite.style.transform || '';
        const originalFilter = opponentSprite.style.filter || '';
        
        // Apply blood red tint and shake effect
        opponentSprite.style.filter = 'brightness(0.8) saturate(3) sepia(1) hue-rotate(0deg) contrast(1.5) drop-shadow(0 0 5px #ff0000)';
        opponentSprite.style.transition = 'transform 0.1s ease-in-out, filter 0.1s ease-in-out';
        
        // Shake animation sequence
        const shakeSequence = [
            { transform: 'translateX(-10px)', duration: 50 },
            { transform: 'translateX(10px)', duration: 50 },
            { transform: 'translateX(-8px)', duration: 50 },
            { transform: 'translateX(8px)', duration: 50 },
            { transform: 'translateX(-5px)', duration: 50 },
            { transform: 'translateX(5px)', duration: 50 },
            { transform: originalTransform, duration: 100 }
        ];
        
        let currentStep = 0;
        
        const executeShake = () => {
            if (currentStep < shakeSequence.length) {
                const step = shakeSequence[currentStep];
                opponentSprite.style.transform = step.transform;
                currentStep++;
                setTimeout(executeShake, step.duration);
            } else {
                // Reset to original state after delay
                setTimeout(() => {
                    opponentSprite.style.filter = originalFilter;
                    opponentSprite.style.transition = '';
                }, 200);
            }
        };
        
        executeShake();
    }

    // Play laser beam animation for Illusion Laser skill
    playLaserBeamAnimation(onHitCallback) {
        const userSprite = document.querySelector('.character-sprite');
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!userSprite || !opponentSprite) return;

        // Get positions
        const userRect = userSprite.getBoundingClientRect();
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Calculate laser beam dimensions and position
        const startX = userRect.left + userRect.width / 2;
        const startY = userRect.top + userRect.height / 2;
        const endX = opponentRect.left + opponentRect.width / 2;
        const endY = opponentRect.top + opponentRect.height / 2;
        
        // Calculate distance and angle
        const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
        
        // Create laser beam element
        const laser = document.createElement('div');
        laser.style.position = 'fixed';
        laser.style.left = startX + 'px';
        laser.style.top = (startY - 10) + 'px'; // Center the beam vertically
        laser.style.width = '0px'; // Start with 0 width
        laser.style.height = '20px'; // Beam thickness
        laser.style.background = 'linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,1) 100%)';
        laser.style.boxShadow = '0 0 20px #ffffff, 0 0 40px #ffffff, 0 0 60px #ffffff';
        laser.style.borderRadius = '10px';
        laser.style.zIndex = '1000';
        laser.style.pointerEvents = 'none';
        laser.style.transformOrigin = 'left center';
        laser.style.transform = `rotate(${angle}deg)`;
        laser.style.transition = 'width 0.2s ease-out, opacity 0.3s ease-out';
        laser.style.opacity = '0';
        
        document.body.appendChild(laser);
        
        // Animate laser beam appearance
        setTimeout(() => {
            laser.style.opacity = '1';
            laser.style.width = distance + 'px';
        }, 50);
        
        // Trigger hit effect when laser reaches target (after width animation completes)
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 250); // 50ms delay + 200ms width animation = 250ms total
        
        // Add pulsing effect after hit
        setTimeout(() => {
            laser.style.animation = 'laserPulse 0.1s ease-in-out infinite alternate';
        }, 300);
        
        // Create CSS animation for pulsing if it doesn't exist
        if (!document.getElementById('laser-animation-style')) {
            const style = document.createElement('style');
            style.id = 'laser-animation-style';
            style.textContent = `
                @keyframes laserPulse {
                    0% { 
                        box-shadow: 0 0 20px #ffffff, 0 0 40px #ffffff, 0 0 60px #ffffff;
                        filter: brightness(1);
                    }
                    100% { 
                        box-shadow: 0 0 30px #ffffff, 0 0 60px #ffffff, 0 0 90px #ffffff;
                        filter: brightness(1.3);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove laser after animation
        setTimeout(() => {
            laser.style.opacity = '0';
            laser.style.width = '0px';
        }, 800);
        
        setTimeout(() => {
            if (laser.parentNode) {
                laser.parentNode.removeChild(laser);
            }
        }, 1200);
    }

    // Play dimensional rift animation for Dimensional Rift skill
    playDimensionalRiftAnimation(onHitCallback) {
        const userSprite = document.querySelector('.character-sprite');
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!userSprite || !opponentSprite) return;

        // Get positions
        const userRect = userSprite.getBoundingClientRect();
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Calculate center positions
        const startX = userRect.left + userRect.width / 2;
        const startY = userRect.top + userRect.height / 2;
        const endX = opponentRect.left + opponentRect.width / 2;
        const endY = opponentRect.top + opponentRect.height / 2;
        
        // Create dimensional rift element
        const rift = document.createElement('img');
        rift.src = '/item/shift.png';
        rift.style.position = 'fixed';
        rift.style.left = (startX - 175) + 'px'; // Center the 350px image
        rift.style.top = (startY - 175) + 'px';
        rift.style.width = '350px';  // Large size (300-400 range)
        rift.style.height = '350px';
        rift.style.zIndex = '1000';
        rift.style.pointerEvents = 'none';
        rift.style.opacity = '0';
        rift.style.transition = 'all 0.8s ease-out';
        rift.style.transformOrigin = 'center center';
        rift.style.filter = 'drop-shadow(0 0 30px rgba(128,0,128,0.8)) brightness(1.4)';
        rift.style.transform = 'scale(0.3) rotate(0deg)';
        
        document.body.appendChild(rift);
        
        // Animate rift appearance and movement
        setTimeout(() => {
            rift.style.opacity = '1';
            rift.style.left = (endX - 175) + 'px'; // Move to opponent center
            rift.style.top = (endY - 175) + 'px';
            rift.style.transform = 'scale(1.0) rotate(360deg)';
        }, 100);
        
        // Create CSS animation for rift pulsing if it doesn't exist
        if (!document.getElementById('dimensional-rift-animation-style')) {
            const style = document.createElement('style');
            style.id = 'dimensional-rift-animation-style';
            style.textContent = `
                @keyframes riftPulse {
                    0% { 
                        filter: drop-shadow(0 0 30px rgba(128,0,128,0.8)) brightness(1.4);
                        transform: scale(1.0) rotate(360deg);
                    }
                    50% { 
                        filter: drop-shadow(0 0 50px rgba(128,0,128,1)) brightness(1.8);
                        transform: scale(1.2) rotate(360deg);
                    }
                    100% { 
                        filter: drop-shadow(0 0 30px rgba(128,0,128,0.8)) brightness(1.4);
                        transform: scale(1.0) rotate(360deg);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add pulsing effect when rift reaches opponent
        setTimeout(() => {
            rift.style.animation = 'riftPulse 0.4s ease-in-out infinite';
        }, 900);
        
        // Trigger hit effect when rift reaches target
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 900); // When rift reaches opponent
        
        // Remove rift after effect
        setTimeout(() => {
            rift.style.opacity = '0';
            rift.style.transform = 'scale(0.5) rotate(720deg)';
        }, 1500);
        
        setTimeout(() => {
            if (rift.parentNode) {
                rift.parentNode.removeChild(rift);
            }
        }, 2300);
    }

    // Play witch leyline animation for Witch Leyline skill
    playWitchLeylineAnimation(onHitCallback) {
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!opponentSprite) return;

        // Get opponent position
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Calculate center position of opponent
        const centerX = opponentRect.left + opponentRect.width / 2;
        const centerY = opponentRect.top + opponentRect.height / 2;
        
        // Create witch leyline element
        const leyline = document.createElement('img');
        leyline.src = '/item/www.png';
        leyline.style.position = 'fixed';
        leyline.style.left = (centerX - 175) + 'px'; // Center the 350px image
        leyline.style.top = (centerY - 175) + 'px';
        leyline.style.width = '350px';  // Large size (300-400 range)
        leyline.style.height = '350px';
        leyline.style.zIndex = '1000';
        leyline.style.pointerEvents = 'none';
        leyline.style.opacity = '0';
        leyline.style.transition = 'opacity 0.4s ease-in, transform 0.2s ease-out';
        leyline.style.transformOrigin = 'center center';
        leyline.style.filter = 'drop-shadow(0 0 25px rgba(0,255,0,0.8)) brightness(1.3)';
        leyline.style.transform = 'scale(0.5)';
        
        document.body.appendChild(leyline);
        
        // Animate leyline appearance with scale up
        setTimeout(() => {
            leyline.style.opacity = '1';
            leyline.style.transform = 'scale(1.0)';
        }, 100);
        
        // Create CSS animation for leyline pulsing if it doesn't exist
        if (!document.getElementById('witch-leyline-animation-style')) {
            const style = document.createElement('style');
            style.id = 'witch-leyline-animation-style';
            style.textContent = `
                @keyframes leylinePulse {
                    0% { 
                        filter: drop-shadow(0 0 25px rgba(0,255,0,0.8)) brightness(1.3);
                        transform: scale(1.0);
                    }
                    50% { 
                        filter: drop-shadow(0 0 40px rgba(0,255,0,1)) brightness(1.6);
                        transform: scale(1.1);
                    }
                    100% { 
                        filter: drop-shadow(0 0 25px rgba(0,255,0,0.8)) brightness(1.3);
                        transform: scale(1.0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add pulsing effect after initial appearance
        setTimeout(() => {
            leyline.style.animation = 'leylinePulse 0.6s ease-in-out infinite';
        }, 500);
        
        // Trigger hit effect after powerup.wav duration (approximately 1.2 seconds)
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 1200);
        
        // Remove leyline after powerup.wav finishes (approximately 1.8 seconds)
        setTimeout(() => {
            leyline.style.opacity = '0';
            leyline.style.transform = 'scale(0.8)';
        }, 1800);
        
        setTimeout(() => {
            if (leyline.parentNode) {
                leyline.parentNode.removeChild(leyline);
            }
        }, 2200);
    }

    // Play youkai buster animation for Youkai Buster skill
    playYoukaieBusterAnimation(onHitCallback) {
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!opponentSprite) return;

        // Get opponent position
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Calculate center position of opponent
        const centerX = opponentRect.left + opponentRect.width / 2;
        const centerY = opponentRect.top + opponentRect.height / 2;
        
        // Create multiple knives from different directions (fan formation)
        const knifeCount = 8; // 8 knives from different angles
        const knives = [];
        const radius = 400; // Distance from opponent to spawn knives
        
        for (let i = 0; i < knifeCount; i++) {
            const knife = document.createElement('img');
            knife.src = '/item/knives1.png';
            knife.style.position = 'fixed';
            knife.style.width = '30px';
            knife.style.height = '30px';
            knife.style.zIndex = '1000';
            knife.style.pointerEvents = 'none';
            knife.style.transition = 'all 0.6s ease-in';
            knife.style.opacity = '0';
            
            // Calculate angle for fan formation (360 degrees divided by knife count)
            const angle = (i * 360 / knifeCount) * Math.PI / 180;
            
            // Start position (around opponent in a circle)
            const startX = centerX + Math.cos(angle) * radius;
            const startY = centerY + Math.sin(angle) * radius;
            
            knife.style.left = (startX - 15) + 'px';
            knife.style.top = (startY - 15) + 'px';
            
            // Rotate knife to point toward opponent
            const rotationAngle = (angle * 180 / Math.PI) + 180; // Point toward center
            knife.style.transform = `rotate(${rotationAngle}deg)`;
            
            document.body.appendChild(knife);
            knives.push(knife);
            
            // Animate each knife with slight delay
            setTimeout(() => {
                knife.style.opacity = '1';
                // Target position (opponent center with slight random spread)
                const targetOffsetX = (Math.random() - 0.5) * 60;
                const targetOffsetY = (Math.random() - 0.5) * 60;
                knife.style.left = (centerX - 15 + targetOffsetX) + 'px';
                knife.style.top = (centerY - 15 + targetOffsetY) + 'px';
                knife.style.transform = `rotate(${rotationAngle}deg) scale(1.2)`;
                
                // Add glowing effect
                knife.style.filter = 'drop-shadow(0 0 8px rgba(255,0,0,0.8)) brightness(1.2)';
            }, 100 + i * 80); // Stagger the launches
        }
        
        // Trigger hit effect when the last knife reaches target
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 100 + (knifeCount - 1) * 80 + 600); // Last knife delay + animation time
        
        // Remove all knives after animation
        setTimeout(() => {
            knives.forEach(knife => {
                if (knife.parentNode) {
                    knife.parentNode.removeChild(knife);
                }
            });
        }, 100 + (knifeCount - 1) * 80 + 800);
    }

    // Play dream seal animation for Spirit Sign Dream Seal skill
    playDreamSealAnimation(onHitCallback) {
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!opponentSprite) return;

        // Get opponent position
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Calculate center position of opponent
        const centerX = opponentRect.left + opponentRect.width / 2;
        const centerY = opponentRect.top + opponentRect.height / 2;
        
        // Create dream seal element
        const dreamSeal = document.createElement('img');
        dreamSeal.src = '/item/skill.png';
        dreamSeal.style.position = 'fixed';
        dreamSeal.style.left = (centerX - 175) + 'px'; // Center the 350px image
        dreamSeal.style.top = (centerY - 175) + 'px';
        dreamSeal.style.width = '350px';  // Ultra large size
        dreamSeal.style.height = '350px';
        dreamSeal.style.zIndex = '1000';
        dreamSeal.style.pointerEvents = 'none';
        dreamSeal.style.opacity = '0';
        dreamSeal.style.transition = 'opacity 0.3s ease-in, transform 0.1s linear';
        dreamSeal.style.transformOrigin = 'center center';
        dreamSeal.style.filter = 'drop-shadow(0 0 20px rgba(255,255,255,0.8)) brightness(1.2)';
        
        document.body.appendChild(dreamSeal);
        
        // Animate dream seal appearance
        setTimeout(() => {
            dreamSeal.style.opacity = '1';
        }, 100);
        
        // Start continuous rotation animation
        let rotationAngle = 0;
        const rotationSpeed = 5; // degrees per frame
        
        const rotateAnimation = setInterval(() => {
            rotationAngle += rotationSpeed;
            dreamSeal.style.transform = `rotate(${rotationAngle}deg) scale(1.1)`;
        }, 16); // ~60fps
        
        // Create CSS animation for pulsing glow if it doesn't exist
        if (!document.getElementById('dream-seal-animation-style')) {
            const style = document.createElement('style');
            style.id = 'dream-seal-animation-style';
            style.textContent = `
                @keyframes dreamSealPulse {
                    0% { 
                        filter: drop-shadow(0 0 20px rgba(255,255,255,0.8)) brightness(1.2);
                        transform: scale(1.1);
                    }
                    50% { 
                        filter: drop-shadow(0 0 30px rgba(255,255,255,1)) brightness(1.5);
                        transform: scale(1.2);
                    }
                    100% { 
                        filter: drop-shadow(0 0 20px rgba(255,255,255,0.8)) brightness(1.2);
                        transform: scale(1.1);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add pulsing effect after initial appearance
        setTimeout(() => {
            dreamSeal.style.animation = 'dreamSealPulse 0.5s ease-in-out infinite';
        }, 300);
        
        // Trigger hit effect after power1.wav duration (approximately 1.5 seconds)
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 1500);
        
        // Remove dream seal after power1.wav finishes (approximately 2 seconds)
        setTimeout(() => {
            clearInterval(rotateAnimation);
            dreamSeal.style.opacity = '0';
            dreamSeal.style.transform = `rotate(${rotationAngle}deg) scale(0.5)`;
        }, 2000);
        
        setTimeout(() => {
            if (dreamSeal.parentNode) {
                dreamSeal.parentNode.removeChild(dreamSeal);
            }
        }, 2300);
    }

    // Play master spark animation for Love Sign Master Spark skill
    playMasterSparkAnimation(onHitCallback) {
        const userSprite = document.querySelector('.character-sprite');
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!userSprite || !opponentSprite) return;

        // Get positions
        const userRect = userSprite.getBoundingClientRect();
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Calculate laser beam dimensions and position
        const startX = userRect.left + userRect.width / 2;
        const startY = userRect.top + userRect.height / 2;
        const endX = opponentRect.left + opponentRect.width / 2;
        const endY = opponentRect.top + opponentRect.height / 2;
        
        // Calculate distance and angle
        const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
        
        // Create massive master spark laser beam
        const masterSpark = document.createElement('div');
        masterSpark.style.position = 'fixed';
        masterSpark.style.left = startX + 'px';
        masterSpark.style.top = (startY - 200) + 'px'; // Center the ultra massive beam vertically
        masterSpark.style.width = '0px'; // Start with 0 width
        masterSpark.style.height = '400px'; // Ultra massive beam thickness (20x normal laser)
        masterSpark.style.background = 'linear-gradient(90deg, rgba(255,255,0,1) 0%, rgba(255,255,255,1) 20%, rgba(255,215,0,1) 40%, rgba(255,255,255,1) 60%, rgba(255,255,0,1) 80%, rgba(255,255,255,1) 100%)';
        masterSpark.style.boxShadow = '0 0 80px #ffff00, 0 0 160px #ffffff, 0 0 240px #ffd700, inset 0 0 40px rgba(255,255,255,0.8)';
        masterSpark.style.borderRadius = '200px';
        masterSpark.style.zIndex = '1000';
        masterSpark.style.pointerEvents = 'none';
        masterSpark.style.transformOrigin = 'left center';
        masterSpark.style.transform = `rotate(${angle}deg)`;
        masterSpark.style.transition = 'width 0.3s ease-out, opacity 0.4s ease-out';
        masterSpark.style.opacity = '0';
        
        // Add outer glow layer
        const outerGlow = document.createElement('div');
        outerGlow.style.position = 'fixed';
        outerGlow.style.left = startX + 'px';
        outerGlow.style.top = (startY - 250) + 'px';
        outerGlow.style.width = '0px';
        outerGlow.style.height = '500px';
        outerGlow.style.background = 'radial-gradient(ellipse, rgba(255,255,0,0.6) 0%, rgba(255,215,0,0.4) 50%, transparent 100%)';
        outerGlow.style.borderRadius = '250px';
        outerGlow.style.zIndex = '999';
        outerGlow.style.pointerEvents = 'none';
        outerGlow.style.transformOrigin = 'left center';
        outerGlow.style.transform = `rotate(${angle}deg)`;
        outerGlow.style.transition = 'width 0.3s ease-out, opacity 0.4s ease-out';
        outerGlow.style.opacity = '0';
        
        document.body.appendChild(outerGlow);
        document.body.appendChild(masterSpark);
        
        // Animate master spark appearance with screen flash
        setTimeout(() => {
            // Flash the entire screen white briefly
            const screenFlash = document.createElement('div');
            screenFlash.style.position = 'fixed';
            screenFlash.style.top = '0';
            screenFlash.style.left = '0';
            screenFlash.style.width = '100vw';
            screenFlash.style.height = '100vh';
            screenFlash.style.background = 'rgba(255,255,255,0.8)';
            screenFlash.style.zIndex = '998';
            screenFlash.style.pointerEvents = 'none';
            screenFlash.style.transition = 'opacity 0.2s ease-out';
            document.body.appendChild(screenFlash);
            
            setTimeout(() => {
                screenFlash.style.opacity = '0';
                setTimeout(() => {
                    if (screenFlash.parentNode) {
                        screenFlash.parentNode.removeChild(screenFlash);
                    }
                }, 200);
            }, 100);
            
            // Show the laser beams - extend much further beyond target
            outerGlow.style.opacity = '1';
            outerGlow.style.width = (distance + 800) + 'px'; // Extend 800px beyond target
            masterSpark.style.opacity = '1';
            masterSpark.style.width = (distance + 600) + 'px'; // Extend 600px beyond target
        }, 100);
        
        // Trigger hit effect when master spark reaches target
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 400); // 100ms delay + 300ms width animation = 400ms total
        
        // Add intense pulsing effect after hit
        setTimeout(() => {
            masterSpark.style.animation = 'masterSparkPulse 0.08s ease-in-out infinite alternate';
            outerGlow.style.animation = 'masterSparkGlow 0.12s ease-in-out infinite alternate';
        }, 450);
        
        // Create CSS animations for master spark if they don't exist
        if (!document.getElementById('master-spark-animation-style')) {
            const style = document.createElement('style');
            style.id = 'master-spark-animation-style';
            style.textContent = `
                @keyframes masterSparkPulse {
                    0% { 
                        box-shadow: 0 0 80px #ffff00, 0 0 160px #ffffff, 0 0 240px #ffd700, inset 0 0 40px rgba(255,255,255,0.8);
                        filter: brightness(1.2);
                        height: 400px;
                    }
                    100% { 
                        box-shadow: 0 0 120px #ffff00, 0 0 240px #ffffff, 0 0 360px #ffd700, inset 0 0 60px rgba(255,255,255,1);
                        filter: brightness(1.8);
                        height: 420px;
                    }
                }
                @keyframes masterSparkGlow {
                    0% { 
                        background: radial-gradient(ellipse, rgba(255,255,0,0.6) 0%, rgba(255,215,0,0.4) 50%, transparent 100%);
                        height: 500px;
                    }
                    100% { 
                        background: radial-gradient(ellipse, rgba(255,255,0,0.8) 0%, rgba(255,215,0,0.6) 50%, rgba(255,255,0,0.2) 100%);
                        height: 520px;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove master spark after nep00.wav finishes (approximately 2.5 seconds)
        setTimeout(() => {
            masterSpark.style.opacity = '0';
            outerGlow.style.opacity = '0';
            masterSpark.style.width = '0px';
            outerGlow.style.width = '0px';
        }, 2500); // Match nep00.wav duration
        
        setTimeout(() => {
            if (masterSpark.parentNode) {
                masterSpark.parentNode.removeChild(masterSpark);
            }
            if (outerGlow.parentNode) {
                outerGlow.parentNode.removeChild(outerGlow);
            }
        }, 2800); // Clean up 300ms after fade out
    }

    // Play magic missile animation for Magic Missile skill
    playMagicMissileAnimation(onHitCallback) {
        const userSprite = document.querySelector('.character-sprite');
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!userSprite || !opponentSprite) return;

        // Get positions
        const userRect = userSprite.getBoundingClientRect();
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Create multiple missiles (3-5 missiles)
        const missileCount = 4;
        const missiles = [];
        
        for (let i = 0; i < missileCount; i++) {
            const missile = document.createElement('img');
            missile.src = '/item/ballss.png';
            missile.style.position = 'fixed';
            missile.style.width = '25px';
            missile.style.height = '25px';
            missile.style.zIndex = '1000';
            missile.style.pointerEvents = 'none';
            missile.style.transition = 'all 0.6s ease-out';
            missile.style.opacity = '0';
            
            // Start position (from user sprite with slight random offset)
            const offsetX = (Math.random() - 0.5) * 40; // Random spread
            const offsetY = (Math.random() - 0.5) * 30;
            missile.style.left = (userRect.right - 12.5 + offsetX) + 'px';
            missile.style.top = (userRect.top + userRect.height / 2 - 12.5 + offsetY) + 'px';
            
            document.body.appendChild(missile);
            missiles.push(missile);
            
            // Animate each missile with slight delay
            setTimeout(() => {
                missile.style.opacity = '1';
                // Target position with slight random spread
                const targetOffsetX = (Math.random() - 0.5) * 60;
                const targetOffsetY = (Math.random() - 0.5) * 40;
                missile.style.left = (opponentRect.left + opponentRect.width / 2 - 12.5 + targetOffsetX) + 'px';
                missile.style.top = (opponentRect.top + opponentRect.height / 2 - 12.5 + targetOffsetY) + 'px';
                missile.style.transform = 'scale(1.2) rotate(360deg)';
                
                // Add glowing effect
                missile.style.filter = 'drop-shadow(0 0 10px #00ffff) brightness(1.3)';
            }, 100 + i * 150); // Stagger the launches
        }
        
        // Trigger hit effect when the last missile reaches target
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 100 + (missileCount - 1) * 150 + 600); // Last missile delay + animation time
        
        // Remove all missiles after animation
        setTimeout(() => {
            missiles.forEach(missile => {
                if (missile.parentNode) {
                    missile.parentNode.removeChild(missile);
                }
            });
        }, 100 + (missileCount - 1) * 150 + 800);
    }

    // Play knife throwing animation for Hakurei Amulet skill
    playKnifeThrowAnimation() {
        const userSprite = document.querySelector('.character-sprite');
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!userSprite || !opponentSprite) return;

        // Get positions
        const userRect = userSprite.getBoundingClientRect();
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Create multiple knives (5-7 knives)
        const knifeCount = 6;
        const knives = [];
        
        for (let i = 0; i < knifeCount; i++) {
            const knife = document.createElement('img');
            knife.src = '/item/knives1.png';
            knife.style.position = 'fixed';
            knife.style.width = '35px';  // Phóng to từ 25px lên 35px
            knife.style.height = '35px'; // Phóng to từ 25px lên 35px
            knife.style.zIndex = '1000';
            knife.style.pointerEvents = 'none';
            knife.style.transition = 'all 0.4s ease-out';
            knife.style.opacity = '0';
            
            // Start position (from user sprite with spread formation)
            const spreadAngle = (i - (knifeCount - 1) / 2) * 15; // Spread knives in fan formation
            const offsetX = Math.sin(spreadAngle * Math.PI / 180) * 30;
            const offsetY = Math.cos(spreadAngle * Math.PI / 180) * 20;
            
            knife.style.left = (userRect.right - 17.5 + offsetX) + 'px'; // Điều chỉnh center cho size mới
            knife.style.top = (userRect.top + userRect.height / 2 - 17.5 + offsetY) + 'px';
            knife.style.transform = 'rotate(0deg)'; // Cố định không xoay
            
            document.body.appendChild(knife);
            knives.push(knife);
            
            // Animate each knife with slight delay
            setTimeout(() => {
                knife.style.opacity = '1';
                // Target position with slight spread around opponent
                const targetOffsetX = (Math.random() - 0.5) * 80;
                const targetOffsetY = (Math.random() - 0.5) * 60;
                knife.style.left = (opponentRect.left + opponentRect.width / 2 - 17.5 + targetOffsetX) + 'px';
                knife.style.top = (opponentRect.top + opponentRect.height / 2 - 17.5 + targetOffsetY) + 'px';
                knife.style.transform = 'rotate(0deg) scale(1.2)'; // Cố định không xoay, chỉ scale lớn hơn
                
                // Add glowing effect without spinning
                knife.style.filter = 'drop-shadow(0 0 5px rgba(255,255,255,0.8))';
            }, 80 + i * 100); // Stagger the throws
        }
        
        // Remove all knives after animation
        setTimeout(() => {
            knives.forEach(knife => {
                if (knife.parentNode) {
                    knife.parentNode.removeChild(knife);
                }
            });
        }, 80 + (knifeCount - 1) * 100 + 500);
    }

    // Play character-specific basic attack animation
    playBasicAttackAnimation(onHitCallback) {
        // Get current user character from sessionStorage
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
        const userCharacter = roomCharacterSelections[user.username];
        
        const userSprite = document.querySelector('.character-sprite');
        const opponentSprite = document.querySelector('.opponent-sprite');
        
        if (!userSprite || !opponentSprite || !userCharacter) return;

        // Get positions
        const userRect = userSprite.getBoundingClientRect();
        const opponentRect = opponentSprite.getBoundingClientRect();
        
        // Create projectile element based on character
        const projectile = document.createElement('img');
        
        if (userCharacter === 'reimu') {
            projectile.src = '/item/knives1.png';
            projectile.style.transform = 'rotate(0deg)';
        } else if (userCharacter === 'marisa') {
            projectile.src = '/item/ballss.png';
            projectile.style.transform = 'rotate(0deg)';
        } else {
            return; // Unknown character
        }
        
        projectile.style.position = 'fixed';
        projectile.style.width = '30px';
        projectile.style.height = '30px';
        projectile.style.zIndex = '1000';
        projectile.style.pointerEvents = 'none';
        projectile.style.transition = 'all 0.5s ease-out';
        
        // Start position (from user sprite)
        projectile.style.left = (userRect.right - 15) + 'px';
        projectile.style.top = (userRect.top + userRect.height / 2 - 15) + 'px';
        
        document.body.appendChild(projectile);
        
        // Animate to opponent center
        setTimeout(() => {
            projectile.style.left = (opponentRect.left + opponentRect.width / 2 - 15) + 'px';
            projectile.style.top = (opponentRect.top + opponentRect.height / 2 - 15) + 'px';
            
            if (userCharacter === 'reimu') {
                projectile.style.transform = 'rotate(0deg) scale(1.2)';
            } else if (userCharacter === 'marisa') {
                projectile.style.transform = 'scale(1.2)';
            }
        }, 50);
        
        // Trigger hit effect when projectile reaches target
        setTimeout(() => {
            if (onHitCallback) {
                onHitCallback();
            }
        }, 550); // 550ms = when projectile reaches target (50ms delay + 500ms animation)
        
        // Remove projectile after animation
        setTimeout(() => {
            if (projectile.parentNode) {
                projectile.parentNode.removeChild(projectile);
            }
        }, 600);
    }

    // Clear action selection
    clearActionSelection() {
        const actionItems = document.querySelectorAll('.action-item');
        actionItems.forEach(item => {
            item.classList.remove('selected');
            item.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            item.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            
            // Reset skill button text to remove previous skill name
            if (item.textContent.includes('Kỹ năng') || item.innerHTML.includes('Kỹ năng')) {
                item.innerHTML = 'Kỹ năng';
            }
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
            message = 'Bạn đã thắng!';
        } else {
            message = 'Bạn đã thua!';
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
        }, 2300);
    }

    // Initialize AI mode
    initializeAIMode() {
        console.log('Initializing AI combat mode');
        
        // Debug: Check MP before AI initialization
        console.log('=== BEFORE AI INITIALIZATION ===');
        console.log('Before AI init playerMP:', this.gameState.playerMP);
        console.log('Before AI init opponentMP:', this.gameState.opponentMP);
        
        // Force load skills with multiple attempts
        this.loadAISkills();
        
        // Set up periodic skill loading check
        this.skillLoadInterval = setInterval(() => {
            if (this.aiSkills.length === 0) {
                console.log('Retrying AI skill loading...');
                this.loadAISkills();
            } else {
                clearInterval(this.skillLoadInterval);
            }
        }, 1000);
        
        // Force MP to 150 after AI initialization
        this.gameState.playerMP = 150;
        this.gameState.opponentMP = 150;
        
        console.log('=== AFTER AI INITIALIZATION ===');
        console.log('After AI init playerMP:', this.gameState.playerMP);
        console.log('After AI init opponentMP:', this.gameState.opponentMP);
    }

    // Load AI skills with multiple fallback methods
    loadAISkills() {
        console.log('Attempting to load AI skills...');
        console.log('window.skillManager exists:', !!window.skillManager);
        
        // Method 1: Direct skillManager access
        if (window.skillManager && window.skillManager.skills) {
            this.aiSkills = Object.values(window.skillManager.skills);
            console.log('Method 1 - AI skills loaded:', this.aiSkills.length);
            if (this.aiSkills.length > 0) {
                console.log('Available AI skills:', this.aiSkills.map(s => s.name));
                return;
            }
        }
        
        // Method 2: Try getAllSkills method
        if (window.skillManager && window.skillManager.getAllSkills) {
            this.aiSkills = window.skillManager.getAllSkills();
            console.log('Method 2 - AI skills loaded:', this.aiSkills.length);
            if (this.aiSkills.length > 0) {
                console.log('Available AI skills:', this.aiSkills.map(s => s.name));
                return;
            }
        }
        
        // Method 3: Hardcode basic skills as fallback
        console.log('Fallback: Using hardcoded skills');
        this.aiSkills = [
            {
                id: 'youkai_buster',
                name: 'Youkai Buster',
                damage: 25,
                heal: 0,
                mpCost: 50,
                description: 'Powerful attack skill'
            },
            {
                id: 'dimensional_rift',
                name: 'Dimensional Rift',
                damage: 15,
                heal: 0,
                mpCost: 10,
                description: 'Basic damage skill'
            },
            {
                id: 'witch_leyline',
                name: 'Witch Leyline',
                damage: 10,
                heal: 0,
                mpCost: 30,
                special: 'enhance_attack_2_turns',
                description: 'Buff attack for 2 turns'
            }
        ];
        console.log('Hardcoded AI skills loaded:', this.aiSkills.length);
        console.log('Available AI skills:', this.aiSkills.map(s => s.name));
    }

    // Simulate AI opponent action
    simulateAIOpponentAction() {
        console.log('AI is choosing action...');
        console.log('AI MP available:', this.gameState.opponentMP);
        console.log('AI skills loaded:', this.aiSkills.length);
        
        // AI decision logic with improved intelligence
        let aiAction = 'attack';
        let aiSkill = null;
        
        const opponentHP = this.gameState.opponentHP;
        const opponentMP = this.gameState.opponentMP;
        const playerHP = this.gameState.playerHP;
        const opponentDefenseCount = this.gameState.opponentDefenseCount;
        
        // Strategic defense when HP is low (< 30%)
        if (opponentHP < 45 && opponentDefenseCount > 0 && Math.random() < 0.4) {
            aiAction = 'defense';
        }
        // Very aggressive skill usage - 95% chance when MP >= 20
        else if (opponentMP >= 20 && Math.random() < 0.95 && this.aiSkills.length > 0) {
            // Filter skills AI can afford
            const affordableSkills = this.aiSkills.filter(skill => skill.mpCost <= opponentMP);
            console.log('Affordable skills for AI:', affordableSkills.length);
            
            if (affordableSkills.length > 0) {
                // Smart skill selection based on situation
                let selectedSkill;
                
                // Always prioritize healing when HP < 60%
                if (opponentHP < 90) {
                    const healingSkills = affordableSkills.filter(skill => skill.heal > 0);
                    console.log('Healing skills available:', healingSkills.length);
                    if (healingSkills.length > 0 && Math.random() < 0.9) {
                        selectedSkill = healingSkills[Math.floor(Math.random() * healingSkills.length)];
                        console.log('AI selected healing skill:', selectedSkill.name);
                    }
                }
                
                // Prioritize high damage skills when player HP > 50%
                if (!selectedSkill && playerHP > 75) {
                    const damageSkills = affordableSkills.filter(skill => skill.damage >= 15);
                    console.log('Damage skills available:', damageSkills.length);
                    if (damageSkills.length > 0 && Math.random() < 0.9) {
                        selectedSkill = damageSkills[Math.floor(Math.random() * damageSkills.length)];
                        console.log('AI selected damage skill:', selectedSkill.name);
                    }
                }
                
                // Use buff skills when at good health
                if (!selectedSkill && opponentHP >= 120) {
                    const buffSkills = affordableSkills.filter(skill => skill.special && skill.special.includes('enhance'));
                    console.log('Buff skills available:', buffSkills.length);
                    if (buffSkills.length > 0 && Math.random() < 0.8) {
                        selectedSkill = buffSkills[Math.floor(Math.random() * buffSkills.length)];
                        console.log('AI selected buff skill:', selectedSkill.name);
                    }
                }
                
                // Use any available skill if no specific strategy applies
                if (!selectedSkill && Math.random() < 0.9) {
                    selectedSkill = affordableSkills[Math.floor(Math.random() * affordableSkills.length)];
                    console.log('AI selected random skill:', selectedSkill.name);
                }
                
                if (selectedSkill) {
                    aiAction = 'skill';
                    aiSkill = selectedSkill;
                    console.log('Final AI action: skill -', selectedSkill.name);
                } else {
                    console.log('No skill selected, defaulting to attack');
                }
            } else {
                console.log('No affordable skills available');
            }
        }
        // Medium skill usage even with low MP - 70% chance when MP >= 10
        else if (opponentMP >= 10 && Math.random() < 0.7 && this.aiSkills.length > 0) {
            const affordableSkills = this.aiSkills.filter(skill => skill.mpCost <= opponentMP);
            
            if (affordableSkills.length > 0) {
                aiAction = 'skill';
                aiSkill = affordableSkills[Math.floor(Math.random() * affordableSkills.length)];
            }
        }
        // Tactical defense - 15% chance when has defense uses
        else if (opponentDefenseCount > 0 && Math.random() < 0.15) {
            aiAction = 'defense';
        }
        
        // Set AI action
        this.gameState.opponentAction = aiAction;
        this.gameState.opponentSkill = aiSkill;
        
        console.log('AI selected:', aiAction, aiSkill ? `with skill: ${aiSkill.name}` : '');
        
        // Update status
        if (aiSkill) {
            this.updateStatus(`AI sử dụng skill: ${aiSkill.name}`);
        } else if (aiAction === 'defense') {
            this.updateStatus('AI chọn phòng thủ');
        } else {
            this.updateStatus('AI chọn tấn công');
        }
        
        // Resolve turn after short delay
        setTimeout(() => {
            this.requestTurnResolution();
        }, 1000);
    }

    // Resolve AI turn locally
    resolveAITurn() {
        console.log('Resolving AI turn locally');
        
        const playerAction = this.gameState.playerAction;
        const opponentAction = this.gameState.opponentAction;
        const playerSkill = this.gameState.playerSkill;
        const opponentSkill = this.gameState.opponentSkill;
        
        let playerDamage = 0;
        let opponentDamage = 0;
        let playerHeal = 0;
        let opponentHeal = 0;
        let playerMPUsed = 0;
        let opponentMPUsed = 0;
        let playerDefenseUsed = false;
        let opponentDefenseUsed = false;
        
        // Calculate player action effects
        if (playerAction === 'attack') {
            playerDamage = 10 + this.gameState.playerAttackBonus;
        } else if (playerAction === 'skill' && playerSkill) {
            playerDamage = playerSkill.damage + this.gameState.playerAttackBonus;
            playerHeal = playerSkill.heal || 0;
            playerMPUsed = playerSkill.mpCost;
            
            // Handle Spirit Sign "Dream Seal" execute logic
            if (playerSkill.name === 'Spirit Sign "Dream Seal"') {
                const opponentHPAfterDamage = this.gameState.opponentHP - playerDamage;
                if (opponentHPAfterDamage <= 10 && opponentHPAfterDamage > 0) {
                    playerDamage = this.gameState.opponentHP; // Execute - deal exactly enough damage to kill
                    console.log('Spirit Sign Dream Seal execute triggered! Opponent HP after damage would be:', opponentHPAfterDamage);
                }
            }
        } else if (playerAction === 'defense') {
            playerDefenseUsed = this.gameState.playerDefenseCount > 0;
        }
        
        // Calculate opponent action effects
        if (opponentAction === 'attack') {
            opponentDamage = 10 + this.gameState.opponentAttackBonus;
        } else if (opponentAction === 'skill' && opponentSkill) {
            opponentDamage = opponentSkill.damage + this.gameState.opponentAttackBonus;
            opponentHeal = opponentSkill.heal || 0;
            opponentMPUsed = opponentSkill.mpCost;
        } else if (opponentAction === 'defense') {
            opponentDefenseUsed = this.gameState.opponentDefenseCount > 0;
        }
        
        // Apply defense blocking
        if (playerDefenseUsed && opponentDamage > 0) {
            opponentDamage = 0;
            this.gameState.playerDefenseCount = Math.max(0, this.gameState.playerDefenseCount - 1);
        }
        
        if (opponentDefenseUsed && playerDamage > 0) {
            playerDamage = 0;
            this.gameState.opponentDefenseCount = Math.max(0, this.gameState.opponentDefenseCount - 1);
        }
        
        // Note: MP costs will be applied in resolveTurn() to avoid double consumption
        console.log('=== AI MODE - PREPARING TURN DATA ===');
        console.log('Current playerMP before turn resolution:', this.gameState.playerMP);
        console.log('Player MP cost to be applied:', playerMPUsed);
        console.log('Current opponentMP before turn resolution:', this.gameState.opponentMP);
        console.log('Opponent MP cost to be applied:', opponentMPUsed);
        
        // Create turn resolution data
        const turnData = {
            playerDamage,
            opponentDamage,
            playerHeal,
            opponentHeal,
            playerMPUsed,
            opponentMPUsed,
            playerDefenseUsed,
            opponentDefenseUsed,
            playerAction,
            opponentAction,
            playerSkill,
            opponentSkill,
            playerAttackBonus: 0,
            playerAttackBonusTurns: 0,
            opponentAttackBonus: 0,
            opponentAttackBonusTurns: 0
        };
        
        // Handle special skill effects
        if (playerSkill && playerSkill.name === 'Witch Leyline') {
            this.gameState.playerAttackBonus = 15;
            this.gameState.playerAttackBonusTurns = 3;
            turnData.playerAttackBonus = 15;
            turnData.playerAttackBonusTurns = 3;
        }
        
        if (opponentSkill && opponentSkill.name === 'Witch Leyline') {
            this.gameState.opponentAttackBonus = 15;
            this.gameState.opponentAttackBonusTurns = 3;
            turnData.opponentAttackBonus = 15;
            turnData.opponentAttackBonusTurns = 3;
        }
        
        // Resolve turn with calculated data
        this.resolveTurn(turnData);
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
        
        // Debug: Log MP after fallback creation
        console.log('=== FALLBACK COMBAT SYSTEM CREATED ===');
        console.log('Fallback playerMP:', combatSystem.gameState.playerMP);
        console.log('Fallback opponentMP:', combatSystem.gameState.opponentMP);
    }
    return window.combatSystem;
};
