const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { AIBot, AIBotManager } = require('./bot.js');

// Game rules for card game
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json')));

// Development vs Production logging
const isDevelopment = process.env.NODE_ENV !== 'production';

function debugLog(...args) {
    if (isDevelopment) {
        console.log('[DEBUG]', ...args);
    }
}

function infoLog(...args) {
    console.log('[INFO]', ...args);
}

function errorLog(...args) {
    console.error('[ERROR]', ...args);
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.boxicons.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
            fontSrc: ["'self'", "https://cdn.boxicons.com"],
        },
    },
}));

// Rate limiting (more lenient for development)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Increased limit for development
    message: 'Too many requests from this IP, please try again later.',
    skip: (req) => {
        // Skip rate limiting for static files during development
        return req.url.includes('.css') || req.url.includes('.js') || req.url.includes('.html') || req.url.includes('.png') || req.url.includes('.jpg');
    }
});
app.use(limiter);

// API rate limiting (more lenient for development)
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 2000, // Increased limit for development
    message: {
        error: 'Too many API requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// SSL Configuration
const sslOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(sslOptions, app);
const io = new Server(server, {
    cors: {
        origin: ["https://localhost:4000"],
        methods: ["GET", "POST"]
    }
});


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'client'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.txt')) {
            res.setHeader('Content-Type', 'text/plain');
        }
    }
}));
app.use('/DesignHud', express.static(path.join(__dirname, 'DesignHud')));
app.use('/skill', express.static(path.join(__dirname, 'client/skill')));

// Email configuration
const emailConfig = {
    service: 'gmail',
    auth: {
        user: 'nekohimeken@gmail.com',
        pass: 'rrme sewt tucm cfcu'
    },
    from: 'nekohimeken@gmail.com'
};

const transporter = nodemailer.createTransport(emailConfig);
const verificationCodes = new Map();
const registeredUsers = new Map();

app.get('/healthcheck', (req, res) => {
  res.send('CBG App running...');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});

// Socket.IO connection handling
const gameRooms = new Map();
const playerRooms = new Map(); // Track which room each player is in
const playerSockets = new Map(); // Track socket IDs for each player
const combatSessions = new Map(); // Track combat sessions
const cardGameSessions = new Map(); // Track card game sessions
const cardGameRooms = new Map(); // Track card game rooms for new AI system
const pvpWaitingQueue = new Map(); // Track players waiting for PvP matches

// Card game room ID counter
let nextCardGameRoomId = 1;
let cardGameWaiting = null; // Track waiting player for PvP matchmaking

// Initialize AI Bot Manager
const aiManager = new AIBotManager();

// Cleanup AI bots every hour
setInterval(() => {
    aiManager.cleanup();
}, 3600000);

// Card game helper functions
function createCardGameRoom(a, b) {
    const id = "cardgame-" + (nextCardGameRoomId++);
    const room = {
        id,
        players: {},
        phase: "deckbuild",
        turn: 0,
        turnEndsAt: 0,
        timer: null,
        submissions: {},
        lastPlayed: {},
        isAIGame: false
    };
    cardGameRooms.set(id, room);

    for (const s of [a,b]) {
        s.join(id);
        room.players[s.id] = {
            id: s.id,
            name: s.data?.name || "Player",
            character: s.data?.character || "Miko",
            hp: rules.HP_START,
            shield: 0,
            deck: [],
            hand: [],
            discard: [],
            specialUsed: false
        };
    }

    io.to(id).emit("cardgame/matched", { roomId: id, phase: room.phase });
    for (const sid of [a.id, b.id]) {
        io.to(sid).emit("cardgame/state", privateCardGameState(room, sid));
    }
    return room;
}

function publicCardGameState(room) {
    const now = Date.now();
    return {
        roomId: room.id,
        phase: room.phase,
        turn: room.turn,
        turnEndsAt: room.turnEndsAt,
        timerRemaining: Math.max(0, Math.floor((room.turnEndsAt - now) / 1000)),
        players: Object.fromEntries(Object.entries(room.players).map(([sid, p]) => [sid, ({
            name: p.name,
            character: p.character,
            hp: p.hp,
            shield: p.shield,
            specialUsed: p.specialUsed,
            submitted: !!room.submissions[sid],
            lastPlayed: room.lastPlayed[sid] || null
        })])),
    };
}

function privateCardGameState(room, sid) {
    const pub = publicCardGameState(room);
    const me = room.players[sid];
    return {
        ...pub,
        you: sid,
        hand: me.hand
    };
}

function startCardGameTurn(room) {
    room.phase = "play";
    room.turn += 1;
    console.log(`Starting turn ${room.turn} for room ${room.id}`);
    room.submissions = {};
    room.lastPlayed = {};
    room.turnEndsAt = Date.now() + rules.TURN_SECONDS * 1000;

    // send fresh state to both players (with private hands)
    for (const sid of Object.keys(room.players)) {
        if (sid.startsWith("ai-bot")) continue; // Don't send to AI
        const playerSocket = io.sockets.sockets.get(sid);
        if (playerSocket) {
            playerSocket.emit("cardgame/state", privateCardGameState(room, sid));
        }
    }

    // Handle AI turn if this is an AI game
    if (room.isAIGame) {
        handleAITurn(room);
    }

    // schedule timeout check
    clearTimeout(room.timer);
    room.timer = setTimeout(() => {
        resolveCardGameTurn(room);
    }, rules.TURN_SECONDS * 1000 + 50);
}

// ===== AI BOT LOGIC =====
function createAIRoom(humanSocket, roomType = "single", aiDifficulty = "medium") {
    const id = "airoom-" + (nextCardGameRoomId++);
    
    // Clear any existing timers for this socket
    const existingRooms = [...cardGameRooms.values()];
    existingRooms.forEach(room => {
        if (room.timer) {
            clearTimeout(room.timer);
        }
    });
    
    // Get human player data
    const user = JSON.parse(humanSocket.data?.user || '{}');
    const humanPlayer = humanSocket.data?.name || user.username || "Player";
    const humanCharacter = humanSocket.data?.character || "Miko";
    
    // Get player stats for adaptive difficulty (only if not specified)
    let finalDifficulty = aiDifficulty;
    if (aiDifficulty === "adaptive") {
        const registeredUser = registeredUsers.get(humanPlayer);
        const playerStats = registeredUser?.stats || null;
        finalDifficulty = getAdaptiveDifficulty(playerStats);
    }
    
    // Create AI bot with specified difficulty
    const aiBot = aiManager.createBot(null, "Witch", finalDifficulty);
    aiBot.generateDeck();
    
    console.log(`Created AI room: ${id} with bot ${aiBot.name} (${aiBot.difficulty})`);
    
    const room = {
        id,
        players: {},
        phase: "deckbuild",
        turn: 0, // Always start from 0
        turnEndsAt: 0,
        timer: null,
        submissions: {},
        lastPlayed: {},
        isAIGame: true,
        aiBot: aiBot
    };
    cardGameRooms.set(id, room);
    
    console.log(`AI Room ${id} created with turn: ${room.turn}`); // Debug log

    // Add human player
    humanSocket.join(id);
    room.players[humanSocket.id] = {
        id: humanSocket.id,
        name: humanPlayer,
        character: humanCharacter,
        hp: rules.HP_START,
        shield: 0,
        deck: [],
        hand: [],
        discard: [],
        specialUsed: false
    };

    // Add AI bot player
    room.players[aiBot.id] = {
        id: aiBot.id,
        name: aiBot.name,
        character: aiBot.character,
        hp: aiBot.hp,
        shield: aiBot.shield,
        deck: aiBot.deck,
        hand: aiBot.hand,
        discard: aiBot.discard,
        specialUsed: aiBot.specialUsed
    };

    io.to(id).emit("cardgame/matched", { 
        roomId: id, 
        phase: room.phase, 
        isAIGame: true,
        aiOpponent: {
            name: aiBot.name,
            character: aiBot.character,
            difficulty: aiBot.difficulty
        }
    });
    io.to(humanSocket.id).emit("cardgame/state", privateCardGameState(room, humanSocket.id));
    
    return room;
}

// Helper function to get adaptive difficulty based on player stats
function getAdaptiveDifficulty(playerStats) {
    if (!playerStats) return "medium";
    
    const totalGames = (playerStats.aiWins || 0) + (playerStats.aiLosses || 0) + (playerStats.aiDraws || 0);
    if (totalGames === 0) return "medium";
    
    const winRate = (playerStats.aiWins || 0) / totalGames;
    
    if (winRate < 0.3) return "easy";
    if (winRate < 0.5) return "medium";
    if (winRate < 0.7) return "hard";
    return "expert";
}

// Helper function to get AI difficulty display name
function getAIDifficultyDisplayName(difficulty) {
    const names = {
        'easy': 'Dễ',
        'medium': 'Trung bình',
        'hard': 'Khó', 
        'expert': 'Chuyên gia'
    };
    return names[difficulty] || 'Trung bình';
}

function handleAITurn(room) {
    const aiBot = room.aiBot;
    if (!aiBot) return;
    
    const humanId = Object.keys(room.players).find(id => id !== aiBot.id);
    const humanPlayer = room.players[humanId];
    
    // Create game state for AI decision making
    const gameState = {
        turn: room.turn,
        players: room.players,
        phase: room.phase
    };
    
    // AI makes decision using the bot logic
    const decision = aiBot.makeDecision(gameState);
    
    // Submit AI decision after a delay to simulate thinking
    const thinkingTime = aiBot.difficulty === "easy" ? 500 + Math.random() * 1000 : 
                        aiBot.difficulty === "medium" ? 1000 + Math.random() * 1500 :
                        aiBot.difficulty === "hard" ? 1500 + Math.random() * 2000 :
                        2000 + Math.random() * 2500; // expert
    
    setTimeout(() => {
        if (room.phase === "play" && !room.submissions[aiBot.id]) {
            // Validate AI decision
            let finalDecision = decision;
            if (decision.cardIndex >= aiBot.hand.length || decision.cardIndex < 0) {
                finalDecision = { cardIndex: 0, useSpecial: false };
            }
            
            room.submissions[aiBot.id] = {
                card: finalDecision.cardIndex,
                useSpecial: finalDecision.useSpecial
            };
            
            io.to(room.id).emit("cardgame/submitted", { 
                player: aiBot.id,
                isAI: true 
            });
            
            console.log(`AI ${aiBot.name} submitted: card ${finalDecision.cardIndex}, special: ${finalDecision.useSpecial}`);
            
            // If both players have submitted, resolve turn
            if (Object.keys(room.submissions).length === Object.keys(room.players).length) {
                resolveCardGameTurn(room);
            }
        }
    }, thinkingTime);
}

function resolveCardGameTurn(room) {
    if (room.phase !== "play") return;

    room.phase = "resolve";

    // apply penalties for non-submission
    for (const [sid, p] of Object.entries(room.players)) {
        if (!room.submissions[sid]) {
            p.hp -= 20;
            room.lastPlayed[sid] = { card: null, note: "No play (-20 HP)" };
        }
    }

    // calculate effects
    const ids = Object.keys(room.players);
    if (ids.length !== 2) return; // sanity

    const [aId, bId] = ids;
    const A = room.players[aId];
    const B = room.players[bId];

    function applySubmission(source, target, sub, sid) {
        if (!sub) return;
        const { card, useSpecial } = sub;
        // Remove card from hand -> discard
        if (card != null && card >= 0 && card < source.hand.length) {
            const type = source.hand[card];
            source.discard = source.discard || [];
            source.discard.push(type);
            source.hand.splice(card, 1);

            let note = type;
            // Special handling
            if (useSpecial && !source.specialUsed) {
                if (source.character === "Miko" && type === "heal") {
                    // heal bonus from rules.json
                    source._bonus = { heal: rules.SPECIALS.Miko.bonus };
                    source.specialUsed = true;
                    note += " + Special";
                } else if (source.character === "Witch" && type === "attack") {
                    source._bonus = { attack: rules.SPECIALS.Witch.bonus };
                    source.specialUsed = true;
                    note += " + Special";
                } else {
                    note += " (special had no effect)";
                }
            }

            // queue effect
            if (type === "defend") {
                source._queued = source._queued || [];
                source._queued.push({ kind: "shield", amount: rules.CARD_VALUES.defend });
            } else if (type === "heal") {
                let healAmount = rules.CARD_VALUES.heal;
                if (source.curse && source.curse.turns > 0) {
                    healAmount = Math.floor(healAmount * 0.75); // Reduced heal when cursed
                    source.curse = null; // giải curse
                    source._curedCurse = true;
                }
                const bonus = (source._bonus && source._bonus.heal) || 0;
                source._queued = source._queued || [];
                source._queued.push({ kind: "heal", amount: healAmount + bonus });
            } else if (type === "attack") {
                const bonus = (source._bonus && source._bonus.attack) || 0;
                source._queued = source._queued || [];
                source._queued.push({ kind: "attack", amount: rules.CARD_VALUES.attack + bonus });
            } else if (type === "curse") {
                // Áp dụng curse lên đối phương nếu chưa bị hoặc đã hết
                if (!target.curse || !target.curse.turns || target.curse.turns <= 0) {
                    target.curse = { turns: 3 };
                }
                // Ghi chú
                note += " (Curse)";
            }

            room.lastPlayed[sid] = { card: type, note };
        }
    }

    applySubmission(A, B, room.submissions[aId], aId);
    applySubmission(B, A, room.submissions[bId], bId);

    // Resolve order: shield/heal apply to self immediately, attacks then applied taking shield into account
    function applySelfEffects(p) {
        if (!p._queued) return;
        for (const eff of p._queued) {
            if (eff.kind === "shield") p.shield = (p.shield || 0) + eff.amount;
            if (eff.kind === "heal") p.hp = Math.min(rules.HP_START, p.hp + eff.amount);
        }
    }
    applySelfEffects(A);
    applySelfEffects(B);

    // Áp dụng hiệu ứng curse mỗi lượt (sau khi heal, trước attack)
    for (const p of [A, B]) {
        if (p.curse && p.curse.turns > 0) {
            p.hp -= 10;
            p.curse.turns--;
            if (p.curse.turns <= 0) p.curse = null;
        }
    }

    function dealDamage(target, amount) {
        let remaining = amount;
        const absorbed = Math.min(target.shield || 0, remaining);
        target.shield = (target.shield || 0) - absorbed;
        remaining -= absorbed;
        target.hp -= remaining;
    }

    function applyAttacks(source, target) {
        if (!source._queued) return;
        let atkDebuff = 0;
        if (source.curse && source.curse.turns > 0) {
            atkDebuff = 5;
        }
        for (const eff of source._queued) {
            if (eff.kind === "attack") dealDamage(target, Math.max(0, eff.amount - atkDebuff));
        }
    }
    applyAttacks(A, B);
    applyAttacks(B, A);

    // cleanup temp
    for (const p of [A,B]) {
        delete p._queued;
        delete p._bonus;
    }

    // draw up to hand size
    for (const p of [A,B]) {
        const need = Math.max(0, 5 - p.hand.length);
        for (let i = 0; i < need; i++) {
            if (p.deck && p.deck.length > 0) {
                const randomIndex = Math.floor(Math.random() * p.deck.length);
                p.hand.push(p.deck.splice(randomIndex, 1)[0]);
            }
        }
    }

    // Send resolve state
    for (const sid of Object.keys(room.players)) {
        if (sid.startsWith("ai-bot")) continue;
        const playerSocket = io.sockets.sockets.get(sid);
        if (playerSocket) {
            playerSocket.emit("cardgame/state", privateCardGameState(room, sid));
        }
    }

    // check end conditions
    const someoneDead = A.hp <= 0 || B.hp <= 0;
    const turnLimit = room.turn >= 10;
    if (someoneDead || turnLimit) {
        endCardGame(room);
        return;
    }

    // start next turn shortly
    setTimeout(() => startCardGameTurn(room), 2000);
}

function endCardGame(room) {
    const players = Object.values(room.players);
    const result = {
        a: players[0],
        b: players[1] || { hp: 0 },
        turn: room.turn
    };
    
    for (const sid of Object.keys(room.players)) {
        if (sid.startsWith("ai-bot")) continue;
        const playerSocket = io.sockets.sockets.get(sid);
        if (playerSocket) {
            playerSocket.emit("cardgame/end", result);
        }
    }
    
    cardGameSessions.delete(room.id);
}

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password || !email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin' 
            });
        }

        // Password strength validation
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mật khẩu phải có ít nhất 6 ký tự' 
            });
        }

        // Check if username already exists
        if (registeredUsers.has(username)) {
            return res.status(409).json({ 
                success: false, 
                message: 'Tên đăng nhập đã tồn tại' 
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email không hợp lệ' 
            });
        }

        // Hash password before storing
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        verificationCodes.set(email, {
            code: verificationCode,
            username,
            password: hashedPassword, // Store hashed password
            expires: Date.now() + 10 * 60 * 1000
        });

        const mailOptions = {
            from: emailConfig.from,
            to: email,
            subject: 'Xác thực tài khoản - Touhou FM: Battle Card',
            html: `
                <h2>Xác thực tài khoản</h2>
                <p>Chào ${username},</p>
                <p>Mã xác thực của bạn là: <strong style="font-size: 24px; color: #007bff;">${verificationCode}</strong></p>
                <p>Mã này sẽ hết hạn sau 10 phút.</p>
                <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
                <br>
                <p>Trân trọng,<br>Touhou FM: Battle Card Team</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ 
            success: true, 
            message: 'Mã xác thực đã được gửi đến email của bạn' 
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.post('/api/verify', (req, res) => {
    try {
        const { email, code } = req.body;
        
        const verification = verificationCodes.get(email);
        
        if (!verification) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực không tồn tại hoặc đã hết hạn' 
            });
        }

        if (Date.now() > verification.expires) {
            verificationCodes.delete(email);
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực đã hết hạn' 
            });
        }

        if (verification.code !== code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực không đúng' 
            });
        }

        verificationCodes.delete(email);
        
        registeredUsers.set(verification.username, {
            username: verification.username,
            password: verification.password,
            email: email,
            registeredAt: new Date()
        });
        
        console.log('User saved to database:', verification.username);
        console.log('Current registered users:', Array.from(registeredUsers.keys()));
        
        res.json({ 
            success: true, 
            message: 'Đăng ký thành công!'
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin' 
            });
        }

        const user = registeredUsers.get(username);
        console.log('Login attempt for username:', username);
        console.log('Available users in database:', Array.from(registeredUsers.keys()));
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tên đăng nhập hoặc mật khẩu không đúng' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công',
            user: {
                username: user.username,
                email: user.email,
                registeredAt: user.registeredAt
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.get('/api/profile/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        // Handle AI user specially
        if (username === 'AI') {
            return res.json({ 
                success: true,
                profile: {
                    username: 'AI',
                    email: 'ai@gamecard.com',
                    registeredAt: new Date(),
                    avatar: '/DesignHud/marisa2.png'
                }
            });
        }
        
        const user = registeredUsers.get(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'Người dùng không tồn tại' 
            });
        }

        res.json({ 
            success: true,
            profile: {
                username: user.username,
                email: user.email,
                registeredAt: user.registeredAt,
                avatar: `/DesignHud/${username === 'marisa' ? 'marisa' : 'reimu'}2.png`
            }
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra khi lấy thông tin người dùng' 
        });
    }
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Send current room list to new connection
    socket.emit('roomList', Array.from(gameRooms.values()));
    
    // Handle room creation
    socket.on('createRoom', (roomData) => {
        try {
            console.log('SERVER: Creating room:', roomData);
            console.log('SERVER: Room gameMode:', roomData.gameMode, 'Room type:', roomData.type);
            console.log('SERVER: Full room data on creation:', JSON.stringify(roomData, null, 2));
            
            // For AI mode, add AI player immediately
            if (roomData.gameMode === 'single') {
                // Use selected AI character or default to marisa
                const selectedCharacter = roomData.aiCharacter || 'marisa';
                
                roomData.players.push({
                    id: 'AI_OPPONENT',
                    name: 'AI',
                    ready: true,
                    avatar: `/DesignHud/${selectedCharacter}2.png`,
                    isAI: true,
                    character: selectedCharacter
                });
                
                // Don't auto-ready the host in AI mode - let them choose character first
                roomData.players[0].ready = false;
            }
            
            gameRooms.set(roomData.id, roomData);
            playerRooms.set(socket.id, roomData.id);
            
            // Track creator's socket
            if (roomData.players && roomData.players.length > 0) {
                playerSockets.set(roomData.players[0].id, socket.id);
            }
            
            // Join socket room
            socket.join(roomData.id);
            
            if (roomData.gameMode === 'single') {
                // For AI mode, don't auto-start - wait for player to be ready
                // The game will start when both players are ready (including AI which is already ready)
            } else {
                // Only broadcast multiplayer rooms to public room list
                io.emit('roomList', Array.from(gameRooms.values()).filter(room => room.gameMode === 'match'));
            }
            
            // Send room joined confirmation to creator
            socket.emit('roomJoined', roomData);
            
            console.log(`Room ${roomData.id} created by ${roomData.host}`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Không thể tạo phòng' });
        }
    });
    
    // Handle joining room
    socket.on('joinRoom', (data) => {
        try {
            const { roomId, player, password } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) {
                socket.emit('error', { message: 'Phòng không tồn tại' });
                return;
            }
            
            // Check password if room is locked
            if (room.status === 'Khóa') {
                console.log('Room is locked, checking password...');
                
                if (!room.password || room.password.trim() === '') {
                    // Room is locked but has no password set - shouldn't happen but handle it
                    socket.emit('error', { message: 'Phòng này đã bị khóa' });
                    return;
                }
                
                if (!password || password !== room.password) {
                    console.log('Password verification failed for room', roomId);
                    socket.emit('error', { message: 'Mật khẩu không đúng' });
                    return;
                }
                
                console.log('Password verification successful for room', roomId);
            }
            
            // Check if room is full
            if (room.players.length >= room.maxPlayers) {
                socket.emit('error', { message: 'Phòng đã đầy' });
                return;
            }
            
            // Check if player already in room
            const existingPlayer = room.players.find(p => p.id === player.id);
            if (existingPlayer) {
                socket.emit('error', { message: 'Bạn đã ở trong phòng này' });
                return;
            }
            
            // Add player to room
            room.players.push(player);
            playerRooms.set(socket.id, roomId);
            playerSockets.set(player.id, socket.id);
            
            // Join socket room
            socket.join(roomId);
            
            // Update room data
            gameRooms.set(roomId, room);
            
            // Notify all players in room
            io.to(roomId).emit('playerJoined', {
                roomId: roomId,
                player: player,
                players: room.players
            });
            
            // Send room data to joining player
            socket.emit('roomJoined', room);
            
            // Update room list for all clients
            io.emit('roomList', Array.from(gameRooms.values()));
            
            console.log(`Player ${player.name} joined room ${roomId}`);
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Không thể vào phòng' });
        }
    });
    
    // Handle leaving room
    socket.on('leaveRoom', (data) => {
        try {
            const { roomId, playerId } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            // Remove player from room
            room.players = room.players.filter(p => p.id !== playerId);
            playerRooms.delete(socket.id);
            playerSockets.delete(playerId);
            
            // Leave socket room
            socket.leave(roomId);
            
            // If room is empty, delete it
            if (room.players.length === 0) {
                gameRooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            } else {
                // Update room data
                gameRooms.set(roomId, room);
                
                // Notify remaining players
                io.to(roomId).emit('playerLeft', {
                    roomId: roomId,
                    playerId: playerId,
                    players: room.players
                });
            }
            
            // Update room list for all clients
            io.emit('roomList', Array.from(gameRooms.values()));
            
            console.log(`Player ${playerId} left room ${roomId}`);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });
    
    // Handle player ready status
    socket.on('playerReady', (data) => {
        try {
            const { roomId, playerId, ready } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                player.ready = ready;
                gameRooms.set(roomId, room);
                
                // Notify all players in room
                io.to(roomId).emit('playerReady', {
                    roomId: roomId,
                    playerId: playerId,
                    ready: ready
                });
                
                console.log(`Player ${playerId} ready status: ${ready} in room ${roomId}`);
                
                // Check if all players are ready to start game
                if (room.players.every(p => p.ready)) {
                    console.log(`All players ready in room ${roomId}, starting game...`);
                    
                    // Check if this is PvP Card mode
                    if (room.gameMode === 'match' && room.mode?.toLowerCase() === 'card') {
                        console.log('PvP Card mode detected, starting card game...');
                        // Start PvP card game
                        io.to(roomId).emit('cardGameStarted', {
                            roomId: roomId,
                            gameMode: 'card',
                            isAI: false,
                            players: room.players
                        });
                    } else {
                        // Start battle mode
                        const maps = ['map1', 'map2', 'map3', 'map4', 'map5'];
                        const randomMap = maps[Math.floor(Math.random() * maps.length)];
                        
                        io.to(roomId).emit('gameStart', {
                            roomId: roomId,
                            map: randomMap,
                            selectedMap: `${randomMap}.html`,
                            isAIMode: room.gameMode === 'single'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error updating ready status:', error);
        }
    });
    
    // Handle character selection
    socket.on('characterSelected', (data) => {
        try {
            const { roomId, playerId, playerPosition, character } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            // Store character selection in room data
            if (!room.characterSelections) {
                room.characterSelections = {};
            }
            room.characterSelections[playerId] = character;
            gameRooms.set(roomId, room);
            
            // Notify all players in room about character selection
            io.to(roomId).emit('characterSelected', {
                roomId: roomId,
                playerId: playerId,
                playerPosition: playerPosition,
                character: character
            });
            
            console.log(`Player ${playerId} selected character ${character} in room ${roomId}`);
        } catch (error) {
            console.error('Error handling character selection:', error);
        }
    });
    
    // Handle game start
    socket.on('startGame', (data) => {
        try {
            const { roomId } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            // Check if all players are ready
            if (room.players.length === room.maxPlayers && room.players.every(p => p.ready)) {
                let selectedMap;
                let gameStartData = {
                    roomId: roomId,
                    players: room.players,
                    gameMode: room.gameMode
                };
                
                console.log('Game start - Room gameMode:', room.gameMode, 'Room type:', room.type);
                console.log('Full room data:', JSON.stringify(room, null, 2));
                
                console.log('Checking AI battle condition:', {
                    gameMode: room.gameMode,
                    type: room.type,
                    isAI: room.gameMode === 'single' || room.type === 'Đánh với máy'
                });
                
                if (room.gameMode === 'single') {
                    // Use regular maps for AI battles (map1-5.html)
                    const maps = ['map1.html', 'map2.html', 'map3.html', 'map4.html', 'map5.html'];
                    selectedMap = maps[Math.floor(Math.random() * maps.length)];
                    
                    console.log('Selected AI map:', selectedMap);
                    
                    // Find AI player and get character
                    const aiPlayer = room.players.find(p => p.isAI);
                    gameStartData.aiCharacter = aiPlayer ? aiPlayer.character : 'marisa';
                    gameStartData.playerCharacter = room.players.find(p => !p.isAI)?.selectedCharacter || 'reimu';
                } else {
                    // Use regular maps for multiplayer
                    const maps = ['map1.html', 'map2.html', 'map3.html', 'map4.html', 'map5.html'];
                    selectedMap = maps[Math.floor(Math.random() * maps.length)];
                    
                    console.log('Selected multiplayer map:', selectedMap);
                    
                    // Include character selections for multiplayer battles
                    gameStartData.characterSelections = room.characterSelections || {};
                    console.log('Including character selections for multiplayer:', gameStartData.characterSelections);
                }
                
                console.log('FINAL MAP SELECTION:', selectedMap);
                
                gameStartData.selectedMap = selectedMap;
                
                // Start game for all players in room
                io.to(roomId).emit('gameStart', gameStartData);
                
                console.log(`Game started in room ${roomId} with map: ${selectedMap}`, gameStartData);
                
                // Remove room after game starts
                gameRooms.delete(roomId);
                
                // Update room list
                io.emit('roomList', Array.from(gameRooms.values()));
            }
        } catch (error) {
            console.error('Error starting game:', error);
        }
    });
    
    // Handle getting room list
    socket.on('getRoomList', () => {
        // Clean up empty rooms and disconnected players before sending list
        cleanupRooms();
        // Only send multiplayer rooms to public room list
        socket.emit('roomList', Array.from(gameRooms.values()).filter(room => room.gameMode === 'match'));
    });
    
    // Handle combat actions
    socket.on('combatAction', (data) => {
        try {
            const { roomId, playerId, action, skill, turn } = data;
            
            // Get or create combat session
            let session = combatSessions.get(roomId);
            if (!session) {
                session = {
                    roomId: roomId,
                    players: {},
                    currentTurn: 1,
                    gameActive: true
                };
                combatSessions.set(roomId, session);
            }
            
            // Initialize player if not exists
            if (!session.players[playerId]) {
                session.players[playerId] = {
                    socketId: socket.id,
                    hp: 150,
                    mp: 150,
                    defenseCount: 3,
                    currentAction: null,
                    currentSkill: null,
                    actionTurn: null,
                    attackBonus: 0,
                    attackBonusTurns: 0
                };
            }
            
            // Set player action
            session.players[playerId].currentAction = action;
            session.players[playerId].currentSkill = skill;
            session.players[playerId].actionTurn = turn;
            
            console.log(`Combat action received: ${playerId} chose ${action}${skill ? ` with skill ${skill.name}` : ''} for turn ${turn}`);
            
            // Broadcast action to other players in room
            socket.to(roomId).emit('combatAction', {
                playerId: playerId,
                action: action,
                skill: skill,
                turn: turn
            });
            
            // Check if both players have acted
            const playerIds = Object.keys(session.players);
            if (playerIds.length === 2) {
                const allActed = playerIds.every(id => 
                    session.players[id].currentAction && 
                    session.players[id].actionTurn === turn
                );
                
                if (allActed) {
                    // Resolve turn automatically
                    resolveCombatTurn(roomId, session, turn);
                }
            }
            
        } catch (error) {
            console.error('Error handling combat action:', error);
            socket.emit('error', { message: 'Lỗi xử lý hành động chiến đấu' });
        }
    });
    
    // Handle turn resolution request
    socket.on('resolveTurn', (data) => {
        try {
            const { roomId, turn } = data;
            const session = combatSessions.get(roomId);
            
            if (session) {
                resolveCombatTurn(roomId, session, turn);
            }
        } catch (error) {
            console.error('Error resolving turn:', error);
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find player by socket ID and remove from room
        let disconnectedPlayerId = null;
        for (const [playerId, socketId] of playerSockets.entries()) {
            if (socketId === socket.id) {
                disconnectedPlayerId = playerId;
                break;
            }
        }
        
        if (disconnectedPlayerId) {
            const roomId = playerRooms.get(socket.id);
            if (roomId) {
                const room = gameRooms.get(roomId);
                if (room) {
                    // Remove disconnected player from room
                    room.players = room.players.filter(p => p.id !== disconnectedPlayerId);
                    
                    console.log(`Player ${disconnectedPlayerId} disconnected from room ${roomId}`);
                    
                    // If room is empty, delete it
                    if (room.players.length === 0) {
                        gameRooms.delete(roomId);
                        console.log(`Room ${roomId} deleted (empty after disconnect)`);
                    } else {
                        // Update room data
                        gameRooms.set(roomId, room);
                        
                        // Notify remaining players
                        io.to(roomId).emit('playerLeft', {
                            roomId: roomId,
                            playerId: disconnectedPlayerId,
                            players: room.players
                        });
                    }
                    
                    // Update room list for all clients
                    io.emit('roomList', Array.from(gameRooms.values()));
                }
            }
            
            // Clean up tracking maps
            playerSockets.delete(disconnectedPlayerId);
        }
        
        playerRooms.delete(socket.id);
        
        // Clean up combat sessions
        for (const [roomId, session] of combatSessions.entries()) {
            for (const [playerId, playerData] of Object.entries(session.players)) {
                if (playerData.socketId === socket.id) {
                    delete session.players[playerId];
                    console.log(`Player ${playerId} removed from combat session ${roomId}`);
                }
            }
            
            // Remove empty combat sessions
            if (Object.keys(session.players).length === 0) {
                combatSessions.delete(roomId);
                console.log(`Combat session ${roomId} deleted (empty)`);
            }
        }
    });
    
    
    socket.on("cardgame/join", ({ name, character, isBot }) => {
        socket.data.name = name || "Player";
        socket.data.character = character || "Miko";

        if (isBot) {
            // Leave any existing rooms first
            const currentRooms = [...socket.rooms];
            currentRooms.forEach(roomId => {
                if (roomId.startsWith("cardgame-") || roomId.startsWith("airoom-")) {
                    socket.leave(roomId);
                    // Clean up the room if it exists
                    const existingRoom = cardGameRooms.get(roomId);
                    if (existingRoom) {
                        delete existingRoom.players[socket.id];
                        if (Object.keys(existingRoom.players).length === 0) {
                            cardGameRooms.delete(roomId);
                        }
                    }
                }
            });
            
            // Create AI room for single player
            const aiDifficulty = "medium"; // Default difficulty, could be passed from client
            const room = createAIRoom(socket, "single", aiDifficulty);
            socket.emit("cardgame/matched");
            socket.emit("cardgame/state", privateCardGameState(room, socket.id));
        } else {
            // Normal multiplayer matchmaking
            if (!cardGameWaiting) {
                cardGameWaiting = socket.id;
                socket.emit("cardgame/waiting");
            } else if (cardGameWaiting !== socket.id) {
                const other = io.sockets.sockets.get(cardGameWaiting);
                cardGameWaiting = null;
                const room = createCardGameRoom(other, socket);
                io.to(room.id).emit("cardgame/deckphase", { message: "Submit your deck (max 12, max 5 per type)." });
            }
        }
    });

    socket.on('leaveCardGameRoom', (data) => {
        try {
            const { roomId } = data;
            const room = cardGameRooms.get(roomId);
            
            if (room && room.players[socket.id]) {
                const playerName = room.players[socket.id].name;
                delete room.players[socket.id];
                socket.leave(roomId);
                
                // Notify other players
                socket.to(roomId).emit('playerLeftCardGame', {
                    playerName: playerName,
                    players: room.players
                });

                // Clean up empty rooms
                if (Object.keys(room.players).length === 0) {
                    cardGameRooms.delete(roomId);
                    console.log(`Deleted empty card game room: ${roomId}`);
                }
            }
        } catch (error) {
            console.error('Error leaving card game room:', error);
        }
    });

    function getUsernameFromSocket(socket) {
        // Try to get username from socket handshake or session
        return socket.handshake?.auth?.username || socket.username || 'Player';
    }
    
    socket.on('cardgame/submitDeck', (deckArray) => {
        try {
            console.log('Deck submitted:', deckArray);
            
            // Find the room this player is in
            let room = null;
            for (const [roomId, r] of cardGameRooms.entries()) {
                if (r.players[socket.id]) {
                    room = r;
                    break;
                }
            }
            
            if (!room) {
                socket.emit('cardgame/deckError', 'Room not found');
                return;
            }
            
            // Validate deck
            if (!Array.isArray(deckArray) || deckArray.length !== 15) {
                socket.emit('cardgame/deckError', 'Deck must have exactly 15 cards');
                return;
            }
            
            // Count card types
            const typeCounts = {};
            deckArray.forEach(card => {
                typeCounts[card] = (typeCounts[card] || 0) + 1;
            });
            
            // Check max 5 per type
            for (const [type, count] of Object.entries(typeCounts)) {
                if (count > 5) {
                    socket.emit('cardgame/deckError', `Too many ${type} cards (max 5)`);
                    return;
                }
            }
            
            // Set player deck and generate hand
            const player = room.players[socket.id];
            player.deck = [...deckArray];
            player.hand = shuffleAndDeal(deckArray, 5);
            player.submitted = true;
            
            socket.emit('cardgame/deckOk');
            
            if (room.isAIGame) {
                // AI game - generate AI deck and start immediately
                const aiBot = room.aiBot;
                if (aiBot) {
                    aiBot.generateDeck();
                    const aiPlayer = room.players[aiBot.id];
                    aiPlayer.deck = aiBot.deck;
                    aiPlayer.hand = shuffleAndDeal(aiBot.deck, 5);
                    aiPlayer.submitted = true;
                }
                
                // Start AI game
                room.phase = 'play';
                room.turn = 1;
                room.turnEndsAt = Date.now() + 20000;
                
                // Send initial game state
                setTimeout(() => {
                    socket.emit('cardgame/state', privateCardGameState(room, socket.id));
                    console.log(`AI game started for room ${room.id}`);
                }, 1000);
            } else {
                // PvP game - check if both players submitted
                const allPlayersSubmitted = Object.values(room.players).every(p => p.submitted);
                
                if (allPlayersSubmitted) {
                    // Start PvP game
                    console.log(`Both players submitted deck, starting PvP game: ${room.id}`);
                    setTimeout(() => {
                        startCardGameTurn(room);
                    }, 1000);
                } else {
                    // Wait for other player
                    socket.emit('cardgame/state', privateCardGameState(room, socket.id));
                    console.log('Waiting for other player to submit deck');
                }
            }
            
        } catch (error) {
            console.error('Error in cardgame/submitDeck:', error);
            socket.emit('cardgame/deckError', 'Error processing deck');
        }
    });
    
    socket.on('cardgame/play', (data) => {
        try {
            const { cardIndex, useSpecial } = data;
            console.log('Player played card:', data);
            
            // Find room this player is in
            let room = null;
            for (const [roomId, r] of cardGameRooms.entries()) {
                if (r.players[socket.id]) {
                    room = r;
                    break;
                }
            }
            
            if (!room || room.phase !== 'play') return;
            if (room.submissions[socket.id]) return; // Already submitted
            
            const player = room.players[socket.id];
            
            if (cardIndex >= 0 && cardIndex < player.hand.length) {
                // Record submission
                room.submissions[socket.id] = { 
                    card: cardIndex, 
                    useSpecial: !!useSpecial 
                };
                
                console.log(`Player ${socket.id} submitted card ${cardIndex} in room ${room.id}`);
                
                // Check if all players submitted
                const allSubmitted = Object.keys(room.submissions).length === Object.keys(room.players).length;
                
                if (allSubmitted) {
                    console.log(`All players submitted in room ${room.id}, resolving turn`);
                    // All players submitted, resolve turn
                    resolveCardGameTurn(room);
                } else if (room.isAIGame) {
                    // Trigger AI turn if this is an AI game and human just played
                    console.log(`Triggering AI turn in room ${room.id}`);
                    handleAITurn(room);
                }
            }
        } catch (error) {
            console.error('Error in cardgame/play:', error);
        }
    });
});

// Helper functions for card game
function shuffleAndDeal(deck, count) {
    const shuffled = [...deck];
    // Fisher-Yates shuffle algorithm for proper randomization
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}

function generateAIDeck() {
    const deck = [];
    // Balanced AI deck
    for (let i = 0; i < 4; i++) deck.push('attack');
    for (let i = 0; i < 4; i++) deck.push('defend');
    for (let i = 0; i < 4; i++) deck.push('heal');
    for (let i = 0; i < 3; i++) deck.push('curse');
    
    // Fisher-Yates shuffle for AI deck too
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function resolveTurn(session, playerId) {
    const player = session.players[playerId];
    const aiPlayer = session.players['ai-bot'];
    
    const playerCard = player.lastPlayed?.card;
    const aiCard = aiPlayer.lastPlayed?.card;
    
    console.log(`Resolving: Player ${playerCard} vs AI ${aiCard}`);
    
    // Simple combat resolution
    let playerDamage = 0;
    let aiDamage = 0;
    
    if (playerCard === 'attack') playerDamage = 10;
    if (aiCard === 'attack') aiDamage = 10;
    
    // Apply special effects
    if (player.lastPlayed?.useSpecial && player.character === 'Marisa') {
        playerDamage += 25; // Marisa attack bonus
    } else if (player.lastPlayed?.useSpecial && player.character === 'Reimu' && playerCard === 'heal') {
        player.hp = Math.min(100, player.hp + 20); // Reimu heal bonus
    }
    
    // Defense blocks damage
    if (playerCard === 'defend' && player.shield < 3) {
        aiDamage = 0;
        player.shield++;
    }
    if (aiCard === 'defend' && aiPlayer.shield < 3) {
        playerDamage = 0;
        aiPlayer.shield++;
    }
    
    // Healing
    if (playerCard === 'heal') player.hp = Math.min(100, player.hp + 15);
    if (aiCard === 'heal') aiPlayer.hp = Math.min(100, aiPlayer.hp + 15);
    
    // Apply damage
    player.hp = Math.max(0, player.hp - aiDamage);
    aiPlayer.hp = Math.max(0, aiPlayer.hp - playerDamage);
    
    console.log(`After resolution: Player HP ${player.hp}, AI HP ${aiPlayer.hp}`);
}

function endGame(session, playerId) {
    const player = session.players[playerId];
    const aiPlayer = session.players['ai-bot'];
    
    const result = {
        turn: session.turn,
        a: { id: playerId, hp: player.hp },
        b: { id: 'ai-bot', hp: aiPlayer.hp }
    };
    
    // Find socket for this player
    const playerSocket = io.sockets.sockets.get(playerId);
    if (playerSocket) {
        playerSocket.emit('cardgame/end', result);
    }
    
    // Clean up session
    cardGameSessions.delete(session.id);
}

// Combat turn resolution function
function resolveCombatTurn(roomId, session, turn) {
    try {
        const playerIds = Object.keys(session.players);
        if (playerIds.length !== 2) {
            console.error('Invalid number of players for combat resolution');
            return;
        }
        
        const player1Id = playerIds[0];
        const player2Id = playerIds[1];
        const player1 = session.players[player1Id];
        const player2 = session.players[player2Id];
        
        const player1Action = player1.currentAction;
        const player2Action = player2.currentAction;
        const player1Skill = player1.currentSkill;
        const player2Skill = player2.currentSkill;
        
        console.log(`Resolving turn ${turn}: ${player1Id}(${player1Action}${player1Skill ? ` - ${player1Skill.name}` : ''}) vs ${player2Id}(${player2Action}${player2Skill ? ` - ${player2Skill.name}` : ''})`);
        
        // Calculate damage, healing, and MP usage
        let player1Damage = 0;
        let player2Damage = 0;
        let player1Heal = 0;
        let player2Heal = 0;
        let player1MPUsed = 0;
        let player2MPUsed = 0;
        let player1DefenseUsed = false;
        let player2DefenseUsed = false;
        
        // Calculate Player 1 effects
        if (player1Action === 'attack') {
            player1Damage = 10 + (player1.attackBonus || 0);
        } else if (player1Action === 'defense') {
            if (player1.defenseCount > 0) {
                player1DefenseUsed = true;
                player1.defenseCount--;
            }
        } else if (player1Action === 'skill' && player1Skill) {
            // Check MP availability
            if (player1.mp >= player1Skill.mpCost) {
                player1MPUsed = player1Skill.mpCost;
                player1.mp -= player1MPUsed;
                
                // Apply skill effects
                player1Damage = player1Skill.damage || 0;
                player1Heal = player1Skill.heal || 0;
                
                // Special effects
                if (player1Skill.special === 'execute_low_hp' && player2.hp < 50) {
                    player1Damage = player2.hp; // Instant kill
                } else if (player1Skill.special === 'enhance_attack_2_turns') {
                    player1.attackBonus = 5;
                    player1.attackBonusTurns = 2;
                }
            } else {
                // Not enough MP, treat as basic attack
                player1Damage = 10 + (player1.attackBonus || 0);
            }
        }
        
        // Calculate Player 2 effects (with AI skill selection if no skill chosen)
        if (player2Action === 'attack') {
            player2Damage = 10 + (player2.attackBonus || 0);
        } else if (player2Action === 'defense') {
            if (player2.defenseCount > 0) {
                player2DefenseUsed = true;
                player2.defenseCount--;
            }
        } else if (player2Action === 'skill') {
            // If no skill was provided, select random AI skill
            if (!player2Skill && player2.mp > 0) {
                player2Skill = selectRandomAISkill(player2.mp);
            }
            
            if (player2Skill) {
                // Check MP availability
                if (player2.mp >= player2Skill.mpCost) {
                    player2MPUsed = player2Skill.mpCost;
                    player2.mp -= player2MPUsed;
                    
                    // Apply skill effects
                    player2Damage = player2Skill.damage || 0;
                    player2Heal = player2Skill.heal || 0;
                    
                    // Special effects
                    if (player2Skill.special === 'execute_low_hp' && player1.hp < 50) {
                        player2Damage = player1.hp; // Instant kill
                    } else if (player2Skill.special === 'enhance_attack_2_turns') {
                        player2.attackBonus = 5;
                        player2.attackBonusTurns = 2;
                    }
                } else {
                    // Not enough MP, treat as basic attack
                    player2Damage = 10 + (player2.attackBonus || 0);
                }
            } else {
                // No skill available, treat as basic attack
                player2Damage = 10 + (player2.attackBonus || 0);
            }
        }
        
        // Apply defense blocking
        if (player1DefenseUsed && player2Damage > 0) {
            player2Damage = 0; // Block damage
        }
        if (player2DefenseUsed && player1Damage > 0) {
            player1Damage = 0; // Block damage
        }
        
        // Apply damage and healing
        // Player1 takes player2Damage, Player2 takes player1Damage
        player1.hp = Math.max(0, Math.min(150, player1.hp - player2Damage + player1Heal));
        player2.hp = Math.max(0, Math.min(150, player2.hp - player1Damage + player2Heal));
        
        // Prepare resolution data for each player
        const player1Resolution = {
            playerAction: player1Action,
            opponentAction: player2Action,
            playerDamage: player1Damage,
            opponentDamage: player2Damage,
            playerHeal: player1Heal,
            opponentHeal: player2Heal,
            playerMPUsed: player1MPUsed,
            opponentMPUsed: player2MPUsed,
            playerDefenseUsed: player1DefenseUsed,
            opponentDefenseUsed: player2DefenseUsed,
            playerSkill: player1Skill,
            opponentSkill: player2Skill,
            playerHP: player1.hp,
            opponentHP: player2.hp,
            playerMP: player1.mp,
            opponentMP: player2.mp,
            playerAttackBonus: player1.attackBonus,
            playerAttackBonusTurns: player1.attackBonusTurns,
            opponentAttackBonus: player2.attackBonus,
            opponentAttackBonusTurns: player2.attackBonusTurns,
            turn: turn
        };
        
        const player2Resolution = {
            playerAction: player2Action,
            opponentAction: player1Action,
            playerDamage: player2Damage,
            opponentDamage: player1Damage,
            playerHeal: player2Heal,
            opponentHeal: player1Heal,
            playerMPUsed: player2MPUsed,
            opponentMPUsed: player1MPUsed,
            playerDefenseUsed: player2DefenseUsed,
            opponentDefenseUsed: player1DefenseUsed,
            playerSkill: player2Skill,
            opponentSkill: player1Skill,
            playerHP: player2.hp,
            opponentHP: player1.hp,
            playerMP: player2.mp,
            opponentMP: player1.mp,
            playerAttackBonus: player2.attackBonus,
            playerAttackBonusTurns: player2.attackBonusTurns,
            opponentAttackBonus: player1.attackBonus,
            opponentAttackBonusTurns: player1.attackBonusTurns,
            turn: turn
        };
        
        // Send resolution to each player
        const player1Socket = io.sockets.sockets.get(player1.socketId);
        const player2Socket = io.sockets.sockets.get(player2.socketId);
        
        if (player1Socket) {
            player1Socket.emit('turnResolved', player1Resolution);
        }
        
        if (player2Socket) {
            player2Socket.emit('turnResolved', player2Resolution);
        }
        
        // Check for game over
        if (player1.hp <= 0 || player2.hp <= 0) {
            const winnerId = player1.hp > 0 ? player1Id : player2Id;
            const winnerName = winnerId; // Use player ID as name for now
            
            // Send game over to both players
            if (player1Socket) {
                player1Socket.emit('gameOver', { 
                    winner: player1.hp > 0 ? 'player' : 'opponent',
                    winnerId: winnerId,
                    winnerName: winnerName
                });
            }
            
            if (player2Socket) {
                player2Socket.emit('gameOver', { 
                    winner: player2.hp > 0 ? 'player' : 'opponent',
                    winnerId: winnerId,
                    winnerName: winnerName
                });
            }
            
            // Clean up session
            combatSessions.delete(roomId);
            console.log(`Game over in room ${roomId}. Winner: ${winner}`);
        } else {
            // Decrease attack bonus turn counters AFTER combat resolution
            // But don't decrease on the turn when Witch Leyline was just used
            if (player1.attackBonusTurns > 0 && !(player1Skill && player1Skill.special === 'enhance_attack_2_turns')) {
                player1.attackBonusTurns--;
                if (player1.attackBonusTurns === 0) {
                    player1.attackBonus = 0;
                }
            }
            if (player2.attackBonusTurns > 0 && !(player2Skill && player2Skill.special === 'enhance_attack_2_turns')) {
                player2.attackBonusTurns--;
                if (player2.attackBonusTurns === 0) {
                    player2.attackBonus = 0;
                }
            }
            
            // Clear actions for next turn
            player1.currentAction = null;
            player2.currentAction = null;
            player1.currentSkill = null;
            player2.currentSkill = null;
            player1.actionTurn = null;
            player2.actionTurn = null;
            
            session.currentTurn++;
        }
        
        console.log(`Turn ${turn} resolved. Player1 HP: ${player1.hp} MP: ${player1.mp}, Player2 HP: ${player2.hp} MP: ${player2.mp}`);
        
    } catch (error) {
        console.error('Error in combat turn resolution:', error);
    }
}

// AI skill selection function
function selectRandomAISkill(availableMP) {
    const aiSkills = [
        { id: 'dimensional_rift', name: 'Dimensional Rift', damage: 15, heal: 0, mpCost: 10, special: null },
        { id: 'hakurei_amulet', name: 'Hakurei Amulet', damage: 10, heal: 20, mpCost: 20, special: null },
        { id: 'heal', name: 'Heal', damage: 0, heal: 20, mpCost: 10, special: null },
        { id: 'illusion_laser', name: 'Illusion Laser', damage: 40, heal: 0, mpCost: 60, special: null },
        { id: 'love_sign_master_spark', name: 'Love Sign "Master Spark"', damage: 30, heal: 40, mpCost: 70, special: null },
        { id: 'magic_missile', name: 'Magic Missile', damage: 15, heal: 0, mpCost: 10, special: null },
        { id: 'spirit_sign_dream_seal', name: 'Spirit Sign "Dream Seal"', damage: 40, heal: 0, mpCost: 80, special: 'execute_low_hp' },
        { id: 'witch_leyline', name: 'Witch Leyline', damage: 15, heal: 0, mpCost: 20, special: 'enhance_attack' },
        { id: 'youkai_buster', name: 'Youkai Buster', damage: 30, heal: 0, mpCost: 50, special: null }
    ];

    // Filter skills by available MP
    const affordableSkills = aiSkills.filter(skill => skill.mpCost <= availableMP);
    
    if (affordableSkills.length === 0) {
        return null;
    }

    // Random selection with some preference for balanced skills
    const randomIndex = Math.floor(Math.random() * affordableSkills.length);
    return affordableSkills[randomIndex];
}

// Helper function to clean up empty rooms and invalid players
function cleanupRooms() {
    const roomsToDelete = [];
    
    for (const [roomId, room] of gameRooms.entries()) {
        // Remove players whose sockets are no longer connected
        const validPlayers = room.players.filter(player => {
            const socketId = playerSockets.get(player.id);
            return socketId && io.sockets.sockets.has(socketId);
        });
        
        if (validPlayers.length !== room.players.length) {
            console.log(`Cleaned up ${room.players.length - validPlayers.length} disconnected players from room ${roomId}`);
            room.players = validPlayers;
        }
        
        // Mark empty rooms for deletion
        if (room.players.length === 0) {
            roomsToDelete.push(roomId);
        } else {
            // Update room with cleaned players
            gameRooms.set(roomId, room);
        }
    }
    
    // Delete empty rooms
    roomsToDelete.forEach(roomId => {
        gameRooms.delete(roomId);
        console.log(`Cleaned up empty room: ${roomId}`);
    });
    
    if (roomsToDelete.length > 0) {
        // Broadcast updated room list (only multiplayer rooms)
        io.emit('roomList', Array.from(gameRooms.values()).filter(room => room.gameMode === 'match'));
    }
}

server.listen(4000, () => {
    console.log('Listening on port 4000');
    console.log('Combat system enabled');
    console.log('PvP Card game system enabled');
});
