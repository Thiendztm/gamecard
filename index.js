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
        }
    }
}));
app.use('/DesignHud', express.static(path.join(__dirname, 'DesignHud')));

// Game rooms storage
const gameRooms = new Map();
const playerRooms = new Map(); // Track which room each player is in
const playerSockets = new Map(); // Track socket ID for each player

// Combat game sessions
const combatSessions = new Map(); // Track active combat sessions

let emailConfig;
try {
    emailConfig = require('./email-config.js');
} catch (error) {
    console.warn('Email config file not found. Please create email-config.js from email-config.example.js');
    emailConfig = {
        service: 'gmail',
        auth: {
            user: 'nekohimeken@gmail.com',
            pass: 'rrme sewt tucm cfcu'
        },
        from: 'nekohimeken@gmail.com'
    };
}

const transporter = nodemailer.createTransport(emailConfig);

const verificationCodes = new Map();
const registeredUsers = new Map();

app.get('/healthcheck', (req, res) => {
  res.send('CBG App running...');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});

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
                message: 'Tài khoản không tồn tại' 
            });
        }

        // Compare password with hashed password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Mật khẩu không đúng' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!',
            user: {
                username: user.username,
                email: user.email
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

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Send current room list to new connection
    socket.emit('roomList', Array.from(gameRooms.values()));
    
    // Handle room creation
    socket.on('createRoom', (roomData) => {
        try {
            console.log('Creating room:', roomData);
            gameRooms.set(roomData.id, roomData);
            playerRooms.set(socket.id, roomData.id);
            
            // Track creator's socket
            if (roomData.players && roomData.players.length > 0) {
                playerSockets.set(roomData.players[0].id, socket.id);
            }
            
            // Join socket room
            socket.join(roomData.id);
            
            // Broadcast new room to all clients
            io.emit('roomCreated', roomData);
            
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
                // Randomly select a map
                const maps = ['map1.html', 'map2.html', 'map3.html', 'map4.html', 'map5.html'];
                const selectedMap = maps[Math.floor(Math.random() * maps.length)];
                
                // Start game for all players in room
                io.to(roomId).emit('gameStart', {
                    roomId: roomId,
                    players: room.players,
                    selectedMap: selectedMap
                });
                
                console.log(`Game started in room ${roomId} with map: ${selectedMap}`);
                
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
        socket.emit('roomList', Array.from(gameRooms.values()));
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
});

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
        // Broadcast updated room list
        io.emit('roomList', Array.from(gameRooms.values()));
    }
}

server.listen(4000, () => {
    console.log('Listening on port 4000');
    console.log('Combat system enabled');
});
