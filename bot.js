/**
 * Bot AI cho Touhou Card Game
 * Quản lý logic AI, chiến thuật và quyết định của máy tính
 */

// Import game rules
const path = require('path');
const fs = require('fs');

let rules;
try {
    rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json')));
} catch (error) {
    console.error('Could not load rules.json, using default rules');
    rules = {
        HP_START: 100,
        HAND_SIZE: 4,
        DECK_MAX: 15,
        TYPE_LIMIT: 6,
        TURN_SECONDS: 30,
        TURN_LIMIT: 15,
        CARD_VALUES: { attack: 30, defend: 25, heal: 35 },
        SPECIALS: {
            Miko: { bonus: 20 },
            Witch: { bonus: 15 },
            Sakuya: { bonus: 10 }
        }
    };
}

/**
 * AI Bot Class - Đại diện cho một đối thủ AI
 */
class AIBot {
    constructor(name = "AI Bot", character = "Witch", difficulty = "medium") {
        this.id = "ai-bot-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
        this.name = name;
        this.character = character;
        this.difficulty = difficulty; // easy, medium, hard, expert
        this.hp = rules.HP_START;
        this.shield = 0;
        this.deck = [];
        this.hand = [];
        this.discard = [];
        this.specialUsed = false;
        
        // AI personality traits
        this.aggressiveness = this.getAggressiveness();
        this.defensiveness = this.getDefensiveness();
        this.healingTendency = this.getHealingTendency();
        
        // Memory of opponent's actions
        this.opponentHistory = [];
        this.turnHistory = [];
        
        console.log(`AI Bot created: ${this.name} (${this.character}) - Difficulty: ${this.difficulty}`);
    }

    /**
     * Sinh deck cân bằng cho AI dựa trên character và difficulty
     */
    generateDeck() {
        const deck = [];
        
        // Deck composition based on character
        let attackCards, defendCards, healCards, curseCards;
        switch (this.character) {
            case "Witch":
                attackCards = 5; defendCards = 3; healCards = 4; curseCards = 3; break;
            case "Miko":
                attackCards = 4; defendCards = 3; healCards = 5; curseCards = 3; break;
            case "Sakuya":
                attackCards = 3; defendCards = 5; healCards = 4; curseCards = 3; break;
            default:
                attackCards = 4; defendCards = 4; healCards = 4; curseCards = 3;
        }
        if (this.difficulty === "easy") {
            const adjustment = Math.floor(Math.random() * 2) - 1;
            attackCards += adjustment;
            defendCards -= adjustment;
        } else if (this.difficulty === "expert") {
            attackCards = Math.min(5, attackCards + 1);
            healCards = Math.max(3, healCards - 1);
        }
        for (let i = 0; i < attackCards; i++) deck.push("attack");
        for (let i = 0; i < defendCards; i++) deck.push("defend");
        for (let i = 0; i < healCards; i++) deck.push("heal");
        for (let i = 0; i < curseCards; i++) deck.push("curse");
        this.deck = this.shuffle(deck);
        this.hand = [];
        this.discard = [];
        this.drawCards(rules.HAND_SIZE);
        console.log(`AI ${this.name} generated deck: ${attackCards}A/${defendCards}D/${healCards}H/${curseCards}C`);
        return this.deck;
    }

    /**
     * Rút bài từ deck
     */
    drawCards(count) {
        const drawn = [];
        for (let i = 0; i < count; i++) {
            if (this.deck.length === 0) {
                // Reshuffle discard pile
                this.deck = this.shuffle([...this.discard]);
                this.discard = [];
                if (this.deck.length === 0) break;
            }
            const card = this.deck.pop();
            if (card) {
                this.hand.push(card);
                drawn.push(card);
            }
        }
        return drawn;
    }

    /**
     * Shuffle array
     */
    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Main decision making function
     */
    makeDecision(gameState) {
        if (this.hand.length === 0) {
            return { cardIndex: null, useSpecial: false };
        }

        const opponentHp = this.getOpponentHp(gameState);
        const opponentShield = this.getOpponentShield(gameState);
        const turn = gameState.turn || 0;

        // Record game state for learning
        this.recordGameState(gameState, opponentHp, opponentShield, turn);

        let decision;
        switch (this.difficulty) {
            case "easy":
                decision = this.easyStrategy(opponentHp, opponentShield, turn);
                break;
            case "medium":
                decision = this.mediumStrategy(opponentHp, opponentShield, turn);
                break;
            case "hard":
                decision = this.hardStrategy(opponentHp, opponentShield, turn);
                break;
            case "expert":
                decision = this.expertStrategy(opponentHp, opponentShield, turn);
                break;
            default:
                decision = this.mediumStrategy(opponentHp, opponentShield, turn);
        }
        // Nếu bị curse, ưu tiên dùng heal nếu có
        if (this.curse && this.curse.turns > 0 && this.hand.includes("heal")) {
            decision = { cardIndex: this.hand.indexOf("heal"), useSpecial: false };
        }

        console.log(`AI ${this.name} decision: Card ${decision.cardIndex} (${this.hand[decision.cardIndex]}), Special: ${decision.useSpecial}`);
        return decision;
    }

    /**
     * Easy AI Strategy - Random with slight preference
     */
    easyStrategy(opponentHp, opponentShield, turn) {
        // 70% random, 30% basic logic
        if (Math.random() < 0.7) {
            return {
                cardIndex: Math.floor(Math.random() * this.hand.length),
                useSpecial: Math.random() < 0.1 // 10% chance to use special
            };
        }

        // Basic logic 30% of the time
        if (this.hp <= 30 && this.hand.includes("heal")) {
            return {
                cardIndex: this.hand.indexOf("heal"),
                useSpecial: false
            };
        }

        const attackIndex = this.hand.indexOf("attack");
        return {
            cardIndex: attackIndex !== -1 ? attackIndex : 0,
            useSpecial: false
        };
    }

    /**
     * Medium AI Strategy - Basic tactical thinking
     */
    mediumStrategy(opponentHp, opponentShield, turn) {
        const priorities = [];

        // Evaluate each card
        this.hand.forEach((card, index) => {
            let score = this.baseCardScore(card);
            
            // Situational bonuses
            if (card === "heal" && this.hp <= 40) {
                score += 30; // High priority heal when low HP
            }
            
            if (card === "attack" && opponentHp <= 40) {
                score += 25; // Finish off low HP opponent
            }
            
            if (card === "defend" && this.shield <= 15) {
                score += 20; // Need shield
            }

            // Late game aggression
            if (turn >= 10 && card === "attack") {
                score += 15;
            }

            priorities.push({ index, card, score });
        });

        // Sort by priority
        priorities.sort((a, b) => b.score - a.score);
        const bestCard = priorities[0];

        return {
            cardIndex: bestCard.index,
            useSpecial: this.shouldUseSpecial(bestCard.card, turn, opponentHp)
        };
    }

    /**
     * Hard AI Strategy - Advanced tactical thinking
     */
    hardStrategy(opponentHp, opponentShield, turn) {
        const priorities = [];

        this.hand.forEach((card, index) => {
            let score = this.baseCardScore(card);
            
            // Advanced scoring
            if (card === "attack") {
                score += this.calculateAttackValue(opponentHp, opponentShield, turn);
            } else if (card === "heal") {
                score += this.calculateHealValue(turn);
            } else if (card === "defend") {
                score += this.calculateDefendValue(turn);
            }

            // Factor in opponent's likely strategy
            score += this.predictOpponentResponse(card, opponentHp, opponentShield);

            priorities.push({ index, card, score });
        });

        priorities.sort((a, b) => b.score - a.score);
        const bestCard = priorities[0];

        return {
            cardIndex: bestCard.index,
            useSpecial: this.shouldUseSpecialAdvanced(bestCard.card, turn, opponentHp, opponentShield)
        };
    }

    /**
     * Expert AI Strategy - Maximum optimization
     */
    expertStrategy(opponentHp, opponentShield, turn) {
        // Calculate all possible outcomes
        const scenarios = this.calculateAllScenarios(opponentHp, opponentShield, turn);
        
        // Choose the scenario with the best expected outcome
        let bestScenario = scenarios[0];
        let bestValue = -Infinity;

        scenarios.forEach(scenario => {
            const value = this.evaluateScenario(scenario, turn);
            if (value > bestValue) {
                bestValue = value;
                bestScenario = scenario;
            }
        });

        return {
            cardIndex: bestScenario.cardIndex,
            useSpecial: bestScenario.useSpecial
        };
    }

    /**
     * Calculate base score for each card type
     */
    baseCardScore(card) {
        switch (card) {
            case "attack": return 25;
            case "defend": return 20;
            case "heal": return 22;
            case "curse": return 30;
            default: return 15;
        }
    }

    /**
     * Calculate attack value based on situation
     */
    calculateAttackValue(opponentHp, opponentShield, turn) {
        let value = 0;
        
        // Lethal damage bonus
        const damage = rules.CARD_VALUES.attack;
        if (opponentHp - Math.max(0, damage - opponentShield) <= 0) {
            value += 100; // Can win this turn
        }
        
        // Pressure when opponent is low
        if (opponentHp <= 50) {
            value += 20;
        }
        
        // Shield bypass value
        if (opponentShield === 0) {
            value += 15;
        }
        
        // Late game aggression
        if (turn >= 8) {
            value += 10;
        }
        
        // Aggressiveness personality factor
        value += this.aggressiveness * 5;
        
        return value;
    }

    /**
     * Calculate heal value based on situation
     */
    calculateHealValue(turn) {
        let value = 0;
        
        // Critical HP
        if (this.hp <= 25) {
            value += 50;
        } else if (this.hp <= 50) {
            value += 30;
        } else if (this.hp <= 75) {
            value += 10;
        }
        
        // Early game healing is less urgent
        if (turn <= 3) {
            value -= 10;
        }
        
        // Healing tendency personality factor
        value += this.healingTendency * 8;
        
        return value;
    }

    /**
     * Calculate defend value based on situation
     */
    calculateDefendValue(turn) {
        let value = 0;
        
        // Shield value
        if (this.shield <= 10) {
            value += 25;
        } else if (this.shield <= 20) {
            value += 15;
        }
        
        // Predict opponent attack based on their history
        const attackProbability = this.predictOpponentAttack();
        value += attackProbability * 20;
        
        // Defensiveness personality factor
        value += this.defensiveness * 6;
        
        return value;
    }

    /**
     * Predict opponent's response to our card
     */
    predictOpponentResponse(myCard, opponentHp, opponentShield) {
        // Simple prediction based on opponent's likely optimal response
        let prediction = 0;
        
        if (myCard === "attack" && opponentHp <= 50) {
            // Opponent likely to heal or defend
            prediction -= 5;
        }
        
        if (myCard === "heal" && this.hp <= 30) {
            // Good timing for heal
            prediction += 5;
        }
        
        return prediction;
    }

    /**
     * Predict probability of opponent attacking
     */
    predictOpponentAttack() {
        if (this.opponentHistory.length === 0) return 0.4; // Default 40%
        
        const recentAttacks = this.opponentHistory.slice(-3).filter(action => action === "attack").length;
        return Math.min(0.8, 0.2 + (recentAttacks / 3) * 0.6);
    }

    /**
     * Should use special ability (basic)
     */
    shouldUseSpecial(card, turn, opponentHp) {
        if (this.specialUsed) return false;
        
        if (this.character === "Witch" && card === "attack") {
            return opponentHp <= 60 && turn >= 5;
        }
        
        if (this.character === "Miko" && card === "heal") {
            return this.hp <= 50;
        }
        
        if (this.character === "Sakuya" && card === "defend") {
            return this.shield <= 20 && turn >= 4;
        }
        
        return false;
    }

    /**
     * Advanced special ability usage
     */
    shouldUseSpecialAdvanced(card, turn, opponentHp, opponentShield) {
        if (this.specialUsed) return false;
        
        const bonus = rules.SPECIALS[this.character]?.bonus || 0;
        
        if (this.character === "Witch" && card === "attack") {
            const totalDamage = rules.CARD_VALUES.attack + bonus;
            const actualDamage = Math.max(0, totalDamage - opponentShield);
            
            // Use if it can finish opponent or deal significant damage
            return actualDamage >= opponentHp || actualDamage >= 40;
        }
        
        if (this.character === "Miko" && card === "heal") {
            const totalHeal = rules.CARD_VALUES.heal + bonus;
            const neededHeal = rules.HP_START - this.hp;
            
            // Use if we can benefit from the bonus significantly
            return neededHeal >= totalHeal - 10;
        }
        
        if (this.character === "Sakuya" && card === "defend") {
            // Use special defend when expecting heavy damage
            const attackThreat = this.predictOpponentAttack();
            return attackThreat > 0.6 && this.shield <= 30;
        }
        
        return false;
    }

    /**
     * Calculate all possible scenarios for expert AI
     */
    calculateAllScenarios(opponentHp, opponentShield, turn) {
        const scenarios = [];
        
        this.hand.forEach((card, index) => {
            // Scenario without special
            scenarios.push({
                cardIndex: index,
                card: card,
                useSpecial: false,
                expectedOutcome: this.simulateOutcome(card, false, opponentHp, opponentShield)
            });
            
            // Scenario with special (if available)
            if (!this.specialUsed && this.canUseSpecial(card)) {
                scenarios.push({
                    cardIndex: index,
                    card: card,
                    useSpecial: true,
                    expectedOutcome: this.simulateOutcome(card, true, opponentHp, opponentShield)
                });
            }
        });
        
        return scenarios;
    }

    /**
     * Simulate the outcome of playing a card
     */
    simulateOutcome(card, useSpecial, opponentHp, opponentShield) {
        const outcome = {
            myHpChange: 0,
            myShieldChange: 0,
            opponentHpChange: 0,
            opponentShieldChange: 0
        };
        
        const bonus = useSpecial ? (rules.SPECIALS[this.character]?.bonus || 0) : 0;
        
        if (card === "attack") {
            const damage = rules.CARD_VALUES.attack + bonus;
            const shieldAbsorbed = Math.min(opponentShield, damage);
            outcome.opponentShieldChange = -shieldAbsorbed;
            outcome.opponentHpChange = -(damage - shieldAbsorbed);
        } else if (card === "heal") {
            const healing = rules.CARD_VALUES.heal + bonus;
            outcome.myHpChange = Math.min(healing, rules.HP_START - this.hp);
        } else if (card === "defend") {
            outcome.myShieldChange = rules.CARD_VALUES.defend + bonus;
        }
        
        return outcome;
    }

    /**
     * Evaluate the value of a scenario
     */
    evaluateScenario(scenario, turn) {
        const outcome = scenario.expectedOutcome;
        let value = 0;
        
        // Value opponent HP damage highly
        value += -outcome.opponentHpChange * 2;
        
        // Value our healing
        value += outcome.myHpChange * 1.5;
        
        // Value shield based on situation
        value += outcome.myShieldChange * 1.2;
        
        // Penalty for letting opponent live when they're low
        const finalOpponentHp = this.getOpponentHp() + outcome.opponentHpChange;
        if (finalOpponentHp <= 20 && finalOpponentHp > 0) {
            value -= 10; // Missed kill opportunity
        }
        
        // Bonus for potential win
        if (finalOpponentHp <= 0) {
            value += 200;
        }
        
        return value;
    }

    /**
     * Check if special can be used with this card
     */
    canUseSpecial(card) {
        if (this.specialUsed) return false;
        
        switch (this.character) {
            case "Witch": return card === "attack";
            case "Miko": return card === "heal";
            case "Sakuya": return card === "defend";
            default: return false;
        }
    }

    /**
     * Record game state for learning
     */
    recordGameState(gameState, opponentHp, opponentShield, turn) {
        this.turnHistory.push({
            turn,
            myHp: this.hp,
            myShield: this.shield,
            opponentHp,
            opponentShield,
            handSize: this.hand.length
        });
        
        // Keep only recent history
        if (this.turnHistory.length > 10) {
            this.turnHistory.shift();
        }
    }

    /**
     * Get opponent HP from game state
     */
    getOpponentHp(gameState) {
        if (!gameState || !gameState.players) return 100;
        
        const opponentId = Object.keys(gameState.players).find(id => id !== this.id);
        return gameState.players[opponentId]?.hp || 100;
    }

    /**
     * Get opponent shield from game state
     */
    getOpponentShield(gameState) {
        if (!gameState || !gameState.players) return 0;
        
        const opponentId = Object.keys(gameState.players).find(id => id !== this.id);
        return gameState.players[opponentId]?.shield || 0;
    }

    /**
     * Get AI personality traits based on difficulty and character
     */
    getAggressiveness() {
        let base = 0.5;
        
        // Character influence
        if (this.character === "Witch") base += 0.2;
        if (this.character === "Sakuya") base -= 0.2;
        
        // Difficulty influence
        switch (this.difficulty) {
            case "easy": base += Math.random() * 0.4 - 0.2; break;
            case "medium": base += Math.random() * 0.2 - 0.1; break;
            case "hard": base += 0.1; break;
            case "expert": base += 0.15; break;
        }
        
        return Math.max(0, Math.min(1, base));
    }

    getDefensiveness() {
        let base = 0.4;
        
        if (this.character === "Sakuya") base += 0.3;
        if (this.character === "Witch") base -= 0.1;
        
        switch (this.difficulty) {
            case "easy": base += Math.random() * 0.4 - 0.2; break;
            case "medium": base += Math.random() * 0.2 - 0.1; break;
            case "hard": base += 0.15; break;
            case "expert": base += 0.2; break;
        }
        
        return Math.max(0, Math.min(1, base));
    }

    getHealingTendency() {
        let base = 0.6;
        
        if (this.character === "Miko") base += 0.2;
        if (this.character === "Witch") base -= 0.1;
        
        switch (this.difficulty) {
            case "easy": base += Math.random() * 0.4 - 0.2; break;
            case "medium": base += Math.random() * 0.1 - 0.05; break;
            case "hard": base += 0.1; break;
            case "expert": base += 0.15; break;
        }
        
        return Math.max(0, Math.min(1, base));
    }

    /**
     * Update AI state after playing a card
     */
    playCard(cardIndex, useSpecial) {
        if (cardIndex < 0 || cardIndex >= this.hand.length) return null;
        
        const card = this.hand[cardIndex];
        this.hand.splice(cardIndex, 1);
        this.discard.push(card);
        
        if (useSpecial && this.canUseSpecial(card)) {
            this.specialUsed = true;
        }
        
        return { card, useSpecial: useSpecial && this.canUseSpecial(card) };
    }

    /**
     * Reset AI state for new game
     */
    reset() {
        this.hp = rules.HP_START;
        this.shield = 0;
        this.deck = [];
        this.hand = [];
        this.discard = [];
        this.specialUsed = false;
        this.opponentHistory = [];
        this.turnHistory = [];
        
        console.log(`AI ${this.name} reset for new game`);
    }

    /**
     * Get AI stats and info
     */
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            character: this.character,
            difficulty: this.difficulty,
            hp: this.hp,
            shield: this.shield,
            handSize: this.hand.length,
            deckSize: this.deck.length,
            discardSize: this.discard.length,
            specialUsed: this.specialUsed,
            aggressiveness: this.aggressiveness,
            defensiveness: this.defensiveness,
            healingTendency: this.healingTendency
        };
    }
}

/**
 * AI Bot Manager - Quản lý nhiều AI bots
 */
class AIBotManager {
    constructor() {
        this.bots = new Map();
        this.difficulties = ["easy", "medium", "hard", "expert"];
        this.characters = ["Miko", "Witch", "Sakuya"];
    }

    /**
     * Tạo AI bot mới
     */
    createBot(name = null, character = null, difficulty = "medium") {
        if (!name) {
            name = this.generateBotName();
        }
        
        if (!character) {
            character = this.characters[Math.floor(Math.random() * this.characters.length)];
        }
        
        if (!this.difficulties.includes(difficulty)) {
            difficulty = "medium";
        }
        
        const bot = new AIBot(name, character, difficulty);
        this.bots.set(bot.id, bot);
        
        console.log(`AI Bot Manager: Created bot ${bot.name} (${bot.id})`);
        return bot;
    }

    /**
     * Lấy bot theo ID
     */
    getBot(botId) {
        return this.bots.get(botId);
    }

    /**
     * Xóa bot
     */
    removeBot(botId) {
        const bot = this.bots.get(botId);
        if (bot) {
            this.bots.delete(botId);
            console.log(`AI Bot Manager: Removed bot ${bot.name} (${botId})`);
            return true;
        }
        return false;
    }

    /**
     * Lấy danh sách tất cả bots
     */
    getAllBots() {
        return Array.from(this.bots.values()).map(bot => bot.getInfo());
    }

    /**
     * Generate random bot name
     */
    generateBotName() {
        const prefixes = ["AI", "Bot", "CPU", "Auto"];
        const suffixes = ["Player", "Challenger", "Opponent", "Fighter"];
        const numbers = Math.floor(Math.random() * 999) + 1;
        
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        
        return `${prefix} ${suffix} ${numbers}`;
    }

    /**
     * Tạo bot với difficulty phù hợp với player level
     */
    createAdaptiveBot(playerStats = null, character = null) {
        let difficulty = "medium";
        
        if (playerStats) {
            const totalGames = (playerStats.aiWins || 0) + (playerStats.aiLosses || 0) + (playerStats.aiDraws || 0);
            const winRate = totalGames > 0 ? (playerStats.aiWins || 0) / totalGames : 0.5;
            
            // Adjust difficulty based on player performance
            if (winRate < 0.3) {
                difficulty = "easy";
            } else if (winRate < 0.5) {
                difficulty = "medium";
            } else if (winRate < 0.7) {
                difficulty = "hard";
            } else {
                difficulty = "expert";
            }
            
            console.log(`AI Bot Manager: Created adaptive bot with difficulty ${difficulty} (player winrate: ${(winRate * 100).toFixed(1)}%)`);
        }
        
        return this.createBot(null, character, difficulty);
    }

    /**
     * Cleanup inactive bots
     */
    cleanup() {
        const now = Date.now();
        const botsToRemove = [];
        
        for (const [botId, bot] of this.bots) {
            // Remove bots older than 1 hour
            if (now - parseInt(botId.split('-')[2]) > 3600000) {
                botsToRemove.push(botId);
            }
        }
        
        botsToRemove.forEach(botId => this.removeBot(botId));
        
        if (botsToRemove.length > 0) {
            console.log(`AI Bot Manager: Cleaned up ${botsToRemove.length} inactive bots`);
        }
    }
}

// Export classes for use in other files
module.exports = {
    AIBot,
    AIBotManager
};
