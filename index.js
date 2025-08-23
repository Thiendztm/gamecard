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
    });
});

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
});
